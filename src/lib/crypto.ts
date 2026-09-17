/**
 * Шифрование секретов (ключи интеграций) для хранения в базе: AES-256-GCM.
 * Формат значения: enc:v1:<iv>:<tag>:<данные> (base64). Ключ — 32 байта в hex (64 символа).
 */
import crypto from "crypto";

const PREFIX = "enc:v1:";

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

function toKey(hex: string) {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("encryption key must be 64 hex chars");
  return key;
}

export function encrypt(plain: string, keyHex: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", toKey(keyHex), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(":");
}

/** Бросает ошибку при неверном ключе или подменённых данных */
export function decrypt(value: string, keyHex: string) {
  if (!isEncrypted(value)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", toKey(keyHex), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
