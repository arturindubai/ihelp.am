/**
 * Тикет на завершение регистрации (AUTH-11): подписанная запись «номер уже подтверждён» на 10 минут.
 * Выдаётся, когда номер подтвердил код (SMS, WhatsApp, Telegram Gateway) или Telegram-бот (собственный контакт);
 * по нему клиент вводит имя и email, подтверждает email кодом из письма — и только тогда создаётся аккаунт.
 * signState/verifyState режут строку по «.», а JSON и email с точкой её ломают — поэтому запись
 * упаковывается в base64url ДО подписи. Секрет передаётся параметром: модуль чистый, без доступа к окружению.
 */
import { signState, verifyState } from "./oauth";

export interface SignupTicket {
  phone: string;
  locale: string;
}

export function packSignupTicket(t: SignupTicket, secret: string) {
  return signState(Buffer.from(JSON.stringify(t)).toString("base64url"), secret);
}

export function unpackSignupTicket(ticket: string, secret: string): SignupTicket | null {
  const raw = verifyState(ticket, secret);
  if (!raw) return null;
  try {
    const t = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<SignupTicket>;
    return typeof t.phone === "string" && t.phone.startsWith("+") && typeof t.locale === "string" ? { phone: t.phone, locale: t.locale } : null;
  } catch {
    return null;
  }
}
