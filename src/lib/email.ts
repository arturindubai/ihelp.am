/**
 * Нормализация email для кодов входа и регистрации (AUTH-14): нижний регистр, без пробелов по краям.
 * Проверка намеренно простая — «что-то@что-то.что-то»: настоящую проверку делает код из письма.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Адрес для показа с частично скрытой левой частью: a***@gmail.com */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}
