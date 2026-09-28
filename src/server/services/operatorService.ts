import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { addDays, atYerevan, ymd } from "@/lib/time";
import { getSettings } from "../settings";
import { BUSY_STATUSES } from "./booking";

export type OperatorVisit = Awaited<ReturnType<typeof getOperatorVisits>>[number];

const ACTIVE_STATUSES = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE"] as const;

export async function getOperatorVisits(tab: "today" | "all" | "noMaster") {
  const today = ymd(new Date());

  let where: Prisma.VisitWhereInput;
  if (tab === "today") {
    where = {
      scheduledAt: {
        gte: atYerevan(today, "00:00"),
        lt: atYerevan(addDays(today, 1), "00:00"),
      },
      status: { in: [...ACTIVE_STATUSES] },
    };
  } else if (tab === "noMaster") {
    where = {
      masterId: null,
      status: { in: ["UNSCHEDULED", "SCHEDULED", "CONFIRMED"] },
    };
  } else {
    where = { status: { in: [...ACTIVE_STATUSES] } };
  }

  return db.visit.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    take: 50,
    include: {
      order: {
        include: {
          user: { select: { id: true, name: true, phone: true } },
          service: { select: { id: true, title: true } },
        },
      },
      master: { select: { id: true, name: true } },
    },
  });
}

export async function getActiveMasters() {
  return db.master.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { sort: "asc" },
  });
}

export async function assignMasterToVisit(visitId: string, masterId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId } });

  if (masterId && v.scheduledAt) {
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
