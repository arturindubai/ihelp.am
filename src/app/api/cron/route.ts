import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { generateSubscriptionVisits } from "@/server/services/booking";
import { html, notifyTeam } from "@/server/notify";
import { alertTech } from "@/server/alerts";
import { ymd } from "@/lib/time";

const HOUR = 3600_000;

/**
 * Один раз в сутки, начиная с часа `fromHour` по Еревану. Отметка хранится в базе (Setting `_cron`),
 * поэтому переживает перезапуски и не срабатывает дважды при вызове cron каждые 15 минут.
 */
async function daily(key: string, fromHour: number, fn: () => Promise<void>) {
  const now = new Date();
  if ((now.getUTCHours() + 4) % 24 < fromHour) return;
  const row = await db.setting.findUnique({ where: { key: "_cron" } });
  const marks = (row?.value ?? {}) as Record<string, string>;
  if (marks[key] === ymd(now)) return;
  const value = { ...marks, [key]: ymd(now) };
  await db.setting.upsert({ where: { key: "_cron" }, create: { key: "_cron", value }, update: { value } });
  await fn();
}

type BackupState = { lastOkAt?: string; lastErrorAt?: string; restoreOkAt?: string; restoreErrorAt?: string };
const time = (v?: string) => (v ? Date.parse(v) : 0);

/** Вызывается раз в 15 минут контейнером cron: curl -H "x-cron-secret: …" /api/cron */
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

  // 4. Визиты завтра без мастера — предупреждение команде раз в день после 18:00
  let unassigned = 0;
  await daily("unassigned", 18, async () => {
    unassigned = await db.visit.count({ where: { masterId: null, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 36 * HOUR) } } });
    if (unassigned) await notifyTeam(html`⚠️ Визитов без мастера на ближайшие сутки: ${unassigned}`);
  });

  // 5. Очистка: коды входа (с IP) старше 7 дней и истёкшие сессии — персональные данные не храним дольше нужного
  let cleaned = { otp: 0, sessions: 0 };
  await daily("cleanup", 4, async () => {
    const otp = await db.otpCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 24 * HOUR) } } });
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    cleaned = { otp: otp.count, sessions: sessions.count };
  });

  // 6. Бэкапы: отметки пишет контейнер backup (Setting `_backup`)
  const b = ((await db.setting.findUnique({ where: { key: "_backup" } }))?.value ?? null) as BackupState | null;
  if (b ? now.getTime() - time(b.lastOkAt) > 26 * HOUR : process.uptime() > 26 * 3600) {
    await alertTech("backup-stale", "⚠️ <b>Бэкап базы не снимался больше 26 часов</b>\nПроверить: docker compose logs backup", 12 * 60);
  }
  if (b && time(b.lastErrorAt) > time(b.lastOkAt)) {
    await alertTech("backup-error", "❌ <b>Последняя попытка бэкапа завершилась ошибкой</b>\nПроверить: docker compose logs backup", 12 * 60);
  }
  if (b && time(b.restoreErrorAt) > time(b.restoreOkAt)) {
    await alertTech("restore-check", "❌ <b>Еженедельная проверка восстановления из бэкапа не прошла</b>\nПроверить: docker compose logs backup", 24 * 60);
  }

  // 7. Свободное место на диске сервера (том с фото лежит на основном диске)
  let diskFreePct: number | null = null;
  try {
    const st = await fs.statfs(process.env.UPLOAD_DIR || "/data/uploads");
    diskFreePct = Math.round((st.bavail / st.blocks) * 100);
    if (diskFreePct < 10) await alertTech("disk", html`⚠️ <b>На диске сервера осталось ${diskFreePct}% места</b>\nОсвободить: docker builder prune -f, старые бэкапы`, 12 * 60);
  } catch (e) {
    console.error("[cron] disk check failed", e);
  }

  return NextResponse.json({ ok: true, resumed: resumed.count, created, expired: expired.length, unassigned, cleaned, diskFreePct });
}
