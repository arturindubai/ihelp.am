/** Лимит длины текста в одной записи ленты задачи (символов) */
export const COMMENT_LIMIT = 5000;

/** Резюме: первые N символов полного текста для записи в ленту */
export const COMMENT_SUMMARY_LEN = 4950;

/** Нужно ли сохранять текст в Библиотеку? */
export function needsLibrary(text: string): boolean {
  return text.trim().length > COMMENT_LIMIT;
}

/**
 * Строит текст записи ленты для случая, когда полный текст отправлен в Библиотеку.
 * Хранит первые COMMENT_SUMMARY_LEN символов оригинала + ссылку на запись.
 */
export function buildSummaryText(fullText: string, slug: string): string {
  const body = fullText.slice(0, COMMENT_SUMMARY_LEN);
  return `${body}\n\n[Полный текст: Библиотека, ${slug}]`;
}
