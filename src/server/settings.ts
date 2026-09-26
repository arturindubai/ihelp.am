import "server-only";
import { db } from "./db";
import type { PricingRules } from "@/lib/pricing";
import { envContacts } from "./contacts";
import { decrypt, encrypt, isEncrypted } from "@/lib/crypto";
import { KEYS } from "@/lib/keys";

export interface Settings {
  brand: { name: string; tagline: Record<string, string>; phone: string; whatsapp: string; telegram: string; email: string; instagram: string; city: Record<string, string> };
  locales: { enabled: string[] };
  booking: {
    slotStepMin: number;
    bufferMin: number;
    leadHours: number;
    horizonDays: number;
    freeCancelHours: number;
    subscriptionHorizonDays: number;
    allowChooseMaster: boolean;
    districts: string[];
  };
  pricing: PricingRules;
  payments: { cashEnabled: boolean; cardEnabled: boolean };
  otp: {
    codeLength: number;
    ttlMin: number;
    resendSec: number;
    maxAttempts: number;
    sms: { enabled: boolean; provider: "twilio"; accountSid: string; authToken: string; from: string };
    whatsapp: { enabled: boolean; phoneNumberId: string; accessToken: string; templateName: string; templateLang: string };
    telegram: { enabled: boolean; gatewayToken: string };
  };
  /** telegramBotUsername — имя бота без @ (для кнопки «Войти через Telegram»); заполняется при подключении входа через бота */
  notify: { telegramBotToken: string; telegramChatId: string; techChatId: string; telegramBotUsername: string; teamChatId: string; telegramOrderThreadId: string; telegramTechThreadId: string };
  /** Вход через Google (OAuth). Адрес возврата: <APP_URL>/api/auth/google/callback — работает только по https */
  google: { enabled: boolean; clientId: string; clientSecret: string };
  /** Вход через Apple (Sign in with Apple). Адрес возврата: <APP_URL>/api/auth/apple/callback — работает только по https.
   *  clientId — Services ID из Apple Developer, privateKey — содержимое .p8 целиком */
  apple: { enabled: boolean; teamId: string; keyId: string; clientId: string; privateKey: string };
  /** Отправка писем через Resend: домен должен быть подтверждён в кабинете сервиса */
  mail: { enabled: boolean; apiKey: string; from: string; replyTo: string };
  /**
   * Бот команды в Telegram (как бот LIA): задачи владельца → входящие IN-N, «статус», сообщения «Нужен ты».
   * Отдельный от бота входа клиентов (notify.telegramBotToken). Токен вставляется в Control Center → «Ключи»
   */
  team: {
    botToken: string;
    botUsername: string;
    /** Привязанные к боту люди команды: только им бот принимает задачи и пишет */
    members: { telegramId: number; name: string; addedAt: string; addedBy: string }[];
    /** Одноразовый код привязки: ссылка t.me/<бот>?start=<код>, действует 30 минут */
    linkCode: string;
    linkCodeAt: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  brand: {
    name: "iHelp",
    tagline: { ru: "Уборка и услуги для дома в Ереване", en: "Home cleaning & services in Yerevan", am: "" },
    phone: "",
    whatsapp: "",
    telegram: "",
    email: "",
    instagram: "",
    city: { ru: "Ереван", en: "Yerevan", am: "Երևան" },
  },
  locales: { enabled: ["ru"] },
  booking: {
    slotStepMin: 30,
    bufferMin: 30,
    leadHours: 3,
    horizonDays: 21,
    freeCancelHours: 24,
    subscriptionHorizonDays: 28,
    allowChooseMaster: true,
    districts: ["Кентрон", "Арабкир", "Давташен", "Аджапняк", "Малатия-Себастия", "Шенгавит", "Эребуни", "Канакер-Зейтун", "Норк-Мараш", "Нор Норк", "Аван", "Нубарашен"],
  },
  pricing: { roundTo: 50, firstVisitDiscount: 10, firstVisitCommittedDiscount: 25, commitmentMinVisits: 4, stackDiscounts: false },
  payments: { cashEnabled: true, cardEnabled: false },
  otp: {
    codeLength: 4,
    ttlMin: 5,
    resendSec: 60,
    maxAttempts: 5,
    sms: { enabled: false, provider: "twilio", accountSid: "", authToken: "", from: "" },
    whatsapp: { enabled: false, phoneNumberId: "", accessToken: "", templateName: "", templateLang: "ru" },
    telegram: { enabled: false, gatewayToken: "" },
  },
  notify: { telegramBotToken: "", telegramChatId: "", techChatId: "", telegramBotUsername: "", teamChatId: "", telegramOrderThreadId: "", telegramTechThreadId: "" },
  google: { enabled: false, clientId: "", clientSecret: "" },
  apple: { enabled: false, teamId: "", keyId: "", clientId: "", privateKey: "" },
  mail: { enabled: false, apiKey: "", from: "", replyTo: "" },
  team: { botToken: "", botUsername: "", members: [], linkCode: "", linkCodeAt: "" },
};

/** Ключи интеграций: в базе и бэкапах хранятся зашифрованными (ключ SETTINGS_ENCRYPTION_KEY — в .env, в бэкапы не попадает) */
export const SECRET_PATHS = KEYS.map((k) => k.path);

/** Оплата картой включается после интеграции эквайринга (задача PAY-1). До этого переключатель в админке заблокирован */
export const CARD_PAYMENTS_INTEGRATED = false;

type AnyObj = Record<string, unknown>;

/** Родительский объект и имя поля по пути "otp.sms.authToken" */
function locate(root: AnyObj, parts: string[]) {
  const parent = parts.slice(0, -1).reduce<AnyObj | undefined>((o, p) => o?.[p] as AnyObj | undefined, root);
  return parent && typeof parent === "object" ? { parent, field: parts[parts.length - 1] } : null;
}

const warned = new Set<string>();
function merge<T>(base: T, extra: unknown): T {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return (extra as T) ?? base;
  const out: AnyObj = { ...(base as AnyObj) };
  for (const [k, v] of Object.entries(extra as AnyObj)) {
    const b = (base as AnyObj)?.[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? merge(b, v) : v;
  }
  return out as T;
}

let cache: { at: number; value: Settings } | null = null;
let uiCache: { at: number; value: Map<string, { key: string; value: string }[]> } | null = null;
const TTL = 15_000;

/** fresh — мимо кеша: страницы, где только что поменяли настройку («Ключи»), должны видеть новое значение сразу */
export async function getSettings(opts?: { fresh?: boolean }): Promise<Settings> {
  if (!opts?.fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await db.setting.findMany();
  let s = DEFAULT_SETTINGS;
  for (const r of rows) if (!r.key.startsWith("_")) s = merge(s, { [r.key]: r.value });
  s = structuredClone(s);
  // Контакты из .env важнее сохранённых в админке
  s.brand = { ...s.brand, ...envContacts() };
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  for (const path of SECRET_PATHS) {
    const at = locate(s as unknown as AnyObj, path.split("."));
    const v = at?.parent[at.field];
    if (!at || !isEncrypted(v)) continue;
    try {
      if (!key) throw new Error("SETTINGS_ENCRYPTION_KEY не задан");
      at.parent[at.field] = decrypt(v, key);
    } catch (e) {
      at.parent[at.field] = "";
      if (!warned.has(path)) console.error(`[settings] не удалось расшифровать ${path}: ${(e as Error).message}. Введите ключ заново в админке`);
      warned.add(path);
    }
  }
  if (!CARD_PAYMENTS_INTEGRATED) s.payments.cardEnabled = false;
  cache = { at: Date.now(), value: s };
  return s;
}

export async function saveSettingsSection<K extends keyof Settings>(key: K, value: Settings[K]) {
  const stored = structuredClone(value) as unknown as AnyObj;
  const encKey = process.env.SETTINGS_ENCRYPTION_KEY;
  for (const path of SECRET_PATHS) {
    const [root, ...rest] = path.split(".");
    if (root !== key) continue;
    const at = locate(stored, rest);
    const v = at?.parent[at.field];
    if (!at || typeof v !== "string" || !v || isEncrypted(v)) continue;
    if (encKey) at.parent[at.field] = encrypt(v, encKey);
    else console.warn(`[settings] SETTINGS_ENCRYPTION_KEY не задан: ${path} сохранён без шифрования`);
  }
  if (key === "payments" && !CARD_PAYMENTS_INTEGRATED) stored.cardEnabled = false;
  await db.setting.upsert({ where: { key }, create: { key, value: stored as object }, update: { value: stored as object } });
  cache = null;
}

export async function getUiOverrides(locale: string) {
  if (!uiCache || Date.now() - uiCache.at > TTL) {
    try {
      const rows = await db.uiString.findMany();
      const map = new Map<string, { key: string; value: string }[]>();
      for (const r of rows) map.set(r.locale, [...(map.get(r.locale) || []), { key: r.key, value: r.value }]);
      uiCache = { at: Date.now(), value: map };
    } catch {
      return [];
    }
  }
  return uiCache.value.get(locale) || [];
}

export function invalidateUiCache() {
  uiCache = null;
}

/** Секреты не отдаём в браузер целиком */
export function mask(v: string) {
  if (!v) return "";
  return v.length <= 6 ? "••••" : `${v.slice(0, 3)}••••${v.slice(-3)}`;
}

/**
 * Настройки для браузера (страница «Настройки»): каждый ключ из реестра src/lib/keys.ts замаскирован,
 * код привязки бота команды убран. Новый ключ в реестре маскируется здесь сам — поимённо перечислять не нужно
 */
export function maskedSettings(s: Settings): Settings {
  const out = structuredClone(s);
  for (const path of SECRET_PATHS) {
    const [root, ...rest] = path.split(".");
    let node = out[root as keyof Settings] as unknown as Record<string, unknown>;
    for (const p of rest.slice(0, -1)) node = (node?.[p] ?? null) as Record<string, unknown>;
    const last = rest[rest.length - 1];
    if (node && typeof node[last] === "string") node[last] = mask(node[last] as string);
  }
  out.team = { ...out.team, linkCode: "", linkCodeAt: "" };
  return out;
}
