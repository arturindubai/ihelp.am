import "server-only";
import fs from "fs/promises";
import { db } from "../db";
import { getSettings } from "../settings";
import { BACKLOG } from "../backlog";
import { PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import type { Prisma, Task } from "@prisma/client";

export type TaskFilters = {
  stage?: string;
  status?: string;
  area?: string;
  layer?: string;
  priority?: string;
  owner?: string;
  epic?: string;
  q?: string;
  /** true — скрыть выполненные и то, что уже работает */
  open?: boolean;
};

const OPEN_STATUSES = ["backlog", "in_progress", "review", "blocked"];

function where(f: TaskFilters): Prisma.TaskWhereInput {
  const w: Prisma.TaskWhereInput = {};
  if (f.stage) w.stage = f.stage;
  if (f.status) w.status = f.status;
  else if (f.open) w.status = { in: OPEN_STATUSES };
  if (f.area) w.area = f.area;
  if (f.layer) w.layer = f.layer;
  if (f.priority) w.priority = f.priority;
  if (f.owner) w.owner = f.owner;
  if (f.epic) w.epic = f.epic;
  if (f.q) {
    const q = f.q.trim();
    w.OR = [
      { key: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
    ];
  }
  return w;
}

const PRIORITY_ORDER = Object.keys(PRIORITIES);

/** Задачи по фильтру: сначала приоритет, затем порядок из бэклога */
export async function listTasks(f: TaskFilters = {}) {
  const tasks = await db.task.findMany({ where: where(f), orderBy: [{ priority: "asc" }, { sort: "asc" }] });
  return tasks.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.sort - b.sort);
}

export async function getTask(key: string) {
  const task = await db.task.findUnique({
    where: { key },
    include: { comments: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!task) return null;
  const related = await db.task.findMany({
    where: { OR: [{ key: { in: task.depends } }, { depends: { has: task.key } }] },
    select: { key: true, title: true, status: true, depends: true },
  });
  return {
    task,
    /** Задачи, которых ждёт эта */
    blockers: related.filter((r) => task.depends.includes(r.key)),
    /** Задачи, которые ждут эту */
    blocking: related.filter((r) => r.depends.includes(task.key)),
  };
}

/** Сводка: прогресс по этапам и разрезы для фильтров */
export async function taskStats() {
  const rows = await db.task.groupBy({ by: ["stage", "status"], _count: true });
  const byStage = Object.keys(STAGES).map((stage) => {
    const forStage = rows.filter((r) => r.stage === stage);
    const total = forStage.reduce((s, r) => s + r._count, 0);
    const done = forStage.filter((r) => r.status === "done").reduce((s, r) => s + r._count, 0);
    const inWork = forStage.filter((r) => ["in_progress", "review"].includes(r.status)).reduce((s, r) => s + r._count, 0);
    const blocked = forStage.filter((r) => r.status === "blocked").reduce((s, r) => s + r._count, 0);
    return { stage, total, done, inWork, blocked, pct: total ? Math.round((done / total) * 100) : 0 };
  });
  const byStatus = Object.fromEntries(
    Object.keys(STATUSES).map((s) => [s, rows.filter((r) => r.status === s).reduce((acc, r) => acc + r._count, 0)]),
  ) as Record<string, number>;
  const [byArea, byOwner] = await Promise.all([
    db.task.groupBy({ by: ["area"], where: { status: { in: OPEN_STATUSES } }, _count: true }),
    db.task.groupBy({ by: ["owner"], where: { status: { in: OPEN_STATUSES } }, _count: true }),
  ]);
  return {
    byStage,
    byStatus,
    byArea: Object.fromEntries(byArea.map((r) => [r.area, r._count])) as Record<string, number>,
    byOwner: Object.fromEntries(byOwner.map((r) => [r.owner, r._count])) as Record<string, number>,
    total: rows.reduce((s, r) => s + r._count, 0),
  };
}

const TRACKED = ["status", "owner", "assignee", "priority", "stage", "blockedReason"] as const;
export type TaskPatch = Partial<Pick<Task, (typeof TRACKED)[number]>>;

/** Изменение задачи с записью в историю. Возвращает обновлённую задачу */
export async function updateTask(key: string, patch: TaskPatch, actor: string) {
  const before = await db.task.findUnique({ where: { key } });
  if (!before) throw new Error("not_found");
  const data: Prisma.TaskUpdateInput = { ...patch };
  if (patch.status && patch.status !== before.status) {
    if (patch.status === "done") data.doneAt = new Date();
    if (patch.status === "in_progress" && !before.startedAt) data.startedAt = new Date();
    if (patch.status !== "blocked") data.blockedReason = null;
    if (["done", "backlog"].includes(patch.status)) {
      data.claimedBy = null;
      data.claimUntil = null;
    }
  }
  const task = await db.task.update({ where: { key }, data });
  const events = TRACKED.filter((f) => patch[f] !== undefined && String(patch[f] ?? "") !== String(before[f] ?? "")).map((f) => ({
    taskId: task.id,
    actor,
    field: f,
    from: before[f] ? String(before[f]) : null,
    to: patch[f] ? String(patch[f]) : null,
  }));
  if (events.length) await db.taskEvent.createMany({ data: events });
  return task;
}

export interface TaskContent {
  key: string;
  title: string;
  summary: string;
  details?: string | null;
  requirements: string[];
  needs: string[];
  depends: string[];
  docs: string[];
  epic: string;
  area: string;
  layer: string;
  priority: string;
  stage: string;
  owner: string;
  estimate?: string | null;
}

/**
 * Создание или изменение задачи из админки. Такая задача помечается source="ui",
 * и деплой больше не перезаписывает её тексты из репозитория.
 */
export async function saveTask(content: TaskContent, actor: string, isNew: boolean) {
  const key = content.key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{2,29}$/.test(key)) throw new Error("bad_key");
  const deps = [...new Set(content.depends.map((d) => d.trim().toUpperCase()).filter(Boolean))].filter((d) => d !== key);
  const known = new Set((await db.task.findMany({ where: { key: { in: deps } }, select: { key: true } })).map((t) => t.key));
  const unknown = deps.filter((d) => !known.has(d));
  if (unknown.length) throw new Error(`unknown_depends:${unknown.join(", ")}`);
  const data = {
    title: content.title.trim().slice(0, 200),
    summary: content.summary.trim().slice(0, 2000),
    details: content.details?.trim().slice(0, 5000) || null,
    requirements: content.requirements.map((r) => r.trim()).filter(Boolean).slice(0, 20),
    needs: content.needs.map((r) => r.trim()).filter(Boolean).slice(0, 20),
    depends: deps,
    docs: content.docs.map((r) => r.trim()).filter(Boolean).slice(0, 20),
    epic: content.epic,
    area: content.area,
    layer: content.layer,
    priority: content.priority,
    stage: content.stage,
    owner: content.owner,
    estimate: content.estimate || null,
    source: "ui",
  };
  const existing = await db.task.findUnique({ where: { key } });
  if (isNew && existing) throw new Error("key_exists");
  if (!isNew && !existing) throw new Error("not_found");
  const maxSort = existing?.sort ?? ((await db.task.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 1;
  const task = existing
    ? await db.task.update({ where: { key }, data })
    : await db.task.create({ data: { key, ...data, sort: maxSort, createdBy: actor, status: "backlog" } });
  await db.taskEvent.create({ data: { taskId: task.id, actor, field: existing ? "edited" : "created", from: null, to: key } });
  return task;
}

/** Удалить можно только задачу, созданную в админке: задачу из репозитория деплой создаст заново */
export async function deleteTask(key: string, actor: string) {
  const task = await db.task.findUnique({ where: { key } });
  if (!task) throw new Error("not_found");
  if (task.source !== "ui") throw new Error("code_task");
  const blocking = await db.task.findMany({ where: { depends: { has: key } }, select: { key: true } });
  if (blocking.length) throw new Error(`blocking:${blocking.map((b) => b.key).join(",")}`);
  await db.task.delete({ where: { key } });
  console.log(`[cc] задача ${key} удалена (${actor})`);
}

export async function addComment(key: string, text: string, author: string, kind: "note" | "report" = "note") {
  const task = await db.task.findUnique({ where: { key }, select: { id: true } });
  if (!task) throw new Error("not_found");
  return db.taskComment.create({ data: { taskId: task.id, text: text.trim().slice(0, 5000), author, kind } });
}

/* ───────────── API для агентов ───────────── */

/** Берёт следующую задачу в работу: только «бэклог», с учётом фильтров и незакрытых зависимостей */
export async function claimNext(agent: string, filter: { area?: string; layer?: string; priority?: string } = {}, leaseMin = 60) {
  const candidates = await db.task.findMany({
    where: {
      status: "backlog",
      ...(filter.area ? { area: filter.area } : {}),
      ...(filter.layer ? { layer: filter.layer } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      OR: [{ claimUntil: null }, { claimUntil: { lt: new Date() } }],
    },
    orderBy: [{ priority: "asc" }, { sort: "asc" }],
    take: 25,
  });
  const doneKeys = new Set((await db.task.findMany({ where: { status: "done" }, select: { key: true } })).map((t) => t.key));
  const ready = candidates.find((t) => t.depends.every((d) => doneKeys.has(d)));
  if (!ready) return null;
  const claimed = await db.task.updateMany({
    where: { id: ready.id, status: "backlog", OR: [{ claimUntil: null }, { claimUntil: { lt: new Date() } }] },
    data: { status: "in_progress", claimedBy: agent, claimUntil: new Date(Date.now() + leaseMin * 60_000), startedAt: ready.startedAt ?? new Date() },
  });
  if (!claimed.count) return null;
  await db.taskEvent.create({ data: { taskId: ready.id, actor: agent, field: "status", from: "backlog", to: "in_progress" } });
  return db.task.findUnique({ where: { id: ready.id } });
}

export async function heartbeat(key: string, agent: string, leaseMin = 60) {
  const r = await db.task.updateMany({ where: { key, claimedBy: agent }, data: { claimUntil: new Date(Date.now() + leaseMin * 60_000) } });
  return r.count > 0;
}

export async function releaseTask(key: string, agent: string, status: "backlog" | "review" | "blocked", note?: string) {
  const task = await db.task.findFirst({ where: { key, claimedBy: agent } });
  if (!task) return null;
  if (note) await addComment(key, note, agent, "report");
  return updateTask(key, { status, ...(status === "blocked" && note ? { blockedReason: note.slice(0, 200) } : {}) }, agent);
}

/* ───────────── Состояние системы ───────────── */

type Mark = { lastOkAt?: string; lastErrorAt?: string; restoreOkAt?: string; restoreErrorAt?: string };

/** Живое состояние: бэкапы, фоновые задачи, диск, каналы уведомлений, объёмы данных */
export async function systemStatus() {
  const [backup, cron, s, orders, visits, clients, masters] = await Promise.all([
    db.setting.findUnique({ where: { key: "_backup" } }),
    db.setting.findUnique({ where: { key: "_cron" } }),
    getSettings(),
    db.order.count(),
    db.visit.count(),
    db.user.count({ where: { role: "CLIENT" } }),
    db.master.count({ where: { active: true } }),
  ]);
  const b = (backup?.value ?? {}) as Mark;
  const cronMarks = (cron?.value ?? {}) as Record<string, string>;
  let diskFreePct: number | null = null;
  try {
    const st = await fs.statfs(process.env.UPLOAD_DIR || "/data/uploads");
    diskFreePct = Math.round((st.bavail / st.blocks) * 100);
  } catch {
    diskFreePct = null;
  }
  const hours = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 3600_000 : null);
  const otpChannels = [
    s.otp.whatsapp.enabled && "WhatsApp",
    s.otp.telegram.enabled && "Telegram",
    s.otp.sms.enabled && "SMS",
  ].filter(Boolean) as string[];
  return {
    backup: { lastOkAt: b.lastOkAt ?? null, ageHours: hours(b.lastOkAt), failed: !!(b.lastErrorAt && Date.parse(b.lastErrorAt) > Date.parse(b.lastOkAt ?? "1970-01-01")) },
    restoreCheck: { lastOkAt: b.restoreOkAt ?? null, failed: !!(b.restoreErrorAt && Date.parse(b.restoreErrorAt) > Date.parse(b.restoreOkAt ?? "1970-01-01")) },
    cron: { lastRunAt: cronMarks.lastRunAt ?? null, ageMin: cronMarks.lastRunAt ? (Date.now() - Date.parse(cronMarks.lastRunAt)) / 60_000 : null },
    diskFreePct,
    otpChannels,
    teamChat: !!(s.notify.telegramBotToken && s.notify.telegramChatId),
    techChat: !!(s.notify.telegramBotToken && (s.notify.techChatId || s.notify.telegramChatId)),
    cardPayments: s.payments.cardEnabled,
    indexing: process.env.ROBOTS_TAG ?? null,
    https: (process.env.APP_URL ?? "").startsWith("https://"),
    agentApi: !!process.env.CC_AGENT_KEY,
    linkLogin: !!process.env.ADMIN_LOGIN_TOKEN,
    data: { orders, visits, clients, masters },
    backlogInCode: BACKLOG.length,
  };
}
