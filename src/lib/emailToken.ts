/**
 * Подписанные токены для ссылок отписки от писем.
 * Формат: <userId>.<base64url-hmac>
 * Подписываются ключом SETTINGS_ENCRYPTION_KEY (hex 64 символа) или SESSION_SECRET как запасной.
 * Токен привязан к userId и цели (purpose), чтобы токен одного письма нельзя было использовать в другом.
 */
import crypto from "crypto";

function signingKey(): string {
  const k = process.env.SETTINGS_ENCRYPTION_KEY || process.env.SESSION_SECRET || "dev";
  return k.slice(0, 64);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Создать токен для ссылки отписки */
export function createUnsubscribeToken(userId: string): string {
  const payload = `unsubscribe:${userId}`;
  return `${userId}.${sign(payload)}`;
}

/** Проверить токен отписки; возвращает userId или null при невалидном токене */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(`unsubscribe:${userId}`);
  try {
    if (crypto.timingSafeEqual(Buffer.from(mac, "base64url"), Buffer.from(expected, "base64url"))) return userId;
  } catch {
    // разная длина буферов — неверный токен
  }
  return null;
}
