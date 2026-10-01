/**
 * Проверяет, что путь является допустимым локальным редиректом.
 * Отклоняет пустые строки, протоколо-относительные URL (//evil.com) и внешние адреса.
 */
export function safeReturnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}
