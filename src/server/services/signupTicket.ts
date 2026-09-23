import "server-only";
import { signState, verifyState } from "@/lib/oauth";

/**
 * Тикет на завершение регистрации (AUTH-11), 10 минут — общий формат для прямой формы, Google,
 * Apple и Telegram-бота: источник входа определяет только что уже доверено (email от Google/Apple,
 * телефон от бота), сам аккаунт создаётся в одном месте (completeSignupAction) после SMS-проверки
 * телефона. signState/verifyState режут строку по "." — JSON пакуется в base64url перед подписью.
 */
export type SignupTicket = { kind: "existing"; userId: string } | { kind: "new"; phone: string; email: string; locale: string };

export function packSignupTicket(t: SignupTicket, secret = process.env.SESSION_SECRET || "dev") {
  return signState(Buffer.from(JSON.stringify(t)).toString("base64url"), secret);
}

export function unpackSignupTicket(ticket: string, secret = process.env.SESSION_SECRET || "dev"): SignupTicket | null {
  const raw = verifyState(ticket, secret);
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SignupTicket;
  } catch {
    return null;
  }
}
