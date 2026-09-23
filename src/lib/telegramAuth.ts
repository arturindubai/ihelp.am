/**
 * Чистые помощники входа через Telegram-бота (без доступа к серверу): секрет для проверки
 * вебхука. Выводится из SESSION_SECRET — отдельного значения в .env заводить не нужно.
 */
import crypto from "crypto";

export function telegramWebhookSecret(sessionSecret: string) {
  return crypto.createHash("sha256").update(`tg-webhook:${sessionSecret}`).digest("hex");
}

/** Сверяет заголовок X-Telegram-Bot-Api-Secret-Token, который Telegram возвращает на каждый вызов вебхука */
export function verifyTelegramWebhookSecret(header: string | null, sessionSecret: string) {
  const expected = telegramWebhookSecret(sessionSecret);
  const a = Buffer.from(header || "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
