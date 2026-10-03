import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { addDays, atYerevan, hm, isoWeekday, ymd } from "@/lib/time";
import { getSettings } from "../settings";
import { BUSY_STATUSES } from "./booking";

export const PAGE_SIZE = 20;

export type Tab = "today" | "upcoming" | "history" | "noMaster";

const UPCOMING_STATUSES = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] as const;
const HISTORY_STATUSES = ["DONE", "CANCELLED", "SKIPPED", "NO_SHOW"] as const;
const TODAY_STATUSES = [...UPCOMING_STATUSES, "DONE"] as const;

function buildWhere(tab: Tab): Prisma.VisitWhereInput {
  const today = ymd(new Date());
  if (tab === "today") {
    return {
      scheduledAt: {
        gte: atYerevan(today, "00:00"),
        lt: atYerevan(addDays(today, 1), "00:00"),
      },
      status: { in: [...TODAY_STATUSES] },
    };
  }
  if (tab === "noMaster") {
    return { masterId: null, status: { in: ["UNSCHEDULED", "SCHEDULED", "CONFIRMED"] } };
  }
  if (tab === "history") {
    return { status: { in: [...HISTORY_STATUSES] } };
  }
  // upcoming
  return { status: { in: [...UPCOMING_STATUSES] } };
}

const VISIT_INCLUDE = {
  order: {
    select: {
      id: true,
      number: true,
      comment: true,
      noCall: true,
      paymentMethod: true,
      pricePerVisit: true,
      config: true,
      addressSnapshot: true,
      user: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, title: true } },
    },
  },
  master: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.VisitInclude;

export type OperatorVisit = Prisma.VisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

export async function getOperatorVisits(tab: Tab, skip = 0): Promise<{ visits: OperatorVisit[]; hasMore: boolean }> {
  const where = buildWhere(tab);
  const orderBy: Prisma.VisitOrderByWithRelationInput[] =
    tab === "history"
      ? [{ scheduledAt: { sort: "desc", nulls: "last" } }]
      : [{ scheduledAt: { sort: "asc", nulls: "last" } }];

  const rows = await db.visit.findMany({
    where,
    orderBy,
    skip,
    take: PAGE_SIZE + 1,
    include: VISIT_INCLUDE,
  });

  const hasMore = rows.length > PAGE_SIZE;
  return { visits: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore };
}

export async function getActiveMasters() {
  return db.master.findMany({
    where: { active: true },
    select: { id: true, name: true, phone: true },
    orderBy: { sort: "asc" },
  });
}

// --- Доступность мастеров для Sheet назначения ---

export type MasterConflict =
  | { type: "offDay" }
  | { type: "timeOff"; until: string }
  | { type: "busy"; from: string; to: string };

export interface MasterWithConflict {
  id: string;
  name: Record<string, string> | string;
  phone: string | null;
  conflict: MasterConflict | null;
}

export async function getMastersWithAvailability(visitId: string): Promise<MasterWithConflict[]> {
  const v = await db.visit.findUniqueOrThrow({
    where: { id: visitId },
    select: { scheduledAt: true, durationMin: true },
  });

  const settings = await getSettings();
  const buf = settings.booking.bufferMin * 60_000;

  const timeOffFilter: Prisma.TimeOffWhereInput = v.scheduledAt
    ? { to: { gt: v.scheduledAt }, from: { lt: new Date(v.scheduledAt.getTime() + v.durationMin * 60_000) } }
    : { id: { equals: "never-match" } };

  const visitsFilter: Prisma.VisitWhereInput = v.scheduledAt
    ? {
        id: { not: visitId },
        status: { in: BUSY_STATUSES },
        scheduledAt: {
          gte: new Date(v.scheduledAt.getTime() - 4 * 3600_000),
          lt: new Date(v.scheduledAt.getTime() + 4 * 3600_000),
        },
      }
    : { id: { equals: "never-match" } };

  const masters = await db.master.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      phone: true,
      workingHours: true,
      timeOff: { where: timeOffFilter, select: { to: true }, orderBy: { to: "asc" } },
      visits: { where: visitsFilter, select: { scheduledAt: true, durationMin: true } },
    },
    orderBy: { sort: "asc" },
  });

  return masters.map((m): MasterWithConflict => {
    const name = m.name as Record<string, string> | string;

    if (!v.scheduledAt) {
      return { id: m.id, name, phone: m.phone, conflict: null };
    }

    const wh = (m.workingHours || {}) as Record<string, [string, string][]>;
    const date = ymd(v.scheduledAt);
    const wd = String(isoWeekday(date));
    if (!wh[wd] || wh[wd].length === 0) {
      return { id: m.id, name, phone: m.phone, conflict: { type: "offDay" } };
    }

    if (m.timeOff.length > 0) {
      const until = m.timeOff[0].to;
      // дата в ереванском времени
      const d = new Date(until.getTime() + 4 * 3600_000);
      const untilStr = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return { id: m.id, name, phone: m.phone, conflict: { type: "timeOff", until: untilStr } };
    }

    const newStart = v.scheduledAt.getTime();
    const newEnd = newStart + v.durationMin * 60_000;
    for (const ev of m.visits) {
      if (!ev.scheduledAt) continue;
      const bStart = ev.scheduledAt.getTime();
      const bEnd = bStart + ev.durationMin * 60_000;
      if (newStart - buf < bEnd && bStart < newEnd + buf) {
        return {
          id: m.id,
          name,
          phone: m.phone,
          conflict: { type: "busy", from: hm(ev.scheduledAt), to: hm(new Date(bEnd)) },
        };
      }
    }

    return { id: m.id, name, phone: m.phone, conflict: null };
  });
}

export async function assignMasterToVisit(
  visitId: string,
  masterId: string | null,
  force = false,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId } });

  if (masterId && v.scheduledAt && !force) {
    const settings = await getSettings();
    const buf = settings.booking.bufferMin * 60_000;
    const newStart = v.scheduledAt.getTime();
    const newEnd = newStart + v.durationMin * 60_000;
    const windowMs = v.durationMin * 60_000 + buf * 2 + 3600_000;

    const existing = await db.visit.findMany({
      where: {
        masterId,
        id: { not: visitId },
        status: { in: BUSY_STATUSES },
        scheduledAt: { gte: new Date(newStart - windowMs), lt: new Date(newEnd + windowMs) },
      },
      select: { scheduledAt: true, durationMin: true },
    });

    const hasConflict = existing.some(({ scheduledAt, durationMin }) => {
      const bStart = scheduledAt!.getTime();
      const bEnd = bStart + durationMin * 60_000;
      return newStart - buf < bEnd && bStart < newEnd + buf;
    });

    if (hasConflict) return { ok: false, error: "busy" };
  }

  await db.visit.update({ where: { id: visitId }, data: { masterId } });
  return { ok: true };
}
