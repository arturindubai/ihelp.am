import { countryByPhone } from "./countries";

/** Нормализация номера в формат E.164: +37491123456 */
export function normalizePhone(input: string): string | null {
  let d = (input || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    d = d.replace(/\D/g, "");
    if (d.startsWith("0") && d.length === 9) d = "374" + d.slice(1); // 091 123456
    else if (d.length === 8) d = "374" + d; // 91123456
    d = "+" + d;
  }
  const digits = d.slice(1).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

export function formatPhone(p: string): string {
  if (p.startsWith("+374") && p.length === 12) return `+374 ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9)}`;
  return p;
}

/**
 * Код страны из селектора + введённая национальная часть → E.164 (AUTH-12).
 * Номер, вставленный целиком («+» или «00» в начале), берётся как есть — так можно ввести страну,
 * которой нет в списке. Один ведущий 0 (внутристрановой префикс: 091 123456, 07123 456789) отбрасывается,
 * для России ещё и ведущая 8 при 11 цифрах.
 */
export function composePhone(dial: string, national: string): string | null {
  const raw = (national || "").trim();
  if (/^(\+|00)/.test(raw)) return normalizePhone(raw);
  let digits = raw.replace(/\D/g, "");
  if (dial === "7" && digits.length === 11 && digits.startsWith("8")) digits = digits.slice(1);
  else if (digits.length > 1 && digits.startsWith("0")) digits = digits.slice(1);
  if (!digits) return null;
  return normalizePhone(`+${dial}${digits}`);
}

/** E.164 → страна и остальные цифры: предзаполнить селектор и поле (например, телефон из Telegram-бота) */
export function splitPhone(e164: string): { iso: string; national: string } | null {
  const c = countryByPhone(e164);
  if (!c) return null;
  return { iso: c.iso, national: e164.replace(/\D/g, "").slice(c.dial.length) };
}
