/**
 * Чистые помощники входа через Google (без доступа к серверу): адрес авторизации,
 * подпись состояния перехода и разбор id_token.
 */
import crypto from "crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function googleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTH_URL}?${params}`;
}

/** Подпись состояния (защита от подделки перехода), живёт 10 минут */
export function signState(value: string, secret: string) {
  const exp = Date.now() + 10 * 60_000;
  const payload = `${value}.${exp}`;
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifyState(state: string, secret: string) {
  const [value, exp, sig] = (state || "").split(".");
  if (!value || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${value}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Данные пользователя из id_token. Токен получен напрямую от Google по TLS, поэтому подпись не перепроверяем */
export function parseIdToken(idToken: string): GoogleProfile | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email) return null;
    return { email, emailVerified: payload.email_verified === true, name: typeof payload.name === "string" ? payload.name : undefined };
  } catch {
    return null;
  }
}
