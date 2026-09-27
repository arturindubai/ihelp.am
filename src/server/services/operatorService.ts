import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { addDays, atYerevan, ymd } from "@/lib/time";

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
