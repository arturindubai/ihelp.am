/**
 * Контакты бизнеса: единый формат ссылок для сайта.
 * Источник значений — переменные CONTACT_* в .env (src/server/contacts.ts), иначе — Админка → Настройки → Компания.
 * Компоненты не собирают tel:/wa.me/mailto сами, а берут ссылки отсюда.
 */
import { formatPhone, normalizePhone } from "./phone";

export const CONTACT_KEYS = ["phone", "whatsapp", "telegram", "email", "instagram"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export type Contacts = Record<ContactKey, string>;
export interface ContactLink {
  key: ContactKey;
  href: string;
  label: string;
}

/** "@name", "name" или "https://t.me/name" → "name" */
function handle(v: string, host: string) {
  return v
    .trim()
    .replace(new RegExp(`^(https?://)?(www\\.)?${host.replace(/\./g, "\\.")}/`, "i"), "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

export function contactLink(c: Partial<Contacts>, key: ContactKey): ContactLink | null {
  const v = c[key]?.trim();
  if (!v) return null;
  switch (key) {
    case "phone":
    case "whatsapp": {
      const p = normalizePhone(v) || v;
      return key === "phone"
        ? { key, href: `tel:${p}`, label: formatPhone(p) }
        : { key, href: `https://wa.me/${p.replace(/\D/g, "")}`, label: formatPhone(p) };
    }
    case "telegram": {
      const h = handle(v, "t.me");
      return h ? { key, href: `https://t.me/${h}`, label: `@${h}` } : null;
    }
    case "instagram": {
      const h = handle(v, "instagram.com");
      return h ? { key, href: `https://instagram.com/${h}`, label: `@${h}` } : null;
    }
    case "email":
      return { key, href: `mailto:${v}`, label: v };
  }
}

const CHANNEL_NAMES: Partial<Record<ContactKey, string>> = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" };

/** Подпись для показа: у мессенджеров и соцсетей — название канала, чтобы телефон и WhatsApp с одним номером не путались */
export function contactTitle(l: ContactLink) {
  const name = CHANNEL_NAMES[l.key];
  return name ? `${name} ${l.label}` : l.label;
}

export function contactLinks(c: Partial<Contacts>): ContactLink[] {
  return CONTACT_KEYS.map((k) => contactLink(c, k)).filter((x): x is ContactLink => !!x);
}

/** Подстановки в текстах страниц (оферта и т.п.): {{phone}}, {{whatsapp}}, {{telegram}}, {{email}}, {{instagram}}, {{name}} */
export function fillContacts(text: string, c: Partial<Contacts> & { name?: string }) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    if (k === "name") return c.name ?? m;
    if (!(CONTACT_KEYS as readonly string[]).includes(k)) return m;
    return contactLink(c, k as ContactKey)?.label ?? "";
  });
}
