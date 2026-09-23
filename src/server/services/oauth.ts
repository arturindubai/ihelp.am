import "server-only";
import type { Settings } from "../settings";
import { googleAuthUrl as buildAuthUrl, parseIdToken } from "@/lib/oauth";
import { appleAuthUrl as buildAppleUrl, buildAppleClientSecret, parseAppleIdToken } from "@/lib/appleAuth";

export { signState, verifyState, parseIdToken } from "@/lib/oauth";
export type { GoogleProfile } from "@/lib/oauth";
export { parseAppleIdToken } from "@/lib/appleAuth";
export type { AppleProfile } from "@/lib/appleAuth";

/**
 * Вход через Google (OAuth 2.0 + OpenID Connect), поток «authorization code».
 * Адрес возврата для Google Cloud Console: <APP_URL>/api/auth/google/callback.
 * Google принимает только https (исключение — localhost), поэтому вход заработает после домена и сертификата.
 * Пускаем только тех, у кого в системе уже указан такой же email: новый аккаунт не создаётся.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const googleRedirectUri = () => `${(process.env.APP_URL || "").replace(/\/$/, "")}/api/auth/google/callback`;

export const googleAuthUrl = (s: Settings, state: string) => buildAuthUrl(s.google.clientId, googleRedirectUri(), state);

/** Обмен кода на токены. Возвращает профиль или null при любой ошибке */
export async function exchangeGoogleCode(s: Settings, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: s.google.clientId,
    client_secret: s.google.clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[google] token exchange failed", r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const json = (await r.json()) as { id_token?: string };
    return json.id_token ? parseIdToken(json.id_token) : null;
  } catch (e) {
    console.error("[google] token exchange error", e);
    return null;
  }
}

/**
 * Вход через Apple (Sign in with Apple), поток «authorization code» с response_mode=form_post.
 * Адрес возврата для Apple Developer: <APP_URL>/api/auth/apple/callback. Требует https, как и Google.
 * Та же логика, что у Google: пускаем только тех, у кого такой email уже есть в системе.
 */
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

export const appleRedirectUri = () => `${(process.env.APP_URL || "").replace(/\/$/, "")}/api/auth/apple/callback`;

export const appleAuthUrl = (s: Settings, state: string) => buildAppleUrl(s.apple.clientId, appleRedirectUri(), state);

/** Обмен кода на токены. Возвращает профиль или null при любой ошибке */
export async function exchangeAppleCode(s: Settings, code: string) {
  const clientSecret = buildAppleClientSecret(s.apple.teamId, s.apple.keyId, s.apple.clientId, s.apple.privateKey);
  const body = new URLSearchParams({
    code,
    client_id: s.apple.clientId,
    client_secret: clientSecret,
    redirect_uri: appleRedirectUri(),
    grant_type: "authorization_code",
  });
  try {
    const r = await fetch(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[apple] token exchange failed", r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const json = (await r.json()) as { id_token?: string };
    return json.id_token ? parseAppleIdToken(json.id_token) : null;
  } catch (e) {
    console.error("[apple] token exchange error", e);
    return null;
  }
}
