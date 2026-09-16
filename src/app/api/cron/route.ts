import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { generateSubscriptionVisits } from "@/server/services/booking";
import { notifyTeam } from "@/server/notify";

/** Вызывается раз в 15–60 минут контейнером cron: curl -H "x-cron-secret: …" /api/cron */
export async function GET(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await getSettings();
  const now = new Date();

  // 1. Подписки, у которых закончилась пауза
  const resumed = await db.order.updateMany({ where: { status: "PAUSED", pausedUntil: { lte: now } }, data: { status: "ACTIVE", pausedUntil: null } });

  // 2. Досоздание визитов подписок
  const horizon = new Date(now.getTime() + (s.booking.subscriptionHorizonDays - 3) * 86400_000);
  const subs = await db.order.findMany({ where: { kind: "SUBSCRIPTION", status: "ACTIVE", OR: [{ generatedUntil: null }, { generatedUntil: { lt: horizon } }] }, select: { id: true } });
  let created = 0;
  for (const o of subs) created += await generateSubscriptionVisits(db, o.id, s.booking.subscriptionHorizonDays, s.booking.bufferMin);

  // 3. Истёкшие пакеты
  const expired = await db.order.findMany({ where: { kind: "PACKAGE", status: "ACTIVE", expiresAt: { lt: now } }, select: { id: true } });
  for (const o of expired) {
    await db.visit.updateMany({ where: { orderId: o.id, status: "UNSCHEDULED" }, data: { status: "CANCELLED" } });
    await db.order.update({ where: { id: o.id }, data: { status: "COMPLETED" } });
  }

  // 4. Визиты завтра без мастера — предупреждение команде (раз в день около 18:00)
  const hour = (now.getUTCHours() + 4) % 24;
  let unassigned = 0;
  if (hour === 18 && now.getUTCMinutes() < 30) {
    unassigned = await db.visit.count({ where: { masterId: null, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 36 * 3600_000) } } });
    if (unassigned) await notifyTeam(`⚠️ Визитов без мастера на ближайшие сутки: ${unassigned}`);
  }

  return NextResponse.json({ ok: true, resumed: resumed.count, created, expired: expired.length, unassigned });
}
