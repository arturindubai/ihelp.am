import "server-only";
import { CONTACT_KEYS, type ContactKey } from "@/lib/contacts";

/**
 * ЕДИНОЕ МЕСТО КОНТАКТОВ БИЗНЕСА — блок CONTACT_* в /opt/ihelp.am/.env.
 * Заданное там значение перекрывает админку (поле в настройках становится только для чтения).
 * Смена контактов: поправить .env → docker compose up -d (пересборка не нужна).
 */
export const CONTACT_ENV: Record<ContactKey, string> = {
  phone: "CONTACT_PHONE",
  whatsapp: "CONTACT_WHATSAPP",
  telegram: "CONTACT_TELEGRAM",
  email: "CONTACT_EMAIL",
  instagram: "CONTACT_INSTAGRAM",
};

/** Контакты, заданные в .env (пустые не учитываются) */
export function envContacts(): Partial<Record<ContactKey, string>> {
  const out: Partial<Record<ContactKey, string>> = {};
  for (const k of CONTACT_KEYS) {
    const v = process.env[CONTACT_ENV[k]]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

/** Поля, закреплённые через .env: ключ → имя переменной (для подсказки в админке) */
export function lockedContacts(): Partial<Record<ContactKey, string>> {
  return Object.fromEntries(Object.keys(envContacts()).map((k) => [k, CONTACT_ENV[k as ContactKey]]));
}
