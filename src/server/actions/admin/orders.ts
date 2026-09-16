"use server";
import { revalidatePath } from "next/cache";
import type { OrderStatus, PaymentStatus, VisitStatus } from "@prisma/client";
import { db } from "../../db";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { getSettings } from "../../settings";
import { BUSY_STATUSES, generateSubscriptionVisits, loadAvailability } from "../../services/booking";
import { setCashCollected, setVisitStatus, refreshOrderState } from "../../services/visits";
import { isMasterFree } from "@/lib/slots";
import { atYerevan } from "@/lib/time";

const rv = (id: string) => revalidatePath(`/[locale]/admin/orders/${id}`, "page");

export async function adminVisitAction(visitId: string, patch: { status?: VisitStatus; masterId?: string | null; date?: string; time?: string; cash?: boolean; force?: boolean }) {
  const u = await requireSection("orders");
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId }, include: { order: true } });
  const s = await getSettings();
  const data: Record<string, unknown> = {};
  const newStart = patch.date && patch.time ? atYerevan(patch.date, patch.time) : v.scheduledAt;
  const newMaster = patch.masterId !== undefined ? patch.masterId : v.masterId;
  if ((patch.date || patch.masterId !== undefined) && newStart && newMaster && !patch.force) {
    const [m] = await loadAvailability({ serviceId: v.order.serviceId, from: new Date(newStart.getTime() - 86400_000), to: new Date(newStart.getTime() + 86400_000), masterIds: [newMaster], excludeVisitId: v.id });
    if (!m || !isMasterFree(m, newStart, v.durationMin, s.booking.bufferMin)) return { ok: false, error: "busy" };
  }
  if (patch.date && patch.time) {
    data.scheduledAt = newStart;
    if (v.status === "UNSCHEDULED") data.status = "SCHEDULED";
  }
  if (patch.masterId !== undefined) data.masterId = patch.masterId;
  if (Object.keys(data).length) await db.visit.update({ where: { id: v.id }, data });
  if (patch.status && patch.status !== v.status) await setVisitStatus(v.id, patch.status, "админ");
  if (patch.cash !== undefined) await setCashCollected(v.id, patch.cash);
  await audit(u.id, "visit.update", "Visit", v.id, patch);
  rv(v.orderId);
  return { ok: true };
}

export async function adminOrderAction(orderId: string, patch: { status?: OrderStatus; cancelReason?: string; paymentStatus?: PaymentStatus; preferredMasterId?: string | null; pausedUntil?: string | null; comment?: string }) {
  const u = await requireSection("orders");
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const data: Record<string, unknown> = {};
  if (patch.paymentStatus) data.paymentStatus = patch.paymentStatus;
  if (patch.preferredMasterId !== undefined) data.preferredMasterId = patch.preferredMasterId;
  if (patch.comment !== undefined) data.comment = patch.comment;
  if (patch.status && patch.status !== o.status) {
    data.status = patch.status;
    if (patch.status === "CANCELLED") {
      data.cancelReason = patch.cancelReason || "admin";
      await db.visit.updateMany({ where: { orderId, status: { in: [...BUSY_STATUSES, "UNSCHEDULED"] } }, data: { status: "CANCELLED" } });
    }
    if (patch.status === "PAUSED") {
      const until = patch.pausedUntil ? new Date(`${patch.pausedUntil}T00:00:00+04:00`) : null;
      data.pausedUntil = until;
      if (until) await db.visit.updateMany({ where: { orderId, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledAt: { gt: new Date(), lt: until } }, data: { status: "SKIPPED" } });
    }
    if (patch.status === "ACTIVE") data.pausedUntil = null;
  }
  await db.order.update({ where: { id: orderId }, data });
  if (patch.status === "ACTIVE" && o.kind === "SUBSCRIPTION") {
    const s = await getSettings();
    await generateSubscriptionVisits(db, orderId, s.booking.subscriptionHorizonDays, s.booking.bufferMin);
  }
  await refreshOrderState(orderId);
  await audit(u.id, "order.update", "Order", orderId, patch);
  rv(orderId);
  return { ok: true };
}

export async function adminGenerateAction(orderId: string) {
  const u = await requireSection("orders");
  const s = await getSettings();
  const n = await generateSubscriptionVisits(db, orderId, s.booking.subscriptionHorizonDays, s.booking.bufferMin);
  await audit(u.id, "order.generate", "Order", orderId, { n });
  rv(orderId);
  return { ok: true, n };
}

export async function adminAddVisitAction(orderId: string, date: string, time: string, masterId: string | null) {
  const u = await requireSection("orders");
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { visits: { select: { index: true } } } });
  const v = await db.visit.create({ data: { orderId, index: Math.max(0, ...o.visits.map((x) => x.index)) + 1, scheduledAt: atYerevan(date, time), durationMin: o.durationMin, masterId, price: o.pricePerVisit } });
  await audit(u.id, "visit.create", "Visit", v.id, { orderId, date, time, masterId });
  rv(orderId);
  return { ok: true };
}

export async function adminDeleteVisitAction(visitId: string) {
  const u = await requireSection("orders");
  const v = await db.visit.delete({ where: { id: visitId } });
  await audit(u.id, "visit.delete", "Visit", visitId, { orderId: v.orderId });
  await refreshOrderState(v.orderId);
  rv(v.orderId);
  return { ok: true };
}
