/**
 * Тикет на регистрацию через Google: email и имя из Google-профиля (подтверждены Google),
 * живёт 10 минут (ограничение signState/verifyState).
 */
import { signState, verifyState } from "./oauth";

export interface GoogleSignupTicket {
  email: string;
  name: string;
  locale: string;
}

export function packGoogleSignupTicket(t: GoogleSignupTicket, secret: string) {
  return signState(Buffer.from(JSON.stringify(t)).toString("base64url"), secret);
}

export function unpackGoogleSignupTicket(ticket: string, secret: string): GoogleSignupTicket | null {
  const raw = verifyState(ticket, secret);
  if (!raw) return null;
  try {
    const t = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<GoogleSignupTicket>;
    return typeof t.email === "string" && t.email.includes("@") && typeof t.locale === "string"
      ? { email: t.email, name: typeof t.name === "string" ? t.name : "", locale: t.locale }
      : null;
  } catch {
    return null;
  }
}
