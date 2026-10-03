"use server";
import { db } from "../../db";
import { requireSection } from "../../admin";

export type VisitEventEntry = { id: string; status: string; actor: string; createdAt: string; prevStatus: string | null };

export async function getVisitEventsAction(visitId: string): Promise<VisitEventEntry[]> {
  await requireSection("orders");
  const events = await db.visitEvent.findMany({ where: { visitId }, orderBy: { createdAt: "asc" } });
  return events.map((e, i) => ({
    id: e.id,
    status: e.status,
    actor: e.actor,
    createdAt: e.createdAt.toISOString(),
    prevStatus: i > 0 ? events[i - 1].status : null,
  }));
}
