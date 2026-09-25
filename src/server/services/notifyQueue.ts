import "server-only";
import { db } from "../db";
import { getSettings } from "../settings";
import { notifyBackoffMs, NOTIFY_MAX_ATTEMPTS } from "@/lib/notifyBackoff";

async function sendTelegramRaw(token: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`telegram ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/**
 * Поставить сообщение в очередь и сразу попробовать отправить.
 * При сбое запись остаётся в статусе pending — её заберёт cron на следующем проходе.
 */
export async function enqueueAndSend(chatId: string, text: string, tag: string, token: string): Promise<void> {
  const msg = await db.notifyQueue.create({
    data: { chatId, text, tag },
    select: { id: true },
  });
  try {
    await sendTelegramRaw(token, chatId, text);
    await db.notifyQueue.update({
      where: { id: msg.id },
      data: { status: "sent", sentAt: new Date(), attempts: 1 },
    });
  } catch (e) {
    const err = String((e as Error).message ?? e).slice(0, 500);
    await db.notifyQueue.update({
      where: { id: msg.id },
      data: { attempts: 1, lastError: err, nextAttemptAt: new Date(Date.now() + notifyBackoffMs(1)) },
    });
    console.error(`[notify:${tag}] первая попытка не удалась, поставлено в очередь`, err);
  }
}

/**
 * Обработать очередь: отправить все pending записи с истёкшим nextAttemptAt.
 * Вызывается из cron каждые 15 минут.
 */
export async function processQueue(): Promise<{ sent: number; failed: number }> {
  let token = "";
  try {
    token = (await getSettings()).notify.telegramBotToken;
  } catch (e) {
    console.error("[notifyQueue] настройки недоступны", e);
    return { sent: 0, failed: 0 };
  }
  if (!token) return { sent: 0, failed: 0 };

  const pending = await db.notifyQueue.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let sent = 0;
  let failed = 0;
  for (const msg of pending) {
    const attempts = msg.attempts + 1;
    try {
      await sendTelegramRaw(token, msg.chatId, msg.text);
      await db.notifyQueue.update({
        where: { id: msg.id },
        data: { status: "sent", sentAt: new Date(), attempts },
      });
      sent++;
      console.log(`[notifyQueue:${msg.tag}] доставлено после ${attempts} попыток`);
    } catch (e) {
      const err = String((e as Error).message ?? e).slice(0, 500);
      const isFailed = attempts >= NOTIFY_MAX_ATTEMPTS;
      await db.notifyQueue.update({
        where: { id: msg.id },
        data: {
          attempts,
          lastError: err,
          status: isFailed ? "failed" : "pending",
          nextAttemptAt: new Date(Date.now() + notifyBackoffMs(attempts)),
        },
      });
      if (isFailed) {
        failed++;
        console.error(`[notifyQueue:${msg.tag}] окончательно не доставлено после ${attempts} попыток: ${err}`);
      } else {
        console.error(`[notifyQueue:${msg.tag}] попытка ${attempts} неудачна, следующая через ${notifyBackoffMs(attempts) / 60_000} мин`);
      }
    }
  }
  return { sent, failed };
}

/** Удалить отправленные сообщения старше указанного числа дней */
export async function cleanQueue(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const { count } = await db.notifyQueue.deleteMany({
    where: { status: "sent", createdAt: { lt: cutoff } },
  });
  return count;
}

/** Сводка очереди для мониторинга */
export async function getQueueSummary(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    db.notifyQueue.count({ where: { status: "pending" } }),
    db.notifyQueue.count({ where: { status: "failed" } }),
  ]);
  return { pending, failed };
}
