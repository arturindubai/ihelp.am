import "server-only";
import { db } from "@/server/db";

/** Адреса пользователя для кабинета (сортировка по дате создания) */
export async function getAccountAddresses(userId: string) {
  return db.address.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

/** Предстоящие визиты пользователя (статусы «в работе», начиная с since) */
export async function getUpcomingVisits(userId: string, since: Date) {
  return db.visit.findMany({
    where: {
      order: { userId },
      status: { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] },
      scheduledAt: { gte: since },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
    include: { order: { include: { service: true, plan: true } }, master: true },
  });
}

/** Заказы пользователя для вкладок «Подписки» и «История» */
export async function getUserOrders(userId: string, tab: "plans" | "history") {
  return db.order.findMany({
    where:
      tab === "plans"
        ? { userId, kind: { in: ["SUBSCRIPTION", "PACKAGE"] }, status: { in: ["ACTIVE", "PAUSED"] } }
        : { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { service: true, plan: true, visits: { select: { status: true } } },
  });
}

/** Детали заказа для кабинета клиента (проверяет принадлежность пользователю) */
export async function getUserOrderDetail(id: string, userId: string) {
  return db.order.findFirst({
    where: { id, userId },
    include: {
      service: true,
      plan: true,
      visits: { orderBy: [{ index: "asc" }], include: { master: true, review: true } },
    },
  });
}
