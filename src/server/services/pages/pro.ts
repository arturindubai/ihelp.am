import "server-only";
import { db } from "@/server/db";

/** Мастер, связанный с пользователем (для кабинета мастера) */
export async function getMasterByUserId(userId: string) {
  return db.master.findUnique({ where: { userId } });
}

/** Визиты мастера в заданном временном диапазоне */
export async function getProVisits(masterId: string, range: { gte: Date; lt: Date }, tab: string) {
  return db.visit.findMany({
    where: {
      masterId,
      scheduledAt: range,
      status: tab === "done" ? "DONE" : { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE"] },
    },
    orderBy: { scheduledAt: tab === "done" ? "desc" : "asc" },
    include: { order: { include: { user: true, service: true } } },
  });
}

/** Сумма наличных у мастера на руках: выполненные визиты, мастер отметил получение */
export async function getMasterCashInHands(masterId: string): Promise<number> {
  const result = await db.visit.aggregate({
    where: { masterId, status: "DONE", cashCollected: true, order: { paymentMethod: "CASH" } },
    _sum: { price: true },
  });
  return result._sum.price ?? 0;
}
