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
