import "server-only";
import { db } from "../db";

export type VisitEventFeedItem = {
  id: string;
  visitId: string;
  orderId: string;
  status: string;
  actor: string;
  createdAt: Date;
};

/** Лента событий визитов заказа в хронологическом порядке */
export async function getOrderEventFeed(orderId: string): Promise<VisitEventFeedItem[]> {
  const events = await db.visitEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, visitId: true, orderId: true, status: true, actor: true, createdAt: true },
  });
  return events;
}

/** Лента событий одного визита в хронологическом порядке */
export async function getVisitEventFeed(visitId: string): Promise<VisitEventFeedItem[]> {
  const events = await db.visitEvent.findMany({
    where: { visitId },
    orderBy: { createdAt: "asc" },
    select: { id: true, visitId: true, orderId: true, status: true, actor: true, createdAt: true },
  });
  return events;
}
