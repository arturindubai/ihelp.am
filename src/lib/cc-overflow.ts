/** Лимит длины текста в одной записи ленты задачи (символов) */
export const COMMENT_LIMIT = 5000;

/** Резюме: первые N символов полного текста для записи в ленту */
export const COMMENT_SUMMARY_LEN = 4950;

/** Нужно ли сохранять текст в Канон? */
export function needsLibrary(text: string): boolean {
  return text.trim().length > COMMENT_LIMIT;
}

/**
 * Строит текст записи ленты для случая, когда полный текст отправлен в Канон.
 * Хранит первые COMMENT_SUMMARY_LEN символов оригинала + ссылку на запись.
 */
export function buildSummaryText(fullText: string, slug: string): string {
  const body = fullText.slice(0, COMMENT_SUMMARY_LEN);
  return `${body}\n\n[Полный текст: Канон, ${slug}]`;
}

const KIND_LABELS: Record<string, string> = {
  report: "отчёт",
  handoff: "передача",
  triage: "итог триажа",
  review: "отзыв",
  note: "заметка",
};

/**
 * Заголовок записи Канона для длинного текста ленты.
 * Формат: «КЛЮЧ: отчёт dev-1, 28 сентября 2026 г.»
 */
export function buildLibraryTitle(taskKey: string, author: string, kind = "note"): string {
  const label = KIND_LABELS[kind] ?? "запись";
  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return `${taskKey}: ${label} ${author}, ${date}`;
}
