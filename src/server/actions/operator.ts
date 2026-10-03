"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { VisitStatus } from "@prisma/client";
import { requireRole } from "../auth";
import { db } from "../db";
import { setVisitStatus } from "../services/visits";
import { notifyMasterAssigned } from "../services/workerNotify";
import { notifyClientMasterAssigned } from "../services/bookingNotify";
import { audit } from "../audit";
import { assignMasterToVisit, getMastersWithAvailability, getOperatorVisits, type Tab } from "../services/operatorService";
import { toVisitDTO, type OperatorVisitDTO } from "@/lib/operatorVisitDTO";

const OPERATOR_ROLES = ["OPERATOR", "ADMIN", "OWNER"] as const;

const rv = () => revalidatePath("/[locale]/operator", "page");

async function checkAccess() {
  return requireRole([...OPERATOR_ROLES]);
}

const ALLOWED_STATUSES: VisitStatus[] = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];

const assignSchema = z.object({
  visitId: z.string().min(1),
  masterId: z.string().min(1).nullable(),
});

async function doAssign(visitId: string, masterId: string | null, force: boolean) {
  const parsed = assignSchema.safeParse({ visitId, masterId });
  if (!parsed.success) return { ok: false, error: "invalid_input" as const };

  const u = await checkAccess();
  const prevMasterId = (await db.visit.findUniqueOrThrow({ where: { id: visitId }, select: { masterId: true } })).masterId;

  const result = await assignMasterToVisit(visitId, masterId, force);
  if (!result.ok) return result;

  await audit(u.id, "visit.assignMaster", "Visit", visitId, { from: prevMasterId, to: masterId, force });
  if (masterId && masterId !== prevMasterId) {
    await notifyMasterAssigned(visitId).catch(() => {});
    await notifyClientMasterAssigned(visitId).catch(() => {});
  }
  rv();
  return { ok: true as const };
}

export async function operatorAssignMasterAction(visitId: string, masterId: string | null) {
  return doAssign(visitId, masterId, false);
}

export async function operatorAssignMasterForceAction(visitId: string, masterId: string) {
  return doAssign(visitId, masterId, true);
}

export async function operatorChangeStatusAction(visitId: string, status: VisitStatus) {
  if (!ALLOWED_STATUSES.includes(status)) return { ok: false, error: "invalid_status" };
  const u = await checkAccess();
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
  if (v.status === status) return { ok: true };
  await setVisitStatus(visitId, status, `оператор ${u.name || u.phone}`);
  rv();
  return { ok: true };
}

export async function operatorMarkSeenAction(visitIds: string[]) {
  if (visitIds.length === 0) return;
  await checkAccess();
  await db.visit.updateMany({
    where: { id: { in: visitIds }, operatorSeen: false },
    data: { operatorSeen: true },
  });
  // revalidate не нужен — бейдж убирается оптимистично на клиенте
}

export async function operatorGetMoreAction(
  tab: Tab,
  skip: number,
): Promise<{ visits: OperatorVisitDTO[]; hasMore: boolean }> {
  await checkAccess();
  const { visits, hasMore } = await getOperatorVisits(tab, skip);
  return { visits: visits.map(toVisitDTO), hasMore };
}

export async function getMastersWithAvailabilityAction(visitId: string) {
  await checkAccess();
  return getMastersWithAvailability(visitId);
}
