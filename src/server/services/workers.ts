import "server-only";
import { db } from "../db";
import { alertTech } from "../alerts";
import { html } from "../notify";
import { CLOSED_STATUSES, scopeOverlap } from "@/lib/cc-flow";
import { normalizeWorkers, planDispatch, POOLS, type DispatchState, type Pool, type WorkersConfig } from "@/lib/workers";

/**
 * Воркеры: настройки пулов (Setting cc.workers), журнал запусков (WorkerRun) и план для диспетчера.
 * Диспетчер живёт на сервере вне приложения (scripts/dispatcher.mjs) и говорит с этим сервисом через /api/cc.
 */

const KEY = "cc.workers";

export async function getWorkersConfig(): Promise<WorkersConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return normalizeWorkers(row?.value);
}

export async function saveWorkersConfig(patch: Partial<WorkersConfig>, actor: string): Promise<WorkersConfig> {
  const current = await getWorkersConfig();
  const next = normalizeWorkers({ ...current, ...patch, pools: { ...current.pools, ...(patch.pools ?? {}) } });
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  console.log(`[workers] настройки изменил ${actor}: ${next.enabled ? "включены" : "выключены"}`);
  return next;
}

/** Начало суток по Еревану — для дневного лимита запусков */
function dayStart(now = new Date()) {
  const y = new Date(now.getTime() + 4 * 3600_000);
  return new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate()) - 4 * 3600_000);
}

/**
 * Сколько задач можно отдать автономному разработчику: готовые код-задачи без открытых вопросов к продукту,
 * с закрытыми зависимостями и не пересекающиеся по файлам с задачами в работе. Остальное — людям и чатам
 */
export async function readyForAutoDev() {
  const [ready, closed, busy] = await Promise.all([
    db.task.findMany({ where: { status: "ready", layer: { not: "none" }, owner: { not: "product" } }, select: { key: true, needs: true, depends: true, scope: true } }),
    db.task.findMany({ where: { status: { in: CLOSED_STATUSES } }, select: { key: true } }).then((r) => new Set(r.map((t) => t.key))),
    db.task.findMany({ where: { status: "in_progress" }, select: { scope: true } }),
  ]);
  return ready.filter((t) => t.needs.length === 0 && t.depends.every((d) => closed.has(d)) && busy.every((b) => scopeOverlap(t.scope, b.scope).length === 0)).length;
}

export async function dispatchState(heads: Record<string, string>): Promise<DispatchState> {
  const [config, running, todayRows, review, readyForDev] = await Promise.all([
    getWorkersConfig(),
    db.workerRun.findMany({ where: { status: "running" }, select: { pool: true, agent: true } }),
    db.workerRun.groupBy({ by: ["pool"], where: { startedAt: { gte: dayStart() } }, _count: true }),
    db.task.findMany({ where: { status: "review" }, select: { key: true, branch: true, testedSha: true, claimedBy: true, claimUntil: true }, orderBy: [{ priority: "asc" }, { sort: "asc" }] }),
    readyForAutoDev(),
  ]);
  const today = Object.fromEntries(POOLS.map((p) => [p, todayRows.find((r) => r.pool === p)?._count ?? 0])) as Record<Pool, number>;
  return { config, running: running.map((r) => ({ pool: r.pool as Pool, agent: r.agent })), today, review, readyForDev, heads };
}

/** План для диспетчера плюс запуски, которые он должен сверить с systemd */
export async function dispatchPlan(heads: Record<string, string>) {
  const state = await dispatchState(heads);
  const running = await db.workerRun.findMany({ where: { status: "running" }, select: { id: true, unit: true, pool: true, agent: true, taskKey: true, startedAt: true } });
  return { config: state.config, actions: planDispatch(state), running };
}

export async function runStart(r: { pool: string; agent: string; taskKey?: string | null; unit: string; model: string }) {
  if (!(POOLS as readonly string[]).includes(r.pool)) throw new Error("bad_pool");
  const run = await db.workerRun.create({ data: { pool: r.pool, agent: r.agent.slice(0, 40), taskKey: r.taskKey ?? null, unit: r.unit.slice(0, 120), model: r.model.slice(0, 20) } });
  return run.id;
}

const OUTCOME_ICON: Record<string, string> = { done: "✓", failed: "✗", timeout: "⏱", limit: "⛔", stopped: "■" };

export async function runFinish(id: string, r: { status: string; summary?: string; turns?: number }) {
  const status = ["done", "failed", "timeout", "limit", "stopped"].includes(r.status) ? r.status : "failed";
  const run = await db.workerRun.update({
    where: { id },
    data: { status, summary: r.summary?.slice(0, 2000) ?? null, turns: typeof r.turns === "number" ? r.turns : null, finishedAt: new Date() },
  });
  // Неудачный запуск — сигнал в тех-чат: воркер мог оставить задачу на полпути
  if (status === "failed" || status === "timeout") {
    await alertTech(`workers:${run.pool}:${status}`, html`${OUTCOME_ICON[status]} <b>Воркер ${run.agent}</b> ${status === "timeout" ? "не уложился во время" : "завершился с ошибкой"}${run.taskKey ? ` · ${run.taskKey}` : ""}\n${(r.summary ?? "").slice(0, 300)}`, 30);
  }
  return run;
}

/** Лимит подписки исчерпан: пауза для всех пулов до времени сброса, сообщение в тех-чат */
export async function pauseWorkers(until: Date, reason: string) {
  const current = await getWorkersConfig();
  if (current.pausedUntil && Date.parse(current.pausedUntil) >= until.getTime()) return current;
  const next = await saveWorkersConfig({ pausedUntil: until.toISOString() }, "dispatcher");
  const clock = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(until);
  await alertTech("workers:limit", html`⛔ <b>Воркеры на паузе до ${clock}</b>\n${reason.slice(0, 300)}\nЛимит подписки Claude общий с вашими чатами.`, 60);
  return next;
}

export async function listRuns(take = 40) {
  return db.workerRun.findMany({ orderBy: { startedAt: "desc" }, take });
}

export async function workersOverview() {
  const [config, runs, running, todayRows, readyDev, reviewTotal, reviewTested] = await Promise.all([
    getWorkersConfig(),
    listRuns(40),
    db.workerRun.count({ where: { status: "running" } }),
    db.workerRun.groupBy({ by: ["pool"], where: { startedAt: { gte: dayStart() } }, _count: true }),
    readyForAutoDev(),
    db.task.count({ where: { status: "review" } }),
    db.task.count({ where: { status: "review", testedSha: { not: null } } }),
  ]);
  const today = Object.fromEntries(POOLS.map((p) => [p, todayRows.find((r) => r.pool === p)?._count ?? 0])) as Record<Pool, number>;
  return { config, runs, running, today, readyDev, reviewTotal, reviewTested };
}
