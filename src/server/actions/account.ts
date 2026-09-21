"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { getSettings } from "../settings";
import { html, notifyTeam } from "../notify";
import { BookingError, scheduleVisit, BUSY_STATUSES } from "../services/booking";
import { atYerevan, ymd } from "@/lib/time";

async function me() {
  const u = await getCurrentUser();
  if (!u) throw new Error("auth");
  return u;
}

export async function updateProfileAction(input: { name: string; email: string; locale: string }) {
  const u = await me();
  const email = input.email.trim();
  if (email && !z.string().email().safeParse(email).success) return { ok: false };
  await db.user.update({ where: { id: u.id }, data: { name: input.name.trim().slice(0, 80) || null, email: email || null, locale: ["ru", "en", "am"].includes(input.locale) ? input.locale : u.locale } });
  revalidatePath("/", "layout");
  return { ok: true };
}

async function ownVisit(visitId: string) {
  const u = await me();
  const v = await db.visit.findFirst({ where: { id: visitId, order: { userId: u.id } }, include: { order: true } });
  if (!v) throw new Error("not_found");
  return { u, v };
}

export async function cancelVisitAction(visitId: string) {
  const { v } = await ownVisit(visitId);
  const s = await getSettings();
  if (!BUSY_STATUSES.includes(v.status) || v.status === "IN_PROGRESS" || v.status === "ON_WAY") return { ok: false, error: "state" };
  if (v.scheduledAt && v.scheduledAt.getTime() - Date.now() < s.booking.freeCancelHours * 3600_000) return { ok: false, error: "late" };
  const status = v.order.kind === "SUBSCRIPTION" ? "SKIPPED" : v.order.kind === "PACKAGE" ? "UNSCHEDULED" : "CANCELLED";
  await db.visit.update({ where: { id: v.id }, data: { status, ...(status === "UNSCHEDULED" ? { scheduledAt: null, masterId: null } : {}) } });
  if (v.order.kind === "ONE_TIME") await db.order.update({ where: { id: v.orderId }, data: { status: "CANCELLED", cancelReason: "client" } });
  await notifyTeam(html`❌ Клиент ${status === "SKIPPED" ? "пропустил" : "отменил"} визит · заказ №${v.order.number} · ${v.scheduledAt ? ymd(v.scheduledAt) : ""}`);
  revalidatePath(`/[locale]/account/orders/${v.orderId}`, "page");
  return { ok: true };
}

export async function rescheduleVisitAction(visitId: string, date: string, time: string) {
  const { v } = await ownVisit(visitId);
  const s = await getSettings();
  if (!["UNSCHEDULED", "SCHEDULED", "CONFIRMED"].includes(v.status)) return { ok: false, error: "state" };
  if (v.scheduledAt && v.scheduledAt.getTime() - Date.now() < s.booking.freeCancelHours * 3600_000) return { ok: false, error: "late" };
  // Те же правила, что при оформлении: корректный формат, не раньше чем через leadHours, не дальше горизонта записи
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "invalid" };
  const start = atYerevan(date, time).getTime();
  if (Number.isNaN(start) || start < Date.now() + s.booking.leadHours * 3600_000 - 5 * 60_000 || start > Date.now() + (s.booking.horizonDays + 1) * 86400_000) return { ok: false, error: "slot_taken" };
  if (v.order.expiresAt && new Date(`${date}T00:00:00+04:00`) > v.order.expiresAt) return { ok: false, error: "expired" };
  try {
    await scheduleVisit(v.id, date, time, v.order.preferredMasterId);
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message };
    throw e;
  }
  await notifyTeam(html`🔁 Перенос визита · заказ №${v.order.number} → ${date} ${time}`);
  return { ok: true };
}

export async function cancelOrderAction(orderId: string) {
  const u = await me();
  const s = await getSettings();
  const o = await db.order.findFirst({ where: { id: orderId, userId: u.id }, include: { visits: true } });
  if (!o || o.status === "CANCELLED" || o.status === "COMPLETED") return { ok: false };
  // Отменяем все будущие визиты: иначе заказ закрыт, а мастер всё равно поедет.
  // Визиты внутри срока бесплатной отмены отмечаем отдельно — команде нужно знать о поздней отмене.
  const limit = new Date(Date.now() + s.booking.freeCancelHours * 3600_000);
  const late = o.visits.filter((v) => ["SCHEDULED", "CONFIRMED"].includes(v.status) && v.scheduledAt && v.scheduledAt <= limit).length;
  await db.$transaction([
    db.visit.updateMany({ where: { orderId: o.id, status: { in: ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"] } }, data: { status: "CANCELLED" } }),
    db.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelReason: "client" } }),
  ]);
  await notifyTeam(
    html`❌ Клиент отменил ${o.kind === "SUBSCRIPTION" ? "подписку" : "заказ"} №${o.number}` +
      (late ? html`\n⚠️ Поздняя отмена: визитов в ближайшие ${s.booking.freeCancelHours} ч — ${late}` : ""),
  );
  return { ok: true };
}

export async function pauseOrderAction(orderId: string, until: string) {
  const u = await me();
  const o = await db.order.findFirst({ where: { id: orderId, userId: u.id, kind: "SUBSCRIPTION", status: "ACTIVE" } });
  if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false };
  const s = await getSettings();
  const untilDate = new Date(`${until}T00:00:00+04:00`);
  const minFrom = new Date(Date.now() + s.booking.freeCancelHours * 3600_000);
  await db.$transaction([
    db.visit.updateMany({ where: { orderId: o.id, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledAt: { gt: minFrom, lt: untilDate } }, data: { status: "SKIPPED" } }),
    db.order.update({ where: { id: o.id }, data: { status: "PAUSED", pausedUntil: untilDate } }),
  ]);
  await notifyTeam(html`⏸ Подписка №${o.number} на паузе до ${until}`);
  return { ok: true };
}

export async function resumeOrderAction(orderId: string) {
  const u = await me();
  const o = await db.order.findFirst({ where: { id: orderId, userId: u.id, status: "PAUSED" } });
  if (!o) return { ok: false };
  const s = await getSettings();
  const { resumeSubscription } = await import("../services/booking");
  await resumeSubscription(o.id, s.booking.subscriptionHorizonDays, s.booking.bufferMin);
  await notifyTeam(html`▶️ Подписка №${o.number} возобновлена`);
  return { ok: true };
}

export async function reviewAction(visitId: string, rating: number, text: string) {
  const { u, v } = await ownVisit(visitId);
  if (v.status !== "DONE") return { ok: false };
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  const exists = await db.review.findUnique({ where: { visitId } });
  if (exists) return { ok: false };
  await db.review.create({ data: { visitId, userId: u.id, masterId: v.masterId, serviceId: v.order.serviceId, rating: r, text: text.trim().slice(0, 2000) || null, authorName: u.name, status: "PENDING" } });
  await notifyTeam(html`⭐ Новый отзыв ${r}/5 · заказ №${v.order.number} — на модерации`);
  return { ok: true };
}
