import "server-only";
import { db } from "../db";
import { alertTech } from "../alerts";
import { html } from "../notify";
import { BLOCKED_ON_LABELS, STATUSES } from "@/lib/backlog-labels";
import { BLOCKED_ON, CLOSED_STATUSES, LEASE_MIN, RETURN_AFTER_STALE_MIN, canTransition, doneGate, isReady, needsReason, pickNext, readiness, reviewGate, roleOf, scopeOverlap, SHA_RE, watchdogPlan, type CommentKind, type Role, type TaskStatusKey, unblockTarget, isCodeTask } from "@/lib/cc-flow";
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

async function say(taskId: string, author: string, kind: CommentKind, text: string) {
  if (text.trim()) await db.taskComment.create({ data: { taskId, author, kind, text: text.trim().slice(0, 5000) } });
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
  /** Для «Сделано»: коммит в main, с которым задача выложена */
  sha?: string;
  /** Для «На проверке»: ветка, если не записана при аренде */
  branch?: string;
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
    if (failed.length) throw new CcError("not_ready", failed.map((i) => i.key).join(","));
  }
  if (to === "review") {
    const branch = input.branch?.trim() || task.branch;
    // Возврат на проверку после блокировки: отчёт уже в ленте, нужна только ветка
    const gate = from === "blocked" ? (isCodeTask(task.layer) && !branch?.trim() ? "branch_required" : null) : reviewGate({ layer: task.layer, branch }, text);
    if (gate && !force) throw new CcError(gate);
    if (branch) data.branch = branch;
  }
  // Из блокировки обратно в бэклог — на новый разбор триажем: ответ человека мог всё изменить
  if (from === "blocked" && to === "backlog") Object.assign(data, { triagedAt: null, triagedBy: null });
  if (to === "done") {
    const gate = doneGate({ layer: task.layer }, { sha: input.sha, text, attachments: task._count.attachments });
    if (gate && !force) throw new CcError(gate);
    data.deployedSha = input.sha?.trim() || null;
    data.proof = text.slice(0, 2000) || null;
    data.doneAt = new Date();
  }
  if (to === "blocked") {
    const on = input.blockedOn || "tech";
    if (!(BLOCKED_ON as readonly string[]).includes(on)) throw new CcError("bad_blocked_on");
    data.blockedOn = on;
    data.blockedReason = text.slice(0, 200) || null;
    data.blockedFrom = from;
  } else {
    data.blockedOn = null;
    data.blockedReason = null;
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
  await say(task.id, actor.name, kindFor(from, to, actor, task.claimedBy), text + extra);
  if (to === "done" || to === "cancelled") await releaseDependents(key);
  await tellTeam(task, from, to, text, data.blockedOn as string | null, actor).catch(() => null);
  if (to === "done" && actor.role === "deployer") {
    await alertTech(`cc:done:${key}`, html`🚀 <b>Выложено: ${key}</b> ${task.title}${input.sha ? ` · ${input.sha.slice(0, 10)}` : ""}
${text.slice(0, 300)}`, 1);
  }
  return db.task.findUniqueOrThrow({ where: { id: task.id } });
}

/**
 * Бот команды (Control Center → «Ключи»): владельцу приходит то, что ждёт его — вопрос на задаче, работа без кода
 * на приёмку — и что выложено. Бот не подключён — ничего не происходит
 */
async function tellTeam(task: { key: string; title: string; layer: string }, from: string, to: string, text: string, blockedOn: string | null, actor: Actor) {
  const link = `${(process.env.APP_URL || "").replace(/\/$/, "")}/ru/admin/control?task=${task.key}`;
  let msg = "";
  if (to === "blocked" && (blockedOn === "owner" || blockedOn === "product")) msg = html`✋ <b>${task.key}</b> ждёт вашего решения — ${task.title}\n\n${text.slice(0, 1200)}\n\nОтветьте в карточке: ${link}`;
  else if (to === "review" && task.layer === "none") msg = html`✅ <b>${task.key}</b> готово к приёмке — ${task.title}\n${link}`;
  else if (to === "done" && actor.role === "deployer" && from === "review") msg = html`🚀 Выложено: <b>${task.key}</b> ${task.title}`;
  if (!msg) return;
  const { notifyMembers } = await import("./teamBot");
  await notifyMembers(msg);
}

/** Задача закрылась: те, кто был заблокирован только ею, возвращаются в очередь */
async function releaseDependents(key: string) {
  const waiting = await db.task.findMany({ where: { status: "blocked", blockedOn: "deps", depends: { has: key } }, select: { key: true, depends: true } });
  if (!waiting.length) return;
  const closed = await closedKeys();
  for (const w of waiting.filter((t) => t.depends.every((d) => closed.has(d)))) {
    await transition(w.key, { to: "ready", text: `Зависимости закрыты (последней — ${key}), задача вернулась в очередь.` }, WATCHDOG).catch(() => null);
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
    await say(task.id, "watchdog", "system", `Задачу перехватил ${agent}: аренда ${prev.claimedBy} истекла. Продолжение — с ветки ${task.branch}.`);
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
  await db.task.update({ where: { key }, data: { triagedAt: new Date(), triagedBy: agent, triageNote: text.trim().slice(0, 1000) } });
  await say(t.id, agent, "triage", text);
  await log(t.id, agent, "triaged", null, text.trim().slice(0, 120));
}

/** Человек ответил в ленте задачи, заблокированной на нём, или поправил карточку бэклога — триаж посмотрит её снова */
export async function retriage(key: string) {
  await db.task.updateMany({
    where: { key, triagedAt: { not: null }, OR: [{ status: "backlog" }, { status: "blocked", blockedOn: { in: ["owner", "product"] } }] },
    data: { triagedAt: null },
  });
}

export async function agentNote(key: string, agent: string, kind: CommentKind, text: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true } });
  if (!t) throw new CcError("not_found");
  if (text.trim().length < 2) throw new CcError("text_required");
  await say(t.id, agent, kind, text);
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

/** Тестировщик: проверка пройдена на конкретном коммите ветки. Новый коммит в ветке потребует новой проверки */
export async function testPass(key: string, agent: string, sha: string, text: string) {
  if (roleOf(agent) !== "tester") throw new CcError("forbidden_role", roleOf(agent));
  if (!SHA_RE.test(sha.trim())) throw new CcError("sha_required");
  if (text.trim().length < 40) throw new CcError("report_required");
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "review") throw new CcError("wrong_status", t.status);
  if (t.claimedBy !== agent) throw new CcError("not_your_task", t.claimedBy ?? "");
  await db.task.update({ where: { id: t.id }, data: { testedSha: sha.trim(), testedBy: agent, testedAt: new Date(), claimedBy: null, claimUntil: null } });
  await log(t.id, agent, "tested", null, sha.trim().slice(0, 10));
  await say(t.id, agent, "review", `✅ Протестировано на коммите ${sha.trim().slice(0, 10)}.\n${text.trim()}`);
  return db.task.findUniqueOrThrow({ where: { id: t.id } });
}

/** Снять свою аренду с задачи на проверке без решения (например, не хватило времени) */
export async function reviewRelease(key: string, agent: string, text: string) {
  const t = await db.task.findUnique({ where: { key }, select: { id: true, status: true, claimedBy: true } });
  if (!t) throw new CcError("not_found");
  if (t.status !== "review" || t.claimedBy !== agent) throw new CcError("not_your_task", t.claimedBy ?? "");
  await db.task.update({ where: { id: t.id }, data: { claimedBy: null, claimUntil: null } });
  await log(t.id, agent, "claimedBy", agent, null);
  await say(t.id, agent, "note", text);
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
      depends: true,
      rework: true,
      reclaims: true,
      branch: true,
    },
  });
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const plan = watchdogPlan(tasks, await closedKeys(), now);
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
    );
    await alertTech(`cc:return:${key}`, html`↩️ <b>${key}</b> возвращена в очередь сторожем: ${t.claimedBy ?? "?"} не отвечал.\n${t.title}`, 60);
  }

  for (const key of plan.releaseLease) {
    const t = byKey.get(key)!;
    const r = await db.task.updateMany({ where: { id: t.id, status: "review", claimedBy: t.claimedBy, claimUntil: t.claimUntil }, data: { claimedBy: null, claimUntil: null } });
    if (!r.count) continue;
    await log(t.id, "watchdog", "claimedBy", t.claimedBy, null);
    await say(t.id, "watchdog", "system", `${t.claimedBy} держал задачу на проверке и замолчал с ${clock(t.heartbeatAt ?? t.claimUntil)} — аренда снята, задача снова в очереди проверки.`);
  }

  for (const key of plan.unblock) {
    await transition(key, { to: "ready", text: "Все зависимости закрыты — задача вернулась в очередь." }, WATCHDOG).catch(() => null);
  }

  if (plan.phantom.length) {
    await alertTech("cc:phantom", html`👻 «В работе», но никто не держит: ${plan.phantom.join(", ")}\nВернуть в очередь или взять — в Control Center.`, 24 * 60);
  }
  if (plan.stuckReview.length) {
    await alertTech("cc:review", html`⏳ Ждут проверки дольше суток: ${plan.stuckReview.join(", ")}\nОчередь деплоера: /admin/control?status=review`, 24 * 60);
  }

  return { stale: plan.markStale.length, returned: plan.autoReturn.length, unblocked: plan.unblock.length, phantom: plan.phantom.length, stuckReview: plan.stuckReview.length, releasedLeases: plan.releaseLease.length };
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
