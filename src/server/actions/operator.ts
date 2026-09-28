"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { VisitStatus } from "@prisma/client";
import { requireRole } from "../auth";
import { db } from "../db";
import { setVisitStatus } from "../services/visits";
import { notifyMasterAssigned } from "../services/workerNotify";
import { audit } from "../audit";
import { assignMasterToVisit } from "../services/operatorService";

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

export async function operatorAssignMasterAction(visitId: string, masterId: string | null) {
  const parsed = assignSchema.safeParse({ visitId, masterId });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const u = await checkAccess();
  const prevMasterId = (await db.visit.findUniqueOrThrow({ where: { id: visitId }, select: { masterId: true } })).masterId;

  // Проверка занятости мастера — в сервисе (BUG-6); уведомление мастеру — только после успешного назначения (NOTIFY-2A)
  const result = await assignMasterToVisit(visitId, masterId);
  if (!result.ok) return result;

  await audit(u.id, "visit.assignMaster", "Visit", visitId, { from: prevMasterId, to: masterId });
  if (masterId && masterId !== prevMasterId) {
    await notifyMasterAssigned(visitId).catch(() => {});
  }
  rv();
  return { ok: true };
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
