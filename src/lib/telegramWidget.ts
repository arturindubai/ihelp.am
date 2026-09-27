/**
 * Верификация данных Telegram Login Widget (AUTH-10, часть 2).
 * Telegram подписывает данные по HMAC-SHA256: ключ = SHA256(bot_token), данные — строка field=value\n.
 * Спецификация: https://core.telegram.org/widgets/login#checking-authorization
 */
import crypto from "crypto";

export interface TelegramWidgetData {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

/** Парсит и валидирует параметры виджета из URLSearchParams */
export function parseTelegramWidgetParams(params: URLSearchParams): TelegramWidgetData | null {
  const id = params.get("id");
  const hash = params.get("hash");
  const auth_date = params.get("auth_date");
  if (!id || !hash || !auth_date) return null;
  return {
    id,
    hash,
    auth_date,
    first_name: params.get("first_name") ?? undefined,
    last_name: params.get("last_name") ?? undefined,
    username: params.get("username") ?? undefined,
    photo_url: params.get("photo_url") ?? undefined,
  };
}

/**
 * Проверяет HMAC-подпись данных Telegram Login Widget.
 * Возвращает true только если подпись верна и данные не старше 24 часов.
 */
export function verifyTelegramWidgetData(data: TelegramWidgetData, botToken: string): boolean {
  const { hash, auth_date, ...fields } = data;
  const dataCheckString = Object.entries({ auth_date, ...fields })
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (hashBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(hashBuf, expectedBuf)) return false;

  // Данные не должны быть старше 24 часов
  const age = Math.floor(Date.now() / 1000) - parseInt(auth_date, 10);
  return age >= 0 && age <= 86400;
}
