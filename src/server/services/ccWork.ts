import "server-only";
import { db } from "../db";
import { upsertNote, createNote } from "./library";
import { alertTech } from "../alerts";
import { html, notifyTech } from "../notify";
import { BLOCKED_ON_LABELS, STATUSES } from "@/lib/backlog-labels";
import { BLOCKED_ON, CLOSED_STATUSES, LEASE_MIN, RETURN_AFTER_STALE_MIN, canTransition, doneGate, isReady, needsReason, pickNext, readiness, readyNeedsGate, reviewGate, roleOf, scopeOverlap, SHA_RE, watchdogPlan, type CommentKind, type Role, type TaskStatusKey, unblockTarget, isCodeTask } from "@/lib/cc-flow";
import { nextIntakeKey, intakeTitle } from "@/lib/cc-lanes";
import { needsLibrary, buildSummaryText, buildLibraryTitle } from "@/lib/cc-overflow";
import type { Prisma, Task } from "@prisma/client";

/**
 * Работа над задачами Control Center: переходы между статусами с гейтами, аренда с пульсом, сторож.
 * Все изменения статуса — из интерфейса, API агентов и сторожа — идут через transition() или claim(),
 * поэтому правила одинаковы для всех и каждое изменение попадает в историю задачи.
 */

/** Ошибка с кодом: API отдаёт её агенту как есть, интерфейс показывает перевод */
export class CcError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
  }
}

export type Actor = { name: string; role: Role; via: "ui" | "api" | "watchdog" };

export const agentActor = (agent: string): Actor => ({ name: agent, role: roleOf(agent), via: "api" });
export const WATCHDOG: Actor = { name: "watchdog", role: "watchdog", via: "watchdog" };

const LEASE_MS = LEASE_MIN * 60_000;

export async function closedKeys() {
  const rows = await db.task.findMany({ where: { status: { in: CLOSED_STATUSES } }, select: { key: true } });
  return new Set(rows.map((t) => t.key));
}

async function log(taskId: string, actor: string, field: string, from: string | null, to: string | null) {
  await db.taskEvent.create({ data: { taskId, actor, field, from, to } });
}

async function say(taskId: string, author: string, kind: CommentKind, text: string, taskKey: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!needsLibrary(trimmed)) {
    await db.taskComment.create({ data: { taskId, author, kind, text: trimmed } });
    return;
  }
  // Текст длиннее лимита: полный материал — в Библиотеку, в ленте — резюме со ссылкой
  let libraryNoteId: string | null = null;
  try {
    const doc = await createNote({ title: buildLibraryTitle(taskKey, author, kind), kind: "knowledge", content: trimmed }, author);
    libraryNoteId = doc.slug;
  } catch {
    // Ошибка сохранения: храним обрезанный текст с пометкой
    await db.taskComment.create({ data: { taskId, author, kind, text: trimmed.slice(0, 4900) + "\n\n⚠️ Текст обрезан — не удалось сохранить в Библиотеку." } });
    return;
  }
  await db.taskComment.create({ data: { taskId, author, kind, text: buildSummaryText(trimmed, libraryNoteId), libraryNoteId } });
}

/** Каким видом записи ляжет текст перехода в ленту задачи */
function kindFor(from: string, to: string, actor: Actor, holder: string | null): CommentKind {
  if (actor.role === "watchdog") return "system";
  if (to === "review" || to === "done") return "report";
  if (from === "review" && to === "ready") return "review";
  if (from === "in_progress" && to === "ready" && holder === actor.name) return "handoff";
  return "note";
}

export type TransitionInput = {
  to: TaskStatusKey;
  /** Причина, отчёт или доказательство словами — смотря какой переход */
  text?: string;
  /** Обойти гейт: только владелец и техдиректор, всегда с причиной — попадает в историю */
  force?: boolean;
  /** Для «Заблокирована»: кто должен снять блокировку */
  blockedOn?: string;
  /** Для «Заблокирована»: дата автоматической разблокировки — в этот день сторож вернёт задачу на разбор */
  blockedUntil?: Date | null;
  /** Для «Сделано»: коммит в main, с которым задача выложена */
  sha?: string;
  /** Для «На проверке»: ветка, если не записана при аренде */
  branch?: string;
  /** «Что изменилось для людей» — 1–2 предложения простым языком для Release Notes */
  releaseNote?: string;
  /** Резюме для владельца: что сделано, что проверить, риск */
  ownerSummary?: string;
  /** Следующие шаги после приёмки: триаж заведёт карточки с зависимостью от этой */
  nextSteps?: string[];
  /** Код-задача, по которой работа оказалась не нужна: сдаётся без коммита, уходит на подтверждение тестировщику */
  noWork?: boolean;
};

/** Смена статуса с проверкой прав, гейтов и записью в историю. Возвращает обновлённую задачу */
export async function transition(key: string, input: TransitionInput, actor: Actor): Promise<Task> {
  const task = await db.task.findUnique({ where: { key }, include: { _count: { select: { attachments: true } } } });
  if (!task) throw new CcError("not_found");
  const from = task.status;
  const text = input.text?.trim() ?? "";
  const force = !!input.force && (actor.role === "owner" || actor.role === "cto");
  // «Разблокировать» возвращает задачу туда, откуда её заблокировали; явный целевой статус — только с force
  const to = from === "blocked" && input.to === "ready" && !force ? unblockTarget(task.blockedFrom, actor.role) : input.to;
  if (from === to) throw new CcError("same_status");
  if (to === "in_progress") throw new CcError("use_claim");
  if (!(STATUSES as Record<string, string>)[to]) throw new CcError("bad_status");
  if (!canTransition(from, to, actor.role) && !force) throw new CcError("forbidden_transition", `${from}→${to}`);
  // Триаж отменяет только входящие карточки IN-*, разобранные в настоящие задачи; остальное отменяет человек
  if (actor.role === "triage" && to === "cancelled" && !key.startsWith("IN-")) throw new CcError("forbidden_transition", "triage: cancel IN-* only");
  if ((needsReason(from, to) || force) && text.length < 5) throw new CcError("reason_required");
  // Задачу в работе сдаёт, передаёт или блокирует только тот, кто её держит
  if (from === "in_progress" && (actor.role === "dev" || actor.role === "nocode") && task.claimedBy && task.claimedBy !== actor.name) throw new CcError("not_your_task", task.claimedBy);

  const data: Prisma.TaskUpdateManyMutationInput = { status: to };
  // Решение по карточке из бэклога принято — триаж её больше не ждёт
  if (from === "backlog" && ["owner", "cto", "product", "triage"].includes(actor.role)) Object.assign(data, { triagedAt: new Date(), triagedBy: actor.name });
  // В очередь разработчикам — только готовое: из бэклога, блокировки или отмены задача идёт через проверку готовности
  if (to === "ready" && ["backlog", "blocked", "cancelled"].includes(from) && actor.role !== "watchdog" && !force) {
    const failed = readiness(task, await closedKeys(), task._count.attachments).filter((i) => i.hard && !i.ok);
    if (failed.some((i) => i.key === "mockup")) throw new CcError("mockup_required");
    if (failed.length) throw new CcError("not_ready", failed.map((i) => i.key).join(","));
  }
  // Гейт needs_open: задача с открытыми вопросами к продукту не идёт разработчику без решения
  if (to === "ready" && actor.role !== "watchdog") {
    const gate = readyNeedsGate(task.needs ?? [], actor.role, force);
    if (gate) throw new CcError(gate, task.needs?.[0]);
  }
  if (to === "review") {
    const branch = input.branch?.trim() || task.branch;
    const extra =
      input.releaseNote !== undefined || input.ownerSummary !== undefined
        ? { releaseNote: input.releaseNote, ownerSummary: input.ownerSummary, nextSteps: input.nextSteps, noWork: input.noWork }
        : undefined;
    // Возврат на проверку после блокировки: отчёт уже в ленте, нужна только ветка
    const gate = from === "blocked" ? (isCodeTask(task.layer) && !branch?.trim() && !input.noWork ? "branch_required" : null) : reviewGate({ layer: task.layer, branch }, text, extra);
    if (gate && !force) throw new CcError(gate);
    if (branch) data.branch = branch;
    if (input.releaseNote?.trim()) data.releaseNote = input.releaseNote.trim().slice(0, 500);
    if (input.ownerSummary?.trim()) data.ownerSummary = input.ownerSummary.trim().slice(0, 800);
    if (Array.isArray(input.nextSteps)) data.nextSteps = input.nextSteps.map((s) => s.trim()).filter(Boolean).slice(0, 20);
    if (input.noWork) data.noWork = true;
  }
  // Из блокировки обратно в бэклог — на новый разбор триажем: ответ человека мог всё изменить
  if (from === "blocked" && to === "backlog") Object.assign(data, { triagedAt: null, triagedBy: null });
  if (to === "done") {
    const gate = doneGate({ layer: task.layer, noWork: task.noWork }, { sha: input.sha, text, attachments: task._count.attachments });
    if (gate && !force) throw new CcError(gate);
    data.deployedSha = input.sha?.trim() || null;
    data.proof = text.slice(0, 2000) || null;
    data.doneAt = new Date();
  }
  if (to === "blocked") {
    const on = input.blockedOn || "tech";
    if (!(BLOCKED_ON as readonly string[]).includes(on)) throw new CcError("bad_blocked_on");
    data.blockedOn = on;
    data.blockedReason = text.slice(0, 2000) || null;
    data.blockedFrom = from;
    if (input.blockedUntil !== undefined) data.blockedUntil = input.blockedUntil;
  } else {
    data.blockedOn = null;
    data.blockedReason = null;
    data.blockedUntil = null;
  }
  // Уход из «В работе» снимает аренду. Ветка остаётся: следующий исполнитель продолжит с неё
  if (from === "in_progress") Object.assign(data, { claimedBy: null, claimUntil: null, staleAt: null, session: null });
  if (from === "review") Object.assign(data, { claimedBy: null, claimUntil: null });
  if (from === "review" && to === "ready") data.rework = { increment: 1 };
  // Проверка относится к конкретному коммиту: возврат на доработку и новая сдача её обнуляют
  if (to === "review" || (from === "review" && to === "ready")) Object.assign(data, { testedSha: null, testedBy: null, testedAt: null });
  if (from === "done") Object.assign(data, { doneAt: null, deployedSha: null, proof: null });

  // Условие на прежний статус: если кто-то успел изменить задачу раньше, не затираем его изменение
  const r = await db.task.updateMany({ where: { id: task.id, status: from }, data });
  if (!r.count) throw new CcError("conflict");

  await log(task.id, actor.name, "status", from, to);
  if (force) await log(task.id, actor.name, "forced", null, text.slice(0, 200));
  if (to === "blocked") await log(task.id, actor.name, "blockedOn", task.blockedOn, data.blockedOn as string);
  const extra = from === "done" && task.deployedSha ? `\nБыла выложена в ${task.deployedSha}.` : "";
  await say(task.id, actor.name, kindFor(from, to, actor, task.claimedBy), text + extra, key);
  if (to === "done" || to === "cancelled") await releaseDependents(key);
  // После приёмки не-код задачи с указанными следующими шагами — карточка в очередь триажа
  if (to === "done" && task.layer === "none" && task.nextSteps.length > 0) {
    await createNextStepsIntake(key, task.title, task.nextSteps, actor.name).catch(async (err) => {
      await say(task.id, "system", "note", `⚠️ Не удалось завести карточку следующих шагов: ${String(err).slice(0, 200)}`, key).catch(() => null);
    });
  }
  // task получен до обновления — передаём свежие значения из input для review-перехода
  const taskForBot = {
    ...task,
    ...(data.releaseNote !== undefined ? { releaseNote: data.releaseNote as string } : {}),
    ...(data.ownerSummary !== undefined ? { ownerSummary: data.ownerSummary as string } : {}),
  };
  await tellTeam(taskForBot, from, to, text, data.blockedOn as string | null, actor).catch(() => null);
  if (to === "done" && actor.role === "deployer") {
    await notifyTech(html`🚀 <b>Выложено: ${key}</b> ${task.title}${input.sha ? ` · ${input.sha.slice(0, 10)}` : ""}
${text.slice(0, 300)}`);
  }
  return db.task.findUniqueOrThrow({ where: { id: task.id } });
}

/**
 * Бот команды (Control Center → «Ключи»): владельцу приходит то, что ждёт его — вопрос на задаче, работа без кода
 * на приёмку — и что выложено. Бот не подключён — ничего не происходит
 */
async function tellTeam(
  task: { key: string; title: string; layer: string; releaseNote?: string | null; ownerSummary?: string | null },
  from: string,
  to: string,
  text: string,
  blockedOn: string | null,
  actor: Actor,
) {
  const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/ru/admin/control?task=${task.key}`;
  let msg = "";
  if (to === "blocked" && (blockedOn === "owner" || blockedOn === "product")) msg = html`✋ <b>${task.key}</b> ждёт вашего решения — ${task.title}\n\n${text.slice(0, 1200)}\n\nОтветьте в карточке: ${link}`;
  else if (to === "review" && task.layer === "none") {
    const summary = task.ownerSummary ? `\n\n${task.ownerSummary}` : "";
    msg = html`✅ <b>${task.key}</b> готово к приёмке — ${task.title}${summary}\n${link}`;
  } else if (to === "done" && actor.role === "deployer" && from === "review") {
    const note = task.releaseNote ? `\n${task.releaseNote}` : "";
    msg = html`🚀 Выложено: <b>${task.key}</b> ${task.title}${note}`;
  }
  if (!msg) return;
  const { notifyMembers } = await import("./teamBot");
  await notifyMembers(msg);
}

/** Задача закрылась: заблокированные только ею возвращаются в очередь; триажированные задачи бэклога — на разбор */
async function releaseDependents(key: string) {
  const closed = await closedKeys();
  // Заблокированные на зависимостях — в очередь (blockedOn=deps → ready)
  const blockedOnDeps = await db.task.findMany({ where: { status: "blocked", blockedOn: "deps", depends: { has: key } }, select: { key: true, depends: true } });
  for (const w of blockedOnDeps.filter((t) => t.depends.every((d) => closed.has(d)))) {
    await transition(w.key, { to: "ready", text: `Зависимости закрыты (последней — ${key}), задача вернулась в очередь.` }, WATCHDOG).catch(() => null);
  }
  // Триажированные задачи бэклога, ждавшие этой зависимости — снова на разбор
  const backlogWaiting = await db.task.findMany({ where: { status: "backlog", triagedAt: { not: null }, depends: { has: key } }, select: { key: true, depends: true } });
  for (const w of backlogWaiting.filter((t) => t.depends.every((d) => closed.has(d)))) {
    await retriage(w.key);
  }
}

export type ClaimOptions = {
  key?: string;
  area?: string;
  layer?: string;
  priority?: string;
  branch?: string;
  session?: string;
  /** Автономный воркер: только код-задачи без открытых вопросов к продукту — остальное людям и чатам */
  auto?: boolean;
};

/**
 * Аренда задачи исполнителем. С ключом — конкретная задача, без ключа — следующая подходящая из «В очереди».
 * Одна задача — один исполнитель, один исполнитель — одна задача. Своя задача в работе продлевается
 * (продолжение в новом чате), брошенную чужую можно перехватить, когда её аренда истекла.
 */
export async function claim(agent: string, opts: ClaimOptions = {}): Promise<Task | null> {
  const actor = agentActor(agent);
  // Деплоер задачи не берёт: кто выкладывает, тот не пишет — иначе пропадает вторая пара глаз
  if (actor.role === "deployer" || actor.role === "watchdog" || actor.role === "triage") throw new CcError("forbidden_role", actor.role);
  const closed = await closedKeys();
  const now = new Date();

  // Заявки одного агента выполняются строго по очереди: блокировка в базе на время транзакции.
  // Без неё два чата, стартовавшие одновременно под одним именем, оба получили бы по задаче
  const res = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cc-agent:${agent}`}))`;
      const held = await tx.task.findFirst({ where: { status: "in_progress", claimedBy: agent }, select: { key: true } });
      if (held && held.key !== opts.key) throw new CcError("agent_busy", held.key);
      const busy = await tx.task.findMany({ where: { status: "in_progress", claimedBy: { not: agent } }, select: { key: true, scope: true } });
      const lease = (t: Task) => ({
        claimedBy: agent,
        claimUntil: new Date(now.getTime() + LEASE_MS),
        heartbeatAt: now,
        staleAt: null,
        session: opts.session?.slice(0, 100) || null,
        branch: opts.branch?.trim() || t.branch || `task/${t.key}`,
        startedAt: t.startedAt ?? now,
      });

      if (opts.key) {
        const t = await tx.task.findUnique({ where: { key: opts.key } });
        if (!t) throw new CcError("not_found");
        // Своя задача: продолжение в новом чате или повтор команды — просто продлеваем аренду
        if (t.status === "in_progress" && t.claimedBy === agent) {
          const task = await tx.task.update({ where: { id: t.id }, data: lease(t) });
          return { task, event: "resume" as const, prev: t };
        }
        const takeover = t.status === "in_progress" && !!t.claimedBy && (!t.claimUntil || t.claimUntil < now);
        if (t.status === "in_progress" && !takeover) throw new CcError("claimed", t.claimedBy ?? "");
        if (t.status !== "ready" && !takeover) throw new CcError("not_ready_status", t.status);
        // Воркер «Продукт и не-код» берёт только задачи без кода: код пишет разработчик, проверяет тестировщик
        if (actor.role === "nocode" && t.layer !== "none") throw new CcError("forbidden_role", "nocode: code task");
        const missing = t.depends.filter((d) => !closed.has(d));
        if (missing.length && !takeover) throw new CcError("deps_open", missing.join(","));
        const clash = busy.filter((b) => b.key !== t.key && scopeOverlap(t.scope, b.scope).length > 0);
        if (clash.length) throw new CcError("scope_conflict", clash.map((c) => c.key).join(","));
        const r = await tx.task.updateMany({
          where: takeover ? { id: t.id, status: "in_progress", claimedBy: t.claimedBy } : { id: t.id, status: "ready" },
          data: { status: "in_progress", ...lease(t), ...(takeover ? { reclaims: { increment: 1 } } : {}) },
        });
        if (!r.count) throw new CcError("conflict");
        return { task: await tx.task.findUniqueOrThrow({ where: { id: t.id } }), event: takeover ? ("takeover" as const) : ("claim" as const), prev: t };
      }

      const filter: Prisma.TaskWhereInput = { status: "ready" };
      if (opts.area) filter.area = opts.area;
      if (opts.layer) filter.layer = opts.layer;
      if (opts.priority) filter.priority = opts.priority;
      if (actor.role === "nocode") Object.assign(filter, { layer: "none", needs: { isEmpty: true } });
      else if (opts.auto) Object.assign(filter, { layer: opts.layer ?? { not: "none" }, owner: { not: "product" }, needs: { isEmpty: true } });
      const candidates = await tx.task.findMany({ where: filter, take: 200 });
      const exclude = new Set<string>();
      // Несколько попыток на случай гонки: два исполнителя одновременно выбрали одну задачу
      for (let attempt = 0; attempt < 3; attempt++) {
        const t = pickNext(
          candidates.filter((c) => !exclude.has(c.key)),
          closed,
          busy.map((b) => b.scope),
        );
        if (!t) return null;
        const r = await tx.task.updateMany({ where: { id: t.id, status: "ready" }, data: { status: "in_progress", ...lease(t) } });
        if (r.count) return { task: await tx.task.findUniqueOrThrow({ where: { id: t.id } }), event: "claim" as const, prev: t };
        exclude.add(t.key);
      }
      return null;
    },
    { maxWait: 20_000, timeout: 20_000 },
  );
  if (!res) return null;

  const { task, event, prev } = res;
  if (event === "resume" && prev.staleAt) await log(task.id, agent, "health", "stale", "ok");
  if (event === "claim") await log(task.id, agent, "status", "ready", "in_progress");
  if (event === "takeover") {
    await log(task.id, agent, "claimedBy", prev.claimedBy, agent);
    await say(task.id, "watchdog", "system", `Задачу перехватил ${agent}: аренда ${prev.claimedBy} истекла. Продолжение — с ветки ${task.branch}.`, task.key);
  }
  return task;
}

export type Pulse = { ok: true; until: Date } | { ok: false; lost: boolean; status?: string; holder?: string | null };

/**
 * Пульс исполнителя: продлевает аренду. Если задачу уже вернули в очередь или перехватили —
 * отвечает lost, чтобы исполнитель остановился и не пушил поверх чужой работы.
 */
export async function heartbeat(key: string, agent: string, extra: { branch?: string; session?: string } = {}): Promise<Pulse> {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true, branch: true, staleAt: true } });
  if (!t) return { ok: false, lost: false };
  // Держать можно задачу в работе (разработчик) или на проверке (тестировщик, деплоер)
  if (!["in_progress", "review"].includes(t.status) || t.claimedBy !== agent) return { ok: false, lost: true, status: t.status, holder: t.claimedBy };
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS);
  await db.task.update({
    where: { id: t.id },
    data: {
      claimUntil: until,
      heartbeatAt: now,
      staleAt: null,
      ...(extra.branch && !t.branch ? { branch: extra.branch } : {}),
      ...(extra.session ? { session: extra.session.slice(0, 100) } : {}),
    },
  });
  if (t.staleAt) await log(t.id, agent, "health", "stale", "ok");
  return { ok: true, until };
}

/** Запись в ленту задачи от агента. Запись исполнителя по своей задаче заодно считается пульсом */
/**
 * Итог триажа карточки: когда и кем разобрана, вердикт — в ленту. Статус меняется отдельными переходами
 * (ready, block); здесь — только отметка, после которой карточка уходит из очереди триажа
 */
export async function markTriaged(key: string, agent: string, text: string) {
  const role = roleOf(agent);
  if (!["triage", "cto", "product", "owner"].includes(role)) throw new CcError("forbidden_role", role);
  if (text.trim().length < 10) throw new CcError("reason_required");
  const t = await db.task.findUnique({ where: { key }, select: { id: true } });
  if (!t) throw new CcError("not_found");
  // Гонка: владелец мог ответить пока триаж обрабатывал задачу.
  // retriage() фиксирует момент отправки на разбор — если после него есть человеческий ответ, не затираем его.
  const lastRetriage = await db.taskEvent.findFirst({ where: { taskId: t.id, field: "retriage" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (lastRetriage) {
    const freshAnswer = await db.taskComment.findFirst({ where: { taskId: t.id, kind: { notIn: ["system", "triage"] }, createdAt: { gt: lastRetriage.createdAt } } });
    if (freshAnswer) {
      await say(t.id, agent, "system", "Триаж завершён, но после отправки на разбор пришёл ответ человека — задача остаётся в очереди триажа.", key);
      return;
    }
  }
  await db.task.update({ where: { key }, data: { triagedAt: new Date(), triagedBy: agent, triageNote: text.trim().slice(0, 1000) } });
  await say(t.id, agent, "triage", text, key);
  await log(t.id, agent, "triaged", null, text.trim().slice(0, 120));
}

/** Человек ответил в ленте задачи, заблокированной на нём, или поправил карточку бэклога — триаж посмотрит её снова */
export async function retriage(key: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, blockedOn: true, triagedAt: true } });
  if (!t || !t.triagedAt) return;
  // blockedOn=design добавлен: утверждение дизайна с открытыми вопросами должно попасть к триажу
  if (t.status !== "backlog" && !(t.status === "blocked" && (t.blockedOn === "owner" || t.blockedOn === "product" || t.blockedOn === "design"))) return;
  await db.task.update({ where: { id: t.id }, data: { triagedAt: null } });
  // Событие retriage нужно markTriaged(), чтобы не затереть свежий ответ человека
  await db.taskEvent.create({ data: { taskId: t.id, actor: "system", field: "retriage", from: null, to: "pending" } });
}

export async function agentNote(key: string, agent: string, kind: CommentKind, text: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true } });
  if (!t) throw new CcError("not_found");
  if (text.trim().length < 2) throw new CcError("text_required");
  await say(t.id, agent, kind, text, key);
  if (["in_progress", "review"].includes(t.status) && t.claimedBy === agent) await heartbeat(key, agent);
  if (kind === "error" && roleOf(agent) === "deployer") await alertTech(`cc:error:${key}`, html`❌ <b>${key}</b> · ${agent}
${text.slice(0, 400)}`, 5);
}

/**
 * Аренда задачи «На проверке» тестировщиком или деплоером: статус не меняется, но второй проверяющий
 * или деплоер её не возьмёт. Истёкшую аренду снимает сторож
 */
export async function reviewTake(key: string, agent: string) {
  const role = roleOf(agent);
  if (role !== "tester" && role !== "deployer") throw new CcError("forbidden_role", role);
  const now = new Date();
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, branch: true, claimedBy: true, claimUntil: true, testedSha: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "review") throw new CcError("wrong_status", t.status);
  if (t.claimedBy && t.claimedBy !== agent && t.claimUntil && t.claimUntil > now) throw new CcError("claimed", t.claimedBy);
  // Старые карточки сданы без записи ветки — по правилам проекта она task/<КЛЮЧ>; есть ли она в репозитории, проверит cc.mjs
  const r = await db.task.updateMany({
    where: { id: t.id, status: "review", OR: [{ claimedBy: null }, { claimedBy: agent }, { claimUntil: null }, { claimUntil: { lt: now } }] },
    data: { claimedBy: agent, claimUntil: new Date(now.getTime() + LEASE_MS), heartbeatAt: now, ...(t.branch ? {} : { branch: `task/${key}` }) },
  });
  if (!r.count) throw new CcError("conflict");
  if (t.claimedBy !== agent) await log(t.id, agent, "claimedBy", t.claimedBy, agent);
  return db.task.findUniqueOrThrow({ where: { id: t.id } });
}

/** Тестировщик: проверка пройдена. Для noWork-задач SHA не требуется; задача сразу отменяется как «не потребовалось» */
export async function testPass(key: string, agent: string, sha: string, text: string) {
  if (roleOf(agent) !== "tester") throw new CcError("forbidden_role", roleOf(agent));
  if (text.trim().length < 40) throw new CcError("report_required");
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true, noWork: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "review") throw new CcError("wrong_status", t.status);
  if (t.claimedBy !== agent) throw new CcError("not_your_task", t.claimedBy ?? "");
  if (!t.noWork && !SHA_RE.test(sha.trim())) throw new CcError("sha_required");
  const safeSha = t.noWork ? "no-work" : sha.trim();
  await db.task.update({ where: { id: t.id }, data: { testedSha: safeSha, testedBy: agent, testedAt: new Date(), claimedBy: null, claimUntil: null } });
  await log(t.id, agent, "tested", null, safeSha.slice(0, 10));
  if (t.noWork) {
    // Работа не потребовалась: тестировщик подтвердил — задача закрывается как «не потребовалось»
    await say(t.id, agent, "review", `✅ Подтверждено: работа не потребовалась.\n${text.trim()}`, key);
    await transition(key, { to: "cancelled", text: "Тестировщик подтвердил: изменения кода не потребовались.", force: true }, { name: agent, role: "tester", via: "api" });
    return db.task.findUniqueOrThrow({ where: { id: t.id } });
  }
  await say(t.id, agent, "review", `✅ Протестировано на коммите ${sha.trim().slice(0, 10)}.\n${text.trim()}`, key);
  return db.task.findUniqueOrThrow({ where: { id: t.id } });
}

/** Снять свою аренду с задачи на проверке без решения (например, не хватило времени) */
export async function reviewRelease(key: string, agent: string, text: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "review" || t.claimedBy !== agent) throw new CcError("not_your_task", t.claimedBy ?? "");
  await db.task.update({ where: { id: t.id }, data: { claimedBy: null, claimUntil: null } });
  await log(t.id, agent, "claimedBy", agent, null);
  await say(t.id, agent, "note", text, key);
}

/** Какой статус был у задачи до того, как её взяли в работу: брошенная возвращается туда же */
async function statusBeforeClaim(taskId: string): Promise<"ready" | "backlog"> {
  const e = await db.taskEvent.findFirst({ where: { taskId, field: "status", to: "in_progress" }, orderBy: { createdAt: "desc" }, select: { from: true } });
  return e?.from === "ready" ? "ready" : "backlog";
}

const clock = (d: Date | null) => (d ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) : "—");

/**
 * Сторож (раз в 15 минут из /api/cron): замечает брошенные задачи и сообщает в тех-чат,
 * через RETURN_AFTER_STALE_MIN возвращает их в очередь с сохранённой веткой, снимает блокировки
 * по закрытым зависимостям, напоминает о затянувшейся проверке. Ничего не удаляет.
 */
export async function runWatchdog(now = new Date()) {
  const tasks = await db.task.findMany({
    where: { status: { in: ["in_progress", "review", "blocked"] } },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      claimedBy: true,
      claimUntil: true,
      heartbeatAt: true,
      assignee: true,
      staleAt: true,
      updatedAt: true,
      blockedOn: true,
      blockedUntil: true,
      depends: true,
      rework: true,
      reclaims: true,
      branch: true,
    },
  });
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const closed = await closedKeys();
  const plan = watchdogPlan(tasks, closed, now);
  const hours = Math.round(RETURN_AFTER_STALE_MIN / 60);

  for (const key of plan.markStale) {
    const t = byKey.get(key)!;
    await db.task.updateMany({ where: { id: t.id, staleAt: null }, data: { staleAt: now } });
    await log(t.id, "watchdog", "health", "ok", "stale");
    await say(
      t.id,
      "watchdog",
      "system",
      `Аренда истекла: ${t.claimedBy} молчит с ${clock(t.heartbeatAt ?? t.claimUntil)}. Если чат жив, первый же пульс снимет отметку. ` +
        `Если нет — через ${hours} ч задача вернётся в очередь${t.branch ? `, ветка ${t.branch} сохранится` : ""}.`,
      key,
    );
    await alertTech(`cc:stale:${key}`, html`🪦 <b>${key}</b> похоже брошена: ${t.claimedBy ?? "?"} молчит с ${clock(t.heartbeatAt ?? t.claimUntil)}\n${t.title}\nЧерез ${hours} ч вернётся в очередь сама.`, 12 * 60);
  }

  for (const key of plan.revive) {
    const t = byKey.get(key)!;
    await db.task.update({ where: { id: t.id }, data: { staleAt: null } });
    await log(t.id, "watchdog", "health", "stale", "ok");
  }

  for (const key of plan.autoReturn) {
    const t = byKey.get(key)!;
    const back = await statusBeforeClaim(t.id);
    const r = await db.task.updateMany({
      where: { id: t.id, status: "in_progress", claimedBy: t.claimedBy, claimUntil: { lt: now } },
      data: { status: back, claimedBy: null, claimUntil: null, staleAt: null, session: null, reclaims: { increment: 1 } },
    });
    if (!r.count) continue;
    const last = await db.taskComment.findFirst({ where: { taskId: t.id, author: t.claimedBy ?? "" }, orderBy: { createdAt: "desc" }, select: { text: true } });
    await log(t.id, "watchdog", "status", "in_progress", back);
    await say(
      t.id,
      "watchdog",
      "system",
      `Сторож вернул задачу в «${STATUSES[back]}»: ${t.claimedBy} молчал с ${clock(t.heartbeatAt ?? t.claimUntil)}. ` +
        (t.branch ? `Ветка ${t.branch} сохранена — продолжать с неё (git log main..origin/${t.branch}).` : "Ветки у задачи не было.") +
        (last ? `\nПоследняя запись исполнителя: «${last.text.slice(0, 400)}»` : "\nОтчётов от исполнителя не было."),
      key,
    );
    await alertTech(`cc:return:${key}`, html`↩️ <b>${key}</b> возвращена в очередь сторожем: ${t.claimedBy ?? "?"} не отвечал.\n${t.title}`, 60);
  }

  for (const key of plan.releaseLease) {
    const t = byKey.get(key)!;
    const r = await db.task.updateMany({ where: { id: t.id, status: "review", claimedBy: t.claimedBy, claimUntil: t.claimUntil }, data: { claimedBy: null, claimUntil: null } });
    if (!r.count) continue;
    await log(t.id, "watchdog", "claimedBy", t.claimedBy, null);
    await say(t.id, "watchdog", "system", `${t.claimedBy} держал задачу на проверке и замолчал с ${clock(t.heartbeatAt ?? t.claimUntil)} — аренда снята, задача снова в очереди проверки.`, key);
  }

  for (const key of plan.unblock) {
    await transition(key, { to: "ready", text: "Все зависимости закрыты — задача вернулась в очередь." }, WATCHDOG).catch(() => null);
  }

  for (const key of plan.unblockScheduled) {
    const t = byKey.get(key)!;
    const dateStr = t.blockedUntil
      ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "long" }).format(t.blockedUntil)
      : "";
    await transition(
      key,
      { to: "backlog", text: `Наступила дата плановой разблокировки${dateStr ? ` (${dateStr})` : ""}. Задача возвращена на разбор.` },
      WATCHDOG,
    ).catch(() => null);
  }

  if (plan.phantom.length) {
    await alertTech("cc:phantom", html`👻 «В работе», но никто не держит: ${plan.phantom.join(", ")}\nВернуть в очередь или взять — в Control Center.`, 24 * 60);
  }
  if (plan.stuckReview.length) {
    await alertTech("cc:review", html`⏳ Ждут проверки дольше суток: ${plan.stuckReview.join(", ")}\nОчередь деплоера: /admin/control?status=review`, 24 * 60);
  }

  // Догоняющий возврат на разбор: задачи в бэклоге, разобранные, но все зависимости уже закрыты.
  // releaseDependents() срабатывает при закрытии конкретной задачи, но пропускает случаи, когда
  // зависимость закрылась раньше триажа (или до введения DEV-55). Сторож находит их и возвращает.
  // Ограничение: не чаще раза в сутки на задачу (поле retriage в истории событий).
  const backlogTriaged = await db.task.findMany({
    where: { status: "backlog", triagedAt: { not: null }, depends: { isEmpty: false } },
    select: {
      key: true,
      depends: true,
      events: {
        where: { field: "retriage", createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
        select: { createdAt: true },
        take: 1,
      },
    },
  });
  let catchUpRetriaged = 0;
  for (const t of backlogTriaged) {
    if (t.depends.every((d) => closed.has(d)) && t.events.length === 0) {
      await retriage(t.key);
      catchUpRetriaged++;
    }
  }

  return { stale: plan.markStale.length, returned: plan.autoReturn.length, unblocked: plan.unblock.length, phantom: plan.phantom.length, stuckReview: plan.stuckReview.length, releasedLeases: plan.releaseLease.length, scheduledUnblocks: plan.unblockScheduled.length, catchUpRetriaged };
}

/** Подписи для писем сторожа и интерфейса: кто должен снять блокировку */
export const blockedOnLabel = (v: string | null) => (v ? (BLOCKED_ON_LABELS[v] ?? v) : "");

/** Проверка готовности задачи к работе — для карточки и API */
export async function taskReadiness(key: string) {
  const t = await db.task.findUnique({ where: { key }, include: { _count: { select: { attachments: true } } } });
  if (!t) throw new CcError("not_found");
  const items = readiness(t, await closedKeys(), t._count.attachments);
  return { items, ready: isReady(items) };
}

/**
 * Утверждение макета задачи: владелец, техдиректор или продукт подтверждают, что макет согласован.
 * После утверждения гейт mockup_required снимается и задачу можно переводить в «В очереди».
 * Запись о решении попадает в ленту с именем утверждающего
 */
/**
 * Утвердить дизайн задачи: снимает гейт «нужен макет» и кладёт дизайн в Библиотеку записью «Дизайн: КЛЮЧ — …» —
 * это канон, от него строят разработчики. Утвердить можно любую задачу с описанием дизайна, макетом или файлами;
 * повторное утверждение после правок — новая версия той же записи
 */
/**
 * closeNeeds — список вопросов из needs, которые владелец явно снял при утверждении.
 * Все пункты со словом «макет» убираются автоматически.
 */
export async function approveMockup(key: string, actor: Actor, comment: string | null, closeNeeds?: string[]) {
  const t = await db.task.findUnique({ where: { key }, include: { attachments: { select: { fileName: true, url: true } } } });
  if (!t) throw new CcError("not_found");
  if (!t.design?.trim() && !t.mockupUrl && !t.attachments.length) throw new CcError("no_design");
  const now = new Date();
  const canon = await designToCanon(t, actor.name, comment);
  // Убрать пункты про макет и явно закрытые вопросы
  const toClose = new Set(closeNeeds ?? []);
  const needsClean = t.needs.filter((n) => !/макет/i.test(n) && !toClose.has(n));
  await db.task.update({
    where: { key },
    data: { mockupApprovedBy: actor.name, mockupApprovedAt: now, ...(needsClean.length !== t.needs.length ? { needs: needsClean } : {}) },
  });
  await log(t.id, actor.name, "mockupApprovedBy", t.mockupApprovedBy, actor.name);
  const text = `${comment ? `Дизайн утверждён: ${comment.trim().slice(0, 500)}` : "Дизайн утверждён."}\nВ Библиотеке: ${canon.slug} (версия ${canon.version}).`;
  await say(t.id, actor.name, "note", text, key);
  // Если задача заблокирована на дизайне — снять блокировку, вернуть туда, откуда заблокировали
  if (t.status === "blocked" && t.blockedOn === "design") {
    const target = unblockTarget(t.blockedFrom, actor.role);
    try {
      await transition(key, { to: target, text: "Дизайн утверждён, задача возвращена." }, actor);
    } catch (e) {
      const code = e instanceof CcError ? e.code : "transition_error";
      const detail = e instanceof CcError && e.detail ? `: ${e.detail}` : "";
      // Системная запись с кодом отказа — владелец видит причину в ленте
      await say(t.id, actor.name, "system", `Дизайн утверждён, но вернуть задачу не удалось (${code}${detail}). Передано триажу.`, key);
      await log(t.id, actor.name, "unblock_failed", null, `${code}${detail}`);
      // Открытые вопросы → в очередь триажа, чтобы он принял решение
      await retriage(key);
    }
  }
  // Если задача в бэклоге — снова на разбор: утверждение макета могло снять последний блокер
  if (t.status === "backlog") await retriage(key);
  return db.task.findUniqueOrThrow({ where: { key } });
}

/** Утверждённый дизайн — запись Библиотеки вида «спецификация» с постоянным slug design-<ключ> */
async function designToCanon(t: { key: string; title: string; design: string | null; mockupUrl: string | null; summary: string; attachments: { fileName: string; url: string }[] }, actor: string, comment: string | null) {
  const when = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const lines = [
    `# Дизайн: ${t.key} — ${t.title}`,
    "",
    `Утвердил ${actor}, ${when}.${comment ? ` ${comment.trim()}` : ""} Задача: ${t.key}.`,
    "",
    "## Зачем",
    "",
    t.summary.trim(),
    "",
    "## Дизайн",
    "",
    t.design?.trim() || "_Описания в карточке нет — смотрите макет и файлы._",
  ];
  if (t.mockupUrl) lines.push("", "## Макет", "", t.mockupUrl);
  if (t.attachments.length) lines.push("", "## Файлы", "", ...t.attachments.map((a) => `- [${a.fileName}](${a.url})`));
  return upsertNote(`design-${t.key.toLowerCase()}`, { title: `Дизайн: ${t.key} — ${t.title}`, kind: "spec", content: lines.join("\n"), note: comment?.trim() || "утверждение дизайна" }, actor);
}

/** Сменить адресата блокировки с записью в историю — используется командой reblock */
export async function reblockOn(key: string, newBlockedOn: string, reason: string, actor: Actor): Promise<Task> {
  if (!(BLOCKED_ON as readonly string[]).includes(newBlockedOn)) throw new CcError("bad_blocked_on");
  if (reason.trim().length < 5) throw new CcError("reason_required");
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, blockedOn: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "blocked") throw new CcError("wrong_status", t.status);
  const prev = t.blockedOn;
  await db.task.update({ where: { id: t.id }, data: { blockedOn: newBlockedOn, blockedReason: reason.trim().slice(0, 200) } });
  await log(t.id, actor.name, "blockedOn", prev, newBlockedOn);
  await say(t.id, actor.name, "note", `Адресат блокировки изменён: ${prev ?? "—"} → ${newBlockedOn}. ${reason.trim()}`, key);
  return db.task.findUniqueOrThrow({ where: { id: t.id } });
}

/** Вернуть дизайн дизайнеру: задача блокируется на дизайне с причиной, утверждение и ссылка на макет снимаются */
export async function returnDesign(key: string, actor: Actor, reason: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true } });
  if (!t) throw new CcError("not_found");
  if (reason.trim().length < 5) throw new CcError("reason_required");
  // Сбросить утверждение и ссылку на макет: дизайнер должен сделать новый макет с чистого листа
  await db.task.update({ where: { key }, data: { mockupApprovedBy: null, mockupApprovedAt: null, mockupUrl: null } });
  if (t.status !== "blocked") return transition(key, { to: "blocked", blockedOn: "design", text: `Дизайн возвращён: ${reason.trim()}` }, actor);
  await say(t.id, actor.name, "note", `Дизайн возвращён: ${reason.trim()}`, key);
  return db.task.findUniqueOrThrow({ where: { key } });
}

/**
 * Создаёт intake-карточку IN-N с указанием следующих шагов после принятия задачи.
 * Не импортирует из ccBoard.ts (цикл: ccBoard → cc.ts → ccWork.ts), поэтому реализация встроена.
 */
async function createNextStepsIntake(doneKey: string, doneTitle: string, steps: string[], by: string) {
  if (!steps.length) return;
  const existing = (await db.task.findMany({ where: { key: { startsWith: "IN-" } }, select: { key: true } })).map((t) => t.key);
  const sort = ((await db.task.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 1;
  const text = `Следующие шаги после приёмки ${doneKey} «${doneTitle}»:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = nextIntakeKey(existing);
    try {
      const task = await db.task.create({
        data: {
          key,
          title: intakeTitle(text),
          summary: text.slice(0, 2000),
          area: "product",
          layer: "none",
          priority: "p2",
          stage: "later",
          owner: "product",
          source: "intake",
          createdBy: by,
          status: "backlog",
          depends: [doneKey],
          sort,
        },
      });
      await db.taskEvent.create({ data: { taskId: task.id, actor: by, field: "created", from: null, to: key } });
      return task;
    } catch {
      existing.push(key);
    }
  }
}
