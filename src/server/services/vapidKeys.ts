import "server-only";
import crypto from "crypto";
import { db } from "@/server/db";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

const SETTING_KEY = "_vapid";

type VapidRow = { publicKey: string; privateKey: string; createdAt: string };

/** VAPID P-256 ключи через встроенный ECDH — не зависит от пакета web-push */
function generateKeys(): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey("base64url"),
    privateKey: ecdh.getPrivateKey("base64url"),
  };
}

/** Читает VAPID-ключи из базы или генерирует новую пару при первом обращении */
export async function getOrCreateVapidKeys(): Promise<VapidRow> {
  const encKey = process.env.SETTINGS_ENCRYPTION_KEY;
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });

  if (row) {
    const v = row.value as Partial<VapidRow>;
    let priv = v.privateKey ?? "";
    if (isEncrypted(priv) && encKey) {
      try { priv = decrypt(priv, encKey); } catch { priv = ""; }
    }
    if (v.publicKey && priv) return { publicKey: v.publicKey, privateKey: priv, createdAt: v.createdAt ?? "" };
  }

  // Первое обращение: генерируем пару и сохраняем зашифрованной
  const keys = generateKeys();
  const createdAt = new Date().toISOString();
  const stored: VapidRow = {
    publicKey: keys.publicKey,
    privateKey: encKey ? encrypt(keys.privateKey, encKey) : keys.privateKey,
    createdAt,
  };
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: stored as object },
    update: { value: stored as object },
  });
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt };
}

export type VapidStatus = { present: boolean; createdAt: string | null };

/** Статус наличия ключей без расшифровки (для UI «Ключи») */
export async function getVapidStatus(): Promise<VapidStatus> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { present: false, createdAt: null };
  const v = row.value as Partial<VapidRow>;
  return { present: !!(v.publicKey && v.privateKey), createdAt: v.createdAt ?? null };
}
