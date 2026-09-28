import "server-only";
import { db } from "../db";

const DAY_MS = 24 * 3600_000;

export interface OtpStats {
  /** Всего запросов кода за 24ч */
  requests24h: number;
  /** Разбивка по каналам */
  byChannel: Array<{ channel: string; count: number }>;
  /** Каналы с ошибкой доставки за 24ч (из AppError с ключом otp-delivery:*) */
  errorChannels: Array<{ channel: string; count: number; lastSeenAt: Date }>;
}

export async function otpStats(): Promise<OtpStats> {
  const since = new Date(Date.now() - DAY_MS);

  const [rows, errors] = await Promise.all([
    db.otpCode.groupBy({
      by: ["channel"],
      where: { createdAt: { gt: since } },
      _count: { id: true },
    }),
    db.appError.findMany({
      where: {
        key: { startsWith: "otp-delivery:" },
        lastSeenAt: { gt: since },
      },
      select: { key: true, count: true, lastSeenAt: true },
    }),
  ]);

  const byChannel = rows.map((r) => ({ channel: r.channel, count: r._count.id }));
  const requests24h = byChannel.reduce((s, r) => s + r.count, 0);
  const errorChannels = errors.map((e) => ({
    channel: e.key.replace("otp-delivery:", ""),
    count: e.count,
    lastSeenAt: e.lastSeenAt,
  }));

  return { requests24h, byChannel, errorChannels };
}
