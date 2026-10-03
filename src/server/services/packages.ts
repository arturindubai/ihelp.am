import "server-only";
import { db } from "@/server/db";
import { packageWarnWindow } from "@/lib/time";

export type ExpiringPackage = {
  orderId: string;
  number: number;
  packageName: string;
  clientName: string;
  clientPhone: string | null;
  expiresAt: Date;
  remainingVisits: number;
  userId: string;
  userLocale: string;
  userTelegramId: string | null;
  userEmail: string | null;
  userEmailUnsubscribedAt: Date | null;
};

/**
 * Активные пакеты, истекающие через daysAhead дней по ереванскому времени.
 * Пропускает полностью израсходованные пакеты (нет визитов в статусах UNSCHEDULED/SCHEDULED/CONFIRMED).
 */
export async function findExpiringPackages(now: Date, daysAhead: number): Promise<ExpiringPackage[]> {
  const { from, to } = packageWarnWindow(now, daysAhead);
  const rows = await db.order.findMany({
    where: { kind: "PACKAGE", status: "ACTIVE", expiresAt: { gte: from, lte: to } },
    select: {
      id: true,
      number: true,
      expiresAt: true,
      config: true,
      locale: true,
      userId: true,
      user: { select: { name: true, phone: true, telegramId: true, email: true, emailUnsubscribedAt: true } },
      visits: { select: { status: true } },
    },
  });

  return rows
    .map((o) => {
      const remaining = o.visits.filter((v) => ["UNSCHEDULED", "SCHEDULED", "CONFIRMED"].includes(v.status)).length;
      if (remaining === 0) return null;
      const cfg = o.config as { service?: { title?: Record<string, string> }; plan?: { title?: Record<string, string> } };
      const packageName =
        cfg.plan?.title?.ru ??
        cfg.plan?.title?.en ??
        cfg.service?.title?.ru ??
        cfg.service?.title?.en ??
        `Пакет №${o.number}`;
      return {
        orderId: o.id,
        number: o.number,
        packageName,
        clientName: o.user.name || "Клиент",
        clientPhone: o.user.phone,
        expiresAt: o.expiresAt!,
        remainingVisits: remaining,
        userId: o.userId,
        userLocale: o.locale || "ru",
        userTelegramId: o.user.telegramId,
        userEmail: o.user.email,
        userEmailUnsubscribedAt: o.user.emailUnsubscribedAt,
      };
    })
    .filter((o): o is ExpiringPackage => o !== null);
}
