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

/** Статус доступен мастеру только для визитов сегодняшнего дня, не раньше чем за 3 часа до начала */
function checkTimeWindow(scheduledAt: Date | null): boolean {
  if (!scheduledAt) return false;
  const now = new Date();
  const yerevanOffset = 4 * 60 * 60 * 1000;
  const nowYerevan = new Date(now.getTime() + yerevanOffset);
  const todayStart = new Date(Date.UTC(nowYerevan.getUTCFullYear(), nowYerevan.getUTCMonth(), nowYerevan.getUTCDate()) - yerevanOffset);
  const todayEnd = new Date(todayStart.getTime() + 86400_000);
  if (scheduledAt < todayStart || scheduledAt >= todayEnd) return false;
  const threeHoursBefore = scheduledAt.getTime() - 3 * 3600_000;
  return now.getTime() >= threeHoursBefore;
}

export async function proStatusAction(visitId: string, status: "ON_WAY" | "IN_PROGRESS" | "DONE") {
  const { m, v } = await myVisit(visitId);
  if (!FLOW[v.status]?.includes(status)) return { ok: false, error: "flow" };
  if (!checkTimeWindow(v.scheduledAt)) return { ok: false, error: "time_window" };
  await setVisitStatus(v.id, status, `мастер ${tr(m.name, "ru")}`);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

/** Отмена последнего статуса в течение 5 минут после смены */
export async function proUndoStatusAction(visitId: string) {
  const { m, v } = await myVisit(visitId);
  const UNDO_WINDOW_MS = 5 * 60 * 1000;
  const lastEvent = await db.visitEvent.findFirst({
    where: { visitId: v.id, status: { in: ["ON_WAY", "DONE"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!lastEvent) return { ok: false, error: "no_event" };
  const elapsed = Date.now() - lastEvent.createdAt.getTime();
  if (elapsed > UNDO_WINDOW_MS) return { ok: false, error: "expired" };
  const REVERSE: Record<string, string> = { ON_WAY: "CONFIRMED", DONE: "IN_PROGRESS" };
  const prevStatus = REVERSE[lastEvent.status];
  if (!prevStatus) return { ok: false, error: "no_reverse" };
  await setVisitStatus(v.id, prevStatus as "CONFIRMED" | "IN_PROGRESS", `мастер ${tr(m.name, "ru")} (отмена)`);
  revalidatePath("/[locale]/pro", "page");
  return { ok: true };
}

export async function proCashAction(visitId: string) {
  const { m, v } = await myVisit(visitId);
  if (v.cashCollected) return { ok: false, error: "already_set" };
  await setCashCollected(v.id, true, `мастер ${tr(m.name, "ru")}`);
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
