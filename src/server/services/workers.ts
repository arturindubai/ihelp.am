import "server-only";
import { db } from "../db";
import { alertTech } from "../alerts";
import { html } from "../notify";
import { CLOSED_STATUSES, pickNext, scopeOverlap } from "@/lib/cc-flow";
import { normalizeWorkers, planDispatch, POOLS, reviewQueues, yerevanHour, type DispatchAction, type DispatchState, type Pool, type RunRequest, type WorkersConfig } from "@/lib/workers";

/**
 * Воркеры: настройки пулов (Setting cc.workers), просьбы «Запустить сейчас» (cc.workers.requests),
 * последний проход диспетчера (_dispatcher), журнал запусков (WorkerRun), очереди пулов и план для диспетчера.
 * Диспетчер живёт на сервере вне приложения (scripts/dispatcher.mjs) и говорит с этим сервисом через /api/cc.
 */

const KEY = "cc.workers";
const REQUESTS = "cc.workers.requests";
const TICK = "_dispatcher";

export async function getWorkersConfig(): Promise<WorkersConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return normalizeWorkers(row?.value);
}

export type WorkersPatch = Partial<Omit<WorkersConfig, "pools">> & { pools?: Partial<{ [P in Pool]: Partial<WorkersConfig["pools"][P]> }> };

export async function saveWorkersConfig(patch: WorkersPatch, actor: string): Promise<WorkersConfig> {
  const current = await getWorkersConfig();
  const pools = { ...current.pools };
  for (const p of POOLS) if (patch.pools?.[p]) pools[p] = { ...pools[p], ...patch.pools[p] };
  const next = normalizeWorkers({ ...current, ...patch, pools });
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  console.log(`[workers] настройки изменил ${actor}: ${next.enabled ? "включены" : "выключены"}${next.dryRun ? ", пробный режим" : ""}`);
  return next;
}

/** Начало суток по Еревану — для дневного лимита запусков */
function dayStart(now = new Date()) {
  const y = new Date(now.getTime() + 4 * 3600_000);
  return new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate()) - 4 * 3600_000);
}

/* ───────────── Последний проход диспетчера ───────────── */

export type DispatcherTick = { at: string; heads: Record<string, string>; lines: string[]; linesAt: string | null };

export async function getTick(): Promise<DispatcherTick | null> {
  const row = await db.setting.findUnique({ where: { key: TICK } });
  const v = row?.value as Partial<DispatcherTick> | undefined;
  if (!v?.at) return null;
  return { at: v.at, heads: v.heads ?? {}, lines: Array.isArray(v.lines) ? v.lines : [], linesAt: v.linesAt ?? null };
}

async function saveTick(patch: Partial<DispatcherTick>) {
  const current = (await getTick()) ?? { at: new Date().toISOString(), heads: {}, lines: [], linesAt: null };
  const value = { ...current, ...patch };
  await db.setting.upsert({ where: { key: TICK }, create: { key: TICK, value }, update: { value } });
}

const IDLE = /(работы нет|воркеры выключены в Control Center)$/;

/**
 * Диспетчер закончил проход: строки его журнала — в хвост на вкладке «Воркеры» (последние 60).
 * Пустые проходы подряд не копятся: строка «работы нет» заменяет такую же предыдущую, чтобы не вытеснять запуски
 */
export async function tickLog(lines: string[]) {
  const incoming = lines.map((l) => String(l).slice(0, 300));
  const current = (await getTick())?.lines ?? [];
  const idle = incoming.length === 1 && IDLE.test(incoming[0]);
  const merged = idle && current.length && IDLE.test(current[current.length - 1]) ? [...current.slice(0, -1), incoming[0]] : [...current, ...incoming];
  await saveTick({ lines: merged.slice(-60), linesAt: new Date().toISOString() });
}

/* ───────────── «Запустить сейчас» и «Остановить» ───────────── */

async function getRequests(): Promise<RunRequest[]> {
  const row = await db.setting.findUnique({ where: { key: REQUESTS } });
  return Array.isArray(row?.value) ? (row.value as RunRequest[]) : [];
}

async function setRequests(list: RunRequest[]) {
  await db.setting.upsert({ where: { key: REQUESTS }, create: { key: REQUESTS, value: list }, update: { value: list } });
}

export async function requestRun(pool: Pool, key: string | null, by: string) {
  const list = (await getRequests()).filter((r) => !(r.pool === pool && (r.key ?? null) === key));
  list.push({ pool, key, at: new Date().toISOString(), by: by.slice(0, 60) });
  await setRequests(list.slice(-10));
  console.log(`[workers] ${by} просит запустить ${pool}${key ? ` на ${key}` : ""}`);
}

export async function requestStop(runId: string, by: string) {
  const r = await db.workerRun.updateMany({ where: { id: runId, status: "running" }, data: { stopRequested: true } });
  if (r.count) console.log(`[workers] ${by} останавливает запуск ${runId}`);
  return r.count > 0;
}

/* ───────────── Очереди ───────────── */

const PRIORITY_ORDER = ["p0", "p1", "p2", "p3"];
const STAGE_ORDER = ["launch", "public", "growth", "later", "baseline"];

/** Карточки, ждущие триажа: новые из бэклога и заблокированные на владельце, где человек ответил, — по приоритету и этапу */
export async function triageQueue() {
  const rows = await db.task.findMany({
    where: { triagedAt: null, OR: [{ status: "backlog" }, { status: "blocked", blockedOn: { in: ["owner", "product"] } }] },
    select: { key: true, title: true, priority: true, stage: true, status: true, sort: true, source: true },
  });
  return rows.sort(
    (a, b) =>
      Number(b.source === "intake") - Number(a.source === "intake") ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
      a.sort - b.sort,
  );
}

export type DevQueueItem = { key: string; title: string; priority: string; reason: "next" | "ok" | "deps" | "scope" | "needs" | "people"; detail?: string };

/**
 * Очередь разработчиков: все «Готова к работе» в порядке выбора и почему задача не уйдёт воркеру —
 * не код или продуктовая (людям), открытые вопросы, незакрытые зависимости, пересечение по файлам с работой
 */
export async function devQueue(): Promise<DevQueueItem[]> {
  const [ready, closedRows, busy] = await Promise.all([
    db.task.findMany({ where: { status: "ready" }, select: { key: true, title: true, priority: true, sort: true, rework: true, depends: true, scope: true, needs: true, layer: true, owner: true } }),
    db.task.findMany({ where: { status: { in: CLOSED_STATUSES } }, select: { key: true } }),
    db.task.findMany({ where: { status: "in_progress" }, select: { key: true, scope: true } }),
  ]);
  const closed = new Set(closedRows.map((t) => t.key));
  const auto = ready.filter((t) => t.layer !== "none" && t.owner !== "product" && t.needs.length === 0);
  const next = pickNext(auto, closed, busy.map((b) => b.scope));
  const order = [...ready].sort((a, b) => Number(b.rework > 0) - Number(a.rework > 0) || PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.sort - b.sort);
  return order.map((t) => {
    const base = { key: t.key, title: t.title, priority: t.priority };
    if (t.layer === "none" || t.owner === "product") return { ...base, reason: "people" };
    if (t.needs.length) return { ...base, reason: "needs", detail: t.needs[0] };
    const open = t.depends.filter((d) => !closed.has(d));
    if (open.length) return { ...base, reason: "deps", detail: open.join(", ") };
    const clash = busy.find((b) => scopeOverlap(t.scope, b.scope).length > 0);
    if (clash) return { ...base, reason: "scope", detail: clash.key };
    return { ...base, reason: next?.key === t.key ? "next" : "ok" };
  });
}

/** Сколько задач можно отдать автономному разработчику прямо сейчас */
export async function readyForAutoDev() {
  return (await devQueue()).filter((t) => t.reason === "next" || t.reason === "ok").length;
}

async function reviewTasks() {
  return db.task.findMany({
    where: { status: "review", layer: { not: "none" } },
    select: { key: true, title: true, branch: true, testedSha: true, testedBy: true, claimedBy: true, claimUntil: true, priority: true },
    orderBy: [{ priority: "asc" }, { sort: "asc" }],
  });
}

/** Когда пора пересмотреть весь бэклог: с прошлого обзора прошло sweepEveryH часов */
async function sweepDue(config: WorkersConfig) {
  if (config.sweepEveryH <= 0) return false;
  const last = await db.workerRun.findFirst({ where: { pool: "triage", taskKey: null, keys: { isEmpty: true } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  return !last || Date.now() - last.startedAt.getTime() >= config.sweepEveryH * 3600_000;
}

async function lastStarts() {
  const rows = await db.workerRun.groupBy({ by: ["pool"], _max: { startedAt: true } });
  return Object.fromEntries(rows.filter((r) => r._max.startedAt).map((r) => [r.pool, r._max.startedAt!.toISOString()])) as Partial<Record<Pool, string>>;
}

async function todayCounts() {
  const rows = await db.workerRun.groupBy({ by: ["pool"], where: { startedAt: { gte: dayStart() } }, _count: true });
  return Object.fromEntries(POOLS.map((p) => [p, rows.find((r) => r.pool === p)?._count ?? 0])) as Record<Pool, number>;
}

export async function dispatchState(heads: Record<string, string>): Promise<DispatchState> {
  const config = await getWorkersConfig();
  const [running, today, review, readyForDev, triage, sweep, lastStart, requests] = await Promise.all([
    db.workerRun.findMany({ where: { status: "running" }, select: { pool: true, agent: true } }),
    todayCounts(),
    reviewTasks(),
    readyForAutoDev(),
    triageQueue(),
    sweepDue(config),
    lastStarts(),
    getRequests(),
  ]);
  return {
    config,
    running: running.map((r) => ({ pool: r.pool as Pool, agent: r.agent })),
    today,
    review,
    readyForDev,
    heads,
    triageQueue: triage.map((t) => t.key),
    sweepDue: sweep,
    lastStart,
    requests: requests.filter((r) => Date.now() - Date.parse(r.at) < 30 * 60_000),
  };
}

/**
 * План для диспетчера плюс запуски, которые он должен сверить с systemd.
 * Проход диспетчера отмечается (время и ветки — для вкладок «Воркеры» и «Деплоер»), просьбы «Запустить сейчас»
 * разбираются: не выполненные в этот проход (пул занят, работы нет) снимаются с пометкой в журнале.
 */
export async function dispatchPlan(heads: Record<string, string>) {
  const state = await dispatchState(heads);
  const actions = planDispatch(state);
  await saveTick({ at: new Date().toISOString(), heads });
  // Разобранные просьбы снимаем. Остаются пришедшие за время прохода и те, чей пул сейчас занят, —
  // их выполнит один из следующих проходов, когда слот освободится (но не позже чем через 30 минут)
  const unmet = state.requests.filter((r) => !actions.some((a) => a.requestAt === r.at));
  const busy = (r: RunRequest) => state.running.filter((x) => x.pool === r.pool).length >= state.config.pools[r.pool].max;
  const waiting = new Set(unmet.filter(busy).map((r) => `${r.pool}|${r.at}`));
  const pending = await getRequests();
  const seen = new Set(state.requests.map((r) => `${r.pool}|${r.at}`));
  const rest = pending.filter((r) => (!seen.has(`${r.pool}|${r.at}`) || waiting.has(`${r.pool}|${r.at}`)) && Date.now() - Date.parse(r.at) < 30 * 60_000);
  if (rest.length !== pending.length) await setRequests(rest);
  const running = await db.workerRun.findMany({
    where: { status: "running" },
    select: { id: true, unit: true, pool: true, agent: true, taskKey: true, keys: true, startedAt: true, stopRequested: true },
  });
  return {
    config: state.config,
    actions: actions.map((a) => (a.requestAt ? { ...a, requestedBy: state.requests.find((r) => r.at === a.requestAt)?.by ?? null } : a)),
    running,
    unmet: unmet
      .filter((r) => !waiting.has(`${r.pool}|${r.at}`))
      .map((r) => `${r.pool}${r.key ? ` ${r.key}` : ""}: ${state.config.stopRunning ? "идёт остановка" : state.config.pausedUntil && Date.parse(state.config.pausedUntil) > Date.now() ? "воркеры на паузе (лимит подписки или вход)" : "нет подходящей работы (задача не в нужном статусе или без отправленной ветки)"}`),
  };
}

export async function runStart(r: { pool: string; agent: string; taskKey?: string | null; keys?: string[]; unit: string; model: string; requestedBy?: string | null }) {
  if (!(POOLS as readonly string[]).includes(r.pool)) throw new Error("bad_pool");
  const run = await db.workerRun.create({
    data: {
      pool: r.pool,
      agent: r.agent.slice(0, 40),
      taskKey: r.taskKey ?? null,
      keys: (r.keys ?? []).slice(0, 20),
      unit: r.unit.slice(0, 120),
      model: r.model.slice(0, 20),
      requestedBy: r.requestedBy?.slice(0, 60) ?? null,
    },
  });
  return run.id;
}

const OUTCOME_ICON: Record<string, string> = { done: "✓", failed: "✗", timeout: "⏱", limit: "⛔", stopped: "■" };

export type RunFinish = { status: string; summary?: string; turns?: number; log?: string; tokensIn?: number; tokensOut?: number; costUsd?: number };

export async function runFinish(id: string, r: RunFinish) {
  const status = ["done", "failed", "timeout", "limit", "stopped"].includes(r.status) ? r.status : "failed";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const run = await db.workerRun.update({
    where: { id },
    data: {
      status,
      summary: r.summary?.slice(0, 2000) ?? null,
      turns: num(r.turns),
      log: r.log?.slice(-20000) ?? null,
      tokensIn: num(r.tokensIn),
      tokensOut: num(r.tokensOut),
      costUsd: num(r.costUsd),
      finishedAt: new Date(),
    },
  });
  // Неудачный запуск — сигнал в тех-чат: воркер мог оставить задачу на полпути
  if (status === "failed" || status === "timeout") {
    await alertTech(`workers:${run.pool}:${status}`, html`${OUTCOME_ICON[status]} <b>Воркер ${run.agent}</b> ${status === "timeout" ? "не уложился во время" : "завершился с ошибкой"}${run.taskKey ? ` · ${run.taskKey}` : ""}\n${(r.summary ?? "").slice(0, 300)}`, 30);
  }
  return run;
}

/** Лимит подписки исчерпан или вход пропал: пауза для всех пулов до времени сброса, сообщение в тех-чат */
export async function pauseWorkers(until: Date, reason: string) {
  const current = await getWorkersConfig();
  if (current.pausedUntil && Date.parse(current.pausedUntil) >= until.getTime()) return current;
  const next = await saveWorkersConfig({ pausedUntil: until.toISOString(), pausedReason: reason.slice(0, 300) }, "dispatcher");
  const clock = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(until);
  await alertTech("workers:limit", html`⛔ <b>Воркеры на паузе до ${clock}</b>\n${reason.slice(0, 300)}\nЛимит подписки Claude общий с вашими чатами.`, 60);
  return next;
}

export async function listRuns(take = 40) {
  return db.workerRun.findMany({ orderBy: { startedAt: "desc" }, take });
}

/** Всё для вкладки «Воркеры»: настройки, очереди каждого пула с причинами, работающие, журнал, диспетчер */
export async function workersOverview() {
  const config = await getWorkersConfig();
  const [runs, running, today, tick, requests, triage, dev, review, lastStart] = await Promise.all([
    listRuns(60),
    db.workerRun.findMany({ where: { status: "running" }, orderBy: { startedAt: "asc" } }),
    todayCounts(),
    getTick(),
    getRequests(),
    triageQueue(),
    devQueue(),
    reviewTasks(),
    lastStarts(),
  ]);
  const heads = tick?.heads ?? {};
  const q = reviewQueues(review, heads);
  const byKey = new Map(review.map((t) => [t.key, t]));
  const item = (key: string, reason: string, detail?: string) => ({ key, title: byKey.get(key)?.title ?? key, priority: byKey.get(key)?.priority ?? "p2", reason, detail });
  const hour = yerevanHour(new Date());
  return {
    config,
    runs,
    running,
    today,
    tick,
    requests,
    lastStart,
    queues: {
      triage: triage.map((t) => ({ key: t.key, title: t.title, priority: t.priority, status: t.status, intake: t.source === "intake" })),
      dev,
      tester: [
        ...q.held.filter((t) => t.claimedBy !== "deployer").map((t) => item(t.key, "held", t.claimedBy ?? "")),
        ...q.test.map((t) => item(t.key, t.testedSha ? "retest" : "test")),
        ...q.noBranch.filter((t) => !q.held.includes(t)).map((t) => item(t.key, "nobranch")),
      ],
      deployer: [...q.held.filter((t) => t.claimedBy === "deployer").map((t) => item(t.key, "held", "deployer")), ...q.deploy.map((t) => item(t.key, "deploy", byKey.get(t.key)?.testedBy ?? ""))],
    },
    deployWindowOpen: hour >= config.deployWindow[0] && hour < config.deployWindow[1],
    readyDev: dev.filter((t) => t.reason === "next" || t.reason === "ok").length,
  };
}

export type WorkersOverview = Awaited<ReturnType<typeof workersOverview>>;
export type { DispatchAction };
