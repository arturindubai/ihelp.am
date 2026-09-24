import "server-only";
import { db } from "../db";
import { annotate, attention, systemStatus } from "./cc";
import { getTick, getWorkersConfig } from "./workers";
import { unreadForOwner } from "./ccMessages";
import { recentErrors } from "../logbuffer";
import { flowOf, intakeTitle, laneOf, nextIntakeKey, sizeOf, weekStart } from "@/lib/cc-lanes";
import { OPEN_STATUSES } from "@/lib/cc-flow";
import { testedCurrent } from "@/lib/workers";
import { Prisma } from "@prisma/client";

/**
 * Данные вкладок Control Center по образцу LIA: бэклог с дорожками и этапами, «Нужен ты», активность,
 * готовое, релизы, согласования, входящие (Intake) и здоровье. Правила переходов — в ccWork.ts, здесь только чтение
 * и создание входящих карточек.
 */

/** Бэклог: задачи с дорожкой, этапом потока, размером, здоровьем и готовностью */
export async function boardTasks(opts: { closed?: boolean } = {}) {
  const [tasks, tick] = await Promise.all([
    db.task.findMany({ where: opts.closed ? {} : { status: { in: OPEN_STATUSES } }, orderBy: [{ priority: "asc" }, { sort: "asc" }] }),
    getTick(),
  ]);
  const heads = tick?.heads ?? {};
  const knowHeads = Object.keys(heads).length > 0;
  return (await annotate(tasks)).map((t) => ({
    ...t,
    lane: laneOf(t),
    flow: flowOf(t, t.status === "review" && knowHeads ? testedCurrent({ ...t, branch: t.branch || `task/${t.key}` }, heads) : undefined),
    size: sizeOf(t.estimate),
  }));
}

export type BoardTask = Awaited<ReturnType<typeof boardTasks>>[number];

/** Счётчики вкладок */
export async function ccCounts() {
  const [byStatus, reviewCode, reviewNoCode, ownerBlocked, unread, running, attn, failed] = await Promise.all([
    db.task.groupBy({ by: ["status"], _count: true }),
    db.task.count({ where: { status: "review", layer: { not: "none" } } }),
    db.task.count({ where: { status: "review", layer: "none" } }),
    db.task.count({ where: { status: "blocked", blockedOn: { in: ["owner", "product"] } } }),
    unreadForOwner(),
    db.workerRun.count({ where: { status: "running" } }),
    attention(),
    db.workerRun.count({ where: { status: { in: ["failed", "timeout"] }, startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  return {
    backlog: OPEN_STATUSES.reduce((sum, s) => sum + n(s), 0),
    you: ownerBlocked + attn.stale.length + attn.review.filter((r) => r.health.stuckReview).length + failed,
    dev: n("in_progress"),
    deployer: reviewCode,
    approvals: reviewNoCode,
    notify: unread,
    running,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])) as Record<string, number>,
  };
}

/** «Нужен ты»: блокировки на владельце и продукте, брошенные задачи, застрявшая проверка, упавшие запуски, пауза воркеров */
export async function needsYou() {
  const [attn, owner, failedRuns, config] = await Promise.all([
    attention(),
    db.task.findMany({
      where: { status: "blocked", blockedOn: { in: ["owner", "product"] } },
      orderBy: [{ priority: "asc" }, { updatedAt: "asc" }],
      select: { key: true, title: true, priority: true, blockedOn: true, blockedReason: true, updatedAt: true, triageNote: true, comments: { orderBy: { createdAt: "desc" }, take: 1, select: { author: true, text: true, kind: true, createdAt: true } } },
    }),
    db.workerRun.findMany({ where: { status: { in: ["failed", "timeout"] }, startedAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, orderBy: { startedAt: "desc" }, take: 10 }),
    getWorkersConfig(),
  ]);
  return {
    owner,
    stale: attn.stale,
    stuckReview: attn.review.filter((r) => r.health.stuckReview),
    failedRuns,
    pausedUntil: config.pausedUntil && Date.parse(config.pausedUntil) > Date.now() ? config.pausedUntil : null,
  };
}

/** Согласования: не-код на проверке — принимает человек. С последним отчётом, чтобы решать, не открывая карточку */
export async function approvals() {
  const tasks = await db.task.findMany({
    where: { status: "review", layer: "none" },
    orderBy: [{ priority: "asc" }, { updatedAt: "asc" }],
    select: { key: true, title: true, priority: true, updatedAt: true, _count: { select: { attachments: true } }, comments: { where: { kind: "report" }, orderBy: { createdAt: "desc" }, take: 1, select: { author: true, text: true, createdAt: true } } },
  });
  return tasks.map((t) => ({ ...t, lane: laneOf({ key: t.key, layer: "none" }) }));
}

export type FeedItem = { id: string; at: Date; actor: string; key: string; title: string; kind: string; field?: string; from?: string | null; to?: string | null; text?: string };

/** Активность: изменения задач, записи в лентах и запуски воркеров — одной лентой, новое сверху */
export async function activityFeed(take = 150) {
  const [events, comments, runs] = await Promise.all([
    db.taskEvent.findMany({ orderBy: { createdAt: "desc" }, take, include: { task: { select: { key: true, title: true } } } }),
    db.taskComment.findMany({ orderBy: { createdAt: "desc" }, take, include: { task: { select: { key: true, title: true } } } }),
    db.workerRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
  ]);
  const items: FeedItem[] = [
    ...events.map((e) => ({ id: `e${e.id}`, at: e.createdAt, actor: e.actor, key: e.task.key, title: e.task.title, kind: "event", field: e.field, from: e.from, to: e.to })),
    ...comments.map((c) => ({ id: `c${c.id}`, at: c.createdAt, actor: c.author, key: c.task.key, title: c.task.title, kind: c.kind, text: c.text })),
    ...runs.map((r) => ({ id: `r${r.id}`, at: r.startedAt, actor: r.agent, key: r.taskKey ?? r.keys[0] ?? "", title: "", kind: "run", to: r.status, text: r.pool })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** Готово за последние дни: по дням (Ереван), новое сверху */
export async function doneFeed(days = 14) {
  const tasks = await db.task.findMany({
    where: { status: "done", doneAt: { gte: new Date(Date.now() - days * 24 * 3600_000) } },
    orderBy: { doneAt: "desc" },
    select: { key: true, title: true, layer: true, deployedSha: true, proof: true, doneAt: true },
  });
  const day = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = day(t.doneAt!);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return { today: groups.get(day(new Date()))?.length ?? 0, groups: [...groups.entries()].map(([date, items]) => ({ date, items })) };
}

/** Релизы: закрытые задачи по неделям — что выложено, простыми словами, с коммитом */
export async function releaseNotes(weeks = 12) {
  const tasks = await db.task.findMany({
    where: { status: "done", doneAt: { gte: new Date(Date.now() - weeks * 7 * 24 * 3600_000) } },
    orderBy: { doneAt: "desc" },
    select: { key: true, title: true, summary: true, layer: true, deployedSha: true, doneAt: true, epicRef: { select: { title: true } } },
  });
  const groups = new Map<number, typeof tasks>();
  for (const t of tasks) {
    const w = weekStart(t.doneAt!).getTime();
    groups.set(w, [...(groups.get(w) ?? []), t]);
  }
  return [...groups.entries()].map(([start, items]) => ({ start: new Date(start), items }));
}

/* ───────────── Входящие (Intake) ───────────── */

/**
 * Свободный текст владельца → карточка IN-N в бэклоге. Её разберёт триаж: перепишет в настоящую задачу
 * (или несколько), спросит, чего не хватает, или отложит. Отправка — и есть согласие владельца на разбор
 */
export async function intakeCreate(text: string, by: string) {
  const clean = text.trim().slice(0, 8000);
  if (clean.length < 10) throw new Error("too_short");
  const existing = (await db.task.findMany({ where: { key: { startsWith: "IN-" } }, select: { key: true } })).map((t) => t.key);
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = nextIntakeKey(existing);
    const sort = ((await db.task.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 1;
    try {
      const task = await db.task.create({
        data: {
          key,
          title: intakeTitle(clean),
          summary: clean.slice(0, 2000),
          details: clean.length > 2000 ? clean : null,
          area: "product",
          layer: "none",
          priority: "p2",
          stage: "later",
          owner: "product",
          source: "intake",
          createdBy: by,
          status: "backlog",
          sort,
        },
      });
      await db.taskEvent.create({ data: { taskId: task.id, actor: by, field: "created", from: null, to: key } });
      return task;
    } catch (e) {
      // Два Intake в одну секунду получили один номер — берём следующий
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        existing.push(key);
        continue;
      }
      throw e;
    }
  }
  throw new Error("key_busy");
}

/** Очередь и история Intake: последние входящие, что с ними сделал триаж и какие он разбирает прямо сейчас */
export async function intakeHistory(take = 12) {
  const [items, running] = await Promise.all([
    db.task.findMany({
      where: { source: "intake" },
      orderBy: { createdAt: "desc" },
      take,
      select: { key: true, title: true, status: true, triagedAt: true, triageNote: true, createdAt: true, createdBy: true },
    }),
    db.workerRun.findMany({ where: { status: "running", pool: "triage" }, select: { keys: true } }),
  ]);
  const inWork = new Set(running.flatMap((r) => r.keys));
  return items.map((i) => ({ ...i, inWork: inWork.has(i.key) }));
}

/* ───────────── Здоровье ───────────── */

/** Страница «Здоровье»: сервер, база, память, бэкапы, фоновые задачи, диспетчер и воркеры, каналы, последняя выкладка */
export async function healthStatus() {
  const t0 = Date.now();
  let dbMs: number | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbMs = Date.now() - t0;
  } catch {
    dbMs = null;
  }
  const day = new Date(Date.now() - 24 * 3600_000);
  const [sys, tick, config, lastDeploy, orders24, orders7, runs24, running] = await Promise.all([
    systemStatus(),
    getTick(),
    getWorkersConfig(),
    db.task.findFirst({ where: { status: "done", deployedSha: { not: null } }, orderBy: { doneAt: "desc" }, select: { key: true, title: true, deployedSha: true, doneAt: true } }),
    db.order.count({ where: { createdAt: { gte: day } } }),
    db.order.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } } }),
    db.workerRun.groupBy({ by: ["status"], where: { startedAt: { gte: day } }, _count: true }),
    db.workerRun.count({ where: { status: "running" } }),
  ]);
  const mem = process.memoryUsage();
  return {
    sys,
    dbMs,
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round(mem.rss / 1048576),
    heapMb: Math.round(mem.heapUsed / 1048576),
    node: process.version,
    tickAgeMin: tick ? (Date.now() - Date.parse(tick.at)) / 60_000 : null,
    workers: { enabled: config.enabled, dryRun: config.dryRun, pausedUntil: config.pausedUntil && Date.parse(config.pausedUntil) > Date.now() ? config.pausedUntil : null, running },
    runs24: Object.fromEntries(runs24.map((r) => [r.status, r._count])) as Record<string, number>,
    lastDeploy,
    orders24,
    orders7,
    errorsHour: recentErrors(60),
  };
}
