/**
 * Чистые помощники входа через Apple (Sign in with Apple, без доступа к серверу):
 * адрес авторизации, клиентский секрет (подписанный JWT ES256) и разбор id_token.
 */
import crypto from "crypto";

const AUTH_URL = "https://appleid.apple.com/auth/authorize";

/** Apple умеет возвращаться только формой POST (response_mode=form_post) — учитывайте это в callback-роуте */
export function appleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "form_post",
    scope: "email",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

/** Клиентский секрет Apple — JWT ES256, подписанный приватным ключом (.p8) из Apple Developer. Живёт 1 час, генерируется заново на каждый обмен кода */
export function buildAppleClientSecret(teamId: string, keyId: string, clientId: string, privateKeyPem: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 3600, aud: "https://appleid.apple.com", sub: clientId }));
  const signingInput = `${header}.${payload}`;
  // dsaEncoding: "ieee-p1363" — «сырая» склейка r||s, которую требует JWS ES256 (Node по умолчанию подписывает EC-ключи в DER)
  const signature = crypto.sign("sha256", Buffer.from(signingInput), { key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

export interface AppleProfile {
  email: string;
  emailVerified: boolean;
}

/**
 * Данные пользователя из id_token. Токен получен напрямую от Apple по TLS, поэтому подпись не перепроверяем.
 * У Apple email_verified в токене исторически встречается то булевым значением, то строкой "true" — учитываем оба варианта.
 */
export function parseAppleIdToken(idToken: string): AppleProfile | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email) return null;
    return { email, emailVerified: payload.email_verified === true || payload.email_verified === "true" };
  } catch {
    return null;
  }
}
