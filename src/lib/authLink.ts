import crypto from "crypto";

function timingSafeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Определяет результат попытки входа по ссылке:
 *   410 — ссылка отключена (ADMIN_LOGIN_TOKEN не задан или пустой)
 *   403 — ссылка включена, но токен неверный или пустой
 *   "ok" — токен совпал, вход разрешён
 */
export function linkLoginDecision(token: string, expected: string | undefined): 410 | 403 | "ok" {
  if (!expected) return 410;
  if (!token || !timingSafeEqual(token, expected)) return 403;
  return "ok";
}
