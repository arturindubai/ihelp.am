"use server";
import { revalidatePath } from "next/cache";
import type { VisitStatus } from "@prisma/client";
import { requireRole } from "../auth";
import { db } from "../db";
import { setVisitStatus } from "../services/visits";
import { audit } from "../audit";

const OPERATOR_ROLES = ["OPERATOR", "ADMIN", "OWNER"] as const;

const rv = () => revalidatePath("/[locale]/operator", "page");

async function checkAccess() {
  return requireRole([...OPERATOR_ROLES]);
}

const ALLOWED_STATUSES: VisitStatus[] = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];

export async function operatorAssignMasterAction(visitId: string, masterId: string | null) {
  const u = await checkAccess();
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
  await db.visit.update({ where: { id: visitId }, data: { masterId } });
  await audit(u.id, "visit.assignMaster", "Visit", visitId, { from: v.masterId, to: masterId });
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
