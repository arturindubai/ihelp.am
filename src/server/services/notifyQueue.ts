import "server-only";
import { db } from "../db";
import { getSettings, type Settings } from "../settings";
import { notifyBackoffMs, NOTIFY_MAX_ATTEMPTS } from "@/lib/notifyBackoff";

async function sendTelegramRaw(token: string, chatId: string, text: string, threadId?: string | null): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId) body.message_thread_id = Number(threadId);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`telegram ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Разрешить токен по пути вида «section.field» из объекта настроек */
function resolveToken(s: Settings, tokenPath: string): string {
  const [section, field] = tokenPath.split(".");
  const sec = s[section as keyof Settings];
  if (sec && typeof sec === "object" && !Array.isArray(sec)) {
    return ((sec as Record<string, unknown>)[field] as string) ?? "";
  }
  return "";
}

/**
 * Поставить сообщение в очередь и сразу попробовать отправить.
 * При сбое запись остаётся в статусе pending — её заберёт cron на следующем проходе.
 * tokenPath: путь к токену в настройках, например «team.botToken» или «notify.telegramBotToken»
 * threadId: числовой ID топика Telegram-группы (message_thread_id)
 */
export async function enqueueAndSend(chatId: string, text: string, tag: string, token: string, tokenPath = "notify.telegramBotToken", threadId?: string): Promise<void> {
  const msg = await db.notifyQueue.create({
    data: { chatId, threadId: threadId || null, text, tag, tokenPath },
    select: { id: true },
  });
  try {
    await sendTelegramRaw(token, chatId, text, threadId);
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
  const pending = await db.notifyQueue.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  if (!pending.length) return { sent: 0, failed: 0 };

  let s: Settings | null = null;
  try {
    s = await getSettings();
  } catch (e) {
    console.error("[notifyQueue] настройки недоступны", e);
    return { sent: 0, failed: 0 };
  }

  const tokenCache = new Map<string, string>();
  const getToken = (tokenPath: string): string => {
    if (tokenCache.has(tokenPath)) return tokenCache.get(tokenPath)!;
    const token = resolveToken(s!, tokenPath);
    tokenCache.set(tokenPath, token);
    return token;
  };

  let sent = 0;
  let failed = 0;
  for (const msg of pending) {
    const token = getToken(msg.tokenPath);
    if (!token) {
      console.error(`[notifyQueue:${msg.tag}] токен по пути «${msg.tokenPath}» не задан, пропускаем`);
      continue;
    }
    const attempts = msg.attempts + 1;
    try {
      await sendTelegramRaw(token, msg.chatId, msg.text, msg.threadId);
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
