import "server-only";
import { db } from "../db";
import { CLOSED_STATUSES } from "@/lib/cc-flow";
import type { Prisma } from "@prisma/client";

export type EpicFilters = { status?: string; q?: string };

function where(f: EpicFilters): Prisma.EpicWhereInput {
  const w: Prisma.EpicWhereInput = {};
  if (f.status) w.status = f.status;
  if (f.q) {
    const q = f.q.trim();
    w.OR = [{ key: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }];
  }
  return w;
}

/** Эпики со счётчиком задач и прогрессом по статусам */
export async function listEpics(f: EpicFilters = {}) {
  const epics = await db.epic.findMany({ where: where(f), orderBy: [{ sort: "asc" }], include: { _count: { select: { tasks: true } } } });
  const counts = await db.task.groupBy({ by: ["epicKey", "status"], _count: true, where: { epicKey: { not: null } } });
  return epics.map((e) => {
    const rows = counts.filter((c) => c.epicKey === e.key);
    const total = rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r._count, 0);
    const done = rows.filter((r) => r.status === "done").reduce((s, r) => s + r._count, 0);
    return { ...e, taskTotal: total, taskDone: done };
  });
}

export async function getEpic(key: string) {
  const epic = await db.epic.findUnique({
    where: { key },
    include: { attachments: { orderBy: { createdAt: "desc" } }, tasks: { orderBy: [{ priority: "asc" }, { sort: "asc" }], select: { key: true, title: true, status: true, priority: true } } },
  });
  if (!epic) return null;
  const related = await db.epic.findMany({
    where: { OR: [{ key: { in: epic.depends } }, { depends: { has: epic.key } }] },
    select: { key: true, title: true, status: true, depends: true },
  });
  return {
    epic,
    blockers: related.filter((r) => epic.depends.includes(r.key)),
    blocking: related.filter((r) => r.depends.includes(epic.key)),
  };
}

export interface EpicContent {
  key: string;
  title: string;
  summary: string;
  requirements: string[];
  design?: string | null;
  techNotes?: string | null;
  testingNotes?: string | null;
  deployNotes?: string | null;
  status: string;
  depends: string[];
  docs: string[];
}

/** Создание или изменение эпика из админки. Такой эпик помечается source="ui" и деплой не перезаписывает его тексты */
export async function saveEpic(content: EpicContent, actor: string, isNew: boolean) {
  const key = content.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
  if (!/^[a-z][a-z0-9-]{2,59}$/.test(key)) throw new Error("bad_key");
  const deps = [...new Set(content.depends.map((d) => d.trim().toLowerCase()).filter(Boolean))].filter((d) => d !== key);
  const known = new Set((await db.epic.findMany({ where: { key: { in: deps } }, select: { key: true } })).map((e) => e.key));
  const unknown = deps.filter((d) => !known.has(d));
  if (unknown.length) throw new Error(`unknown_depends:${unknown.join(", ")}`);
  const data = {
    title: content.title.trim().slice(0, 200),
    summary: content.summary.trim().slice(0, 2000),
    requirements: content.requirements.map((r) => r.trim()).filter(Boolean).slice(0, 20),
    design: content.design?.trim().slice(0, 5000) || null,
    techNotes: content.techNotes?.trim().slice(0, 5000) || null,
    testingNotes: content.testingNotes?.trim().slice(0, 5000) || null,
    deployNotes: content.deployNotes?.trim().slice(0, 5000) || null,
    status: content.status,
    depends: deps,
    docs: content.docs.map((r) => r.trim()).filter(Boolean).slice(0, 20),
    source: "ui",
  };
  const existing = await db.epic.findUnique({ where: { key } });
  if (isNew && existing) throw new Error("key_exists");
  if (!isNew && !existing) throw new Error("not_found");
  // Эпик готов, только когда закрыты все его задачи: иначе «Сделано» у эпика ничего не значит
  if (content.status === "done") {
    const open = await db.task.count({ where: { epicKey: key, status: { notIn: CLOSED_STATUSES } } });
    if (open) throw new Error("children_open");
  }
  const maxSort = existing?.sort ?? ((await db.epic.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 1;
  const epic = existing ? await db.epic.update({ where: { key }, data }) : await db.epic.create({ data: { key, ...data, sort: maxSort, createdBy: actor } });
  return epic;
}

