"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { setCashCollected, setVisitStatus } from "../services/visits";
import { audit } from "../audit";
import { tr } from "@/i18n/locales";

async function myVisit(visitId: string) {
  const u = await getCurrentUser();
  if (!u) throw new Error("auth");
  const m = await db.master.findUnique({ where: { userId: u.id } });
  if (!m) throw new Error("forbidden");
  const v = await db.visit.findFirst({ where: { id: visitId, masterId: m.id } });
  if (!v) throw new Error("not_found");
  return { m, v };
}

const FLOW: Record<string, string[]> = { SCHEDULED: ["ON_WAY", "IN_PROGRESS"], CONFIRMED: ["ON_WAY", "IN_PROGRESS"], ON_WAY: ["IN_PROGRESS"], IN_PROGRESS: ["DONE"] };

export async function proStatusAction(visitId: string, status: "ON_WAY" | "IN_PROGRESS" | "DONE") {
  const { m, v } = await myVisit(visitId);
  if (!FLOW[v.status]?.includes(status)) return { ok: false };
  await setVisitStatus(v.id, status, `мастер ${tr(m.name, "ru")}`);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

export async function proCashAction(visitId: string) {
  const { v } = await myVisit(visitId);
  await setCashCollected(v.id, !v.cashCollected);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

export async function proNoteAction(visitId: string, note: string) {
  const { v } = await myVisit(visitId);
  await db.visit.update({ where: { id: v.id }, data: { masterNote: note.slice(0, 1000) } });
  return { ok: true };
}

const notifySettingsSchema = z.object({ notifyEnabled: z.boolean() });

export async function proNotifySettingsAction(notifyEnabled: boolean) {
  const parsed = notifySettingsSchema.safeParse({ notifyEnabled });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "auth" };
  const m = await db.master.findUnique({ where: { userId: u.id } });
  if (!m) return { ok: false, error: "forbidden" };
  await db.master.update({ where: { id: m.id }, data: { notifyEnabled: parsed.data.notifyEnabled } });
  await audit(u.id, "update", "Master", m.id, { notifyEnabled: parsed.data.notifyEnabled });
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}
