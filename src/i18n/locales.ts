/** Коды в URL и интерфейсе. Для SEO (hreflang, <html lang>) используется ISO-код. */
export const locales = ["ru", "en", "am"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";

export const localeLabels: Record<Locale, string> = { ru: "RU", en: "ENG", am: "ARM" };
export const localeNames: Record<Locale, string> = { ru: "Русский", en: "English", am: "Հայերեն" };
export const localeIso: Record<Locale, string> = { ru: "ru", en: "en", am: "hy" };

export type I18nText = Partial<Record<Locale, string>>;

/** Достаёт перевод из мультиязычного JSON-поля с откатом на русский */
export function tr(value: unknown, locale: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const v = value as Record<string, string>;
  return v[locale] || v[defaultLocale] || Object.values(v).find(Boolean) || "";
}
