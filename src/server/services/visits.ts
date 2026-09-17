import "server-only";
import type { VisitStatus } from "@prisma/client";
import { db } from "../db";
import { html, notifyTeam } from "../notify";

/** Смена статуса визита с побочными эффектами (счётчики мастера, закрытие заказа, оплата) */
export async function setVisitStatus(visitId: string, status: VisitStatus, actor: string) {
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId }, include: { order: true, master: true } });
  const data: Record<string, unknown> = { status };
  if (status === "IN_PROGRESS" && !v.startedAt) data.startedAt = new Date();
  if (status === "DONE") data.finishedAt = new Date();
  await db.visit.update({ where: { id: v.id }, data });
  if (status === "DONE" && v.status !== "DONE" && v.masterId) await db.master.update({ where: { id: v.masterId }, data: { jobsCount: { increment: 1 } } });
  if (v.status === "DONE" && status !== "DONE" && v.masterId) await db.master.update({ where: { id: v.masterId }, data: { jobsCount: { decrement: 1 } } });
  await refreshOrderState(v.orderId);
  if (["ON_WAY", "DONE", "NO_SHOW"].includes(status)) {
    const label = { ON_WAY: "🚗 выехал", DONE: "✅ завершил", NO_SHOW: "⚠️ визит не состоялся" }[status as "ON_WAY"];
    await notifyTeam(html`${label} · заказ №${v.order.number} · ${actor}`);
  }
}

export async function setCashCollected(visitId: string, collected: boolean) {
  const v = await db.visit.update({ where: { id: visitId }, data: { cashCollected: collected, cashCollectedAt: collected ? new Date() : null } });
  await refreshOrderState(v.orderId);
  return v;
}

export async function refreshOrderState(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { visits: true } });
  const live = o.visits.filter((v) => !["CANCELLED", "SKIPPED", "NO_SHOW"].includes(v.status));
  const data: Record<string, unknown> = {};
  if (o.kind !== "SUBSCRIPTION" && o.status === "ACTIVE" && live.length > 0 && live.every((v) => v.status === "DONE")) data.status = "COMPLETED";
  if (o.paymentMethod === "CASH") {
    const toPay = o.kind === "PACKAGE" ? live : live.filter((v) => v.status === "DONE");
    const paid = toPay.filter((v) => v.cashCollected).length;
    data.paymentStatus = paid === 0 ? "PENDING" : paid >= toPay.length && (o.kind !== "SUBSCRIPTION" || o.status !== "ACTIVE") ? "PAID" : o.kind === "SUBSCRIPTION" && paid >= toPay.length ? "PAID" : "PARTIAL";
  }
  if (Object.keys(data).length) await db.order.update({ where: { id: o.id }, data });
}
