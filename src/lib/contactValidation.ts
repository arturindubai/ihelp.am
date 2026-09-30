/** Проверяет, является ли строка валидным телефоном или e-mail для формы «Уведомить меня» */
export function isValidContact(v: string): boolean {
  const t = v.trim();
  // email: что-то @ что-то . что-то
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return true;
  // телефон: + или цифра, минимум 8 цифр итого
  if (/^[\+\d][\d\s\-\(\)]{7,}$/.test(t)) return true;
  return false;
}
