/**
 * Реестр ключей сервисов — страница Control Center → «Ключи» (как Secrets в админке LIA).
 * Один список и для страницы, и для шифрования настроек (SECRET_PATHS в src/server/settings.ts):
 * новый ключ добавляется только здесь. Значения хранятся зашифрованными в базе и никогда не показываются.
 */

export type KeyCheck = "telegram" | "resend";

export type KeyDef = {
  /** Путь в настройках: раздел.поле */
  path: string;
  group: "telegram" | "login" | "mail" | "codes";
  /** Как проверить ключ живым запросом к сервису; без проверки — пусто */
  check?: KeyCheck;
  /** Где взять ключ — ссылка на кабинет сервиса */
  url?: string;
};

export const KEYS: KeyDef[] = [
  { path: "team.botToken", group: "telegram", check: "telegram", url: "https://t.me/BotFather" },
  { path: "notify.telegramBotToken", group: "telegram", check: "telegram", url: "https://t.me/BotFather" },
  { path: "otp.telegram.gatewayToken", group: "codes", url: "https://gateway.telegram.org" },
  { path: "otp.sms.authToken", group: "codes", url: "https://console.twilio.com" },
  { path: "otp.whatsapp.accessToken", group: "codes", url: "https://business.facebook.com" },
  { path: "mail.apiKey", group: "mail", check: "resend", url: "https://resend.com/api-keys" },
  { path: "google.clientSecret", group: "login", url: "https://console.cloud.google.com/apis/credentials" },
  { path: "apple.privateKey", group: "login", url: "https://developer.apple.com/account/resources/authkeys/list" },
];

export const KEY_GROUPS = ["telegram", "codes", "mail", "login"] as const;

export const keyDef = (path: string) => KEYS.find((k) => k.path === path) ?? null;

/** Ключ из формы: без пробелов по краям; многострочный — только закрытый ключ Apple (.p8) */
export function cleanKeyValue(path: string, raw: string): string | null {
  const v = path === "apple.privateKey" ? raw.trim() : raw.trim().replace(/\s+/g, "");
  if (v.length < 8 || v.length > 8000) return null;
  return v;
}

/** Токен бота Telegram: «123456789:AA…» */
export const isTelegramBotToken = (v: string) => /^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(v);
