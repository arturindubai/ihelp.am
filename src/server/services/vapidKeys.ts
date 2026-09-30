import "server-only";
import crypto from "crypto";
import { db } from "@/server/db";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";
import { alertTech } from "@/server/alerts";
import { html } from "@/server/notify";

const SETTING_KEY = "_vapid";

type VapidRow = { publicKey: string; privateKey: string; createdAt: string };

export type VapidStatus = { present: boolean; createdAt: string | null; noEncKey?: boolean };

/** VAPID P-256 ключи через встроенный ECDH — не зависит от пакета web-push */
function generateKeys(): { publicKey: string; privateKey: string } {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey("base64url"),
    privateKey: ecdh.getPrivateKey("base64url"),
  };
}

/**
 * Читает VAPID-ключи из базы или генерирует новую пару при первом обращении.
 * Бросает исключение если:
 * — SETTINGS_ENCRYPTION_KEY не задан (п.4 замечаний CTO: без шифрования не сохраняем);
 * — расшифровка закрытого ключа не удалась (п.3: сменился ключ — не затираем старые подписки).
 */
export async function getOrCreateVapidKeys(): Promise<VapidRow> {
  const encKey = process.env.SETTINGS_ENCRYPTION_KEY;

  // п.4: без ключа шифрования push полностью выключен
  if (!encKey) throw new Error("SETTINGS_ENCRYPTION_KEY not set — push disabled");

  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });

  if (row) {
    const v = row.value as Partial<VapidRow>;
    let priv = v.privateKey ?? "";
    if (isEncrypted(priv)) {
      try {
        priv = decrypt(priv, encKey);
      } catch (e) {
        // п.3: расшифровка не удалась — не создаём новую пару, отправляем тех-алерт
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[vapidKeys] расшифровка закрытого ключа не удалась:", msg);
        alertTech(
          "vapid-decrypt-error",
          html`🔑 <b>VAPID: расшифровка закрытого ключа не удалась</b>\nВозможно, изменился или пропал SETTINGS_ENCRYPTION_KEY. Все push-подписки перестали работать. Проверьте переменную окружения.\n<code>${msg}</code>`,
          60,
        ).catch(() => null);
        throw new Error("VAPID private key decryption failed — SETTINGS_ENCRYPTION_KEY may have changed");
      }
    }
    if (v.publicKey && priv) return { publicKey: v.publicKey, privateKey: priv, createdAt: v.createdAt ?? "" };
  }

  // Первое обращение: генерируем пару и сохраняем зашифрованной
  const keys = generateKeys();
  const createdAt = new Date().toISOString();
  const stored: VapidRow = {
    publicKey: keys.publicKey,
    privateKey: encrypt(keys.privateKey, encKey),
    createdAt,
  };
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: stored as object },
    update: { value: stored as object },
  });
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt };
}

/** Статус наличия ключей без расшифровки (для UI «Ключи») */
export async function getVapidStatus(): Promise<VapidStatus> {
  if (!process.env.SETTINGS_ENCRYPTION_KEY) {
    return { present: false, createdAt: null, noEncKey: true };
  }
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { present: false, createdAt: null };
  const v = row.value as Partial<VapidRow>;
  return { present: !!(v.publicKey && v.privateKey), createdAt: v.createdAt ?? null };
}
