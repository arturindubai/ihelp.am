/**
 * Парсинг вариантов A/B/C/D/E в тексте блокировки.
 * Вопрос с вариантами: "Текст вопроса? A) Да B) Нет C) Позже"
 */
export function parseVariants(text: string): { question: string; variants: { id: string; text: string }[] } | null {
  const markers = [...text.matchAll(/\b([A-E])\)\s+/g)];
  if (markers.length < 2) return null;
  const variants: { id: string; text: string }[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index! + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index! : text.length;
    const varText = text.slice(start, end).replace(/\s*\/\s*$/, "").trim();
    variants.push({ id: markers[i][1], text: varText });
  }
  return { question: text.slice(0, markers[0].index!).trim(), variants };
}
