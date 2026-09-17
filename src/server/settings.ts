import "server-only";
import { db } from "./db";
import type { PricingRules } from "@/lib/pricing";
import { envContacts } from "./contacts";

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
  notify: { telegramBotToken: string; telegramChatId: string };
}

export const DEFAULT_SETTINGS: Settings = {
  brand: {
    name: "HomeCare",
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
  notify: { telegramBotToken: "", telegramChatId: "" },
};

type AnyObj = Record<string, unknown>;
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

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await db.setting.findMany();
  let s = DEFAULT_SETTINGS;
  for (const r of rows) if (!r.key.startsWith("_")) s = merge(s, { [r.key]: r.value });
  // Контакты из .env важнее сохранённых в админке
  s = { ...s, brand: { ...s.brand, ...envContacts() } };
  cache = { at: Date.now(), value: s };
  return s;
}

export async function saveSettingsSection<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
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
