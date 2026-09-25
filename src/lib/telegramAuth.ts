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

export interface TelegramContactMessage {
  from?: { id: number };
  chat: { id: number; type?: string };
  contact?: { phone_number?: string; user_id?: number };
}

/**
 * Номер из контакта — только если контакт принадлежит самому отправителю (AUTH-13).
 * Telegram кладёт в contact.user_id владельца номера: у контакта, отправленного кнопкой
 * «Поделиться номером», он равен from.id, а у пересланного или выбранного из адресной книги — нет.
 * Без этой проверки любой присылает контакт чужого человека (номер владельца опубликован на сайте)
 * и получает ссылку входа в его аккаунт. Чат обязан быть личным, чтобы не принимать контакты из групп.
 */
export function ownPhoneFromContact(msg: TelegramContactMessage): string | null {
  const phone = msg.contact?.phone_number?.trim();
  if (!phone) return null;
  if (msg.chat.type !== "private") return null;
  if (typeof msg.from?.id !== "number" || msg.chat.id !== msg.from.id) return null;
  if (typeof msg.contact?.user_id !== "number" || msg.contact.user_id !== msg.from.id) return null;
  return phone;
}
