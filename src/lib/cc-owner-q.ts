/**
 * Парсинг вариантов в тексте блокировки: латиница A-E / а-е и кириллица А-Д / а-д, любой регистр.
 * Вопрос с вариантами: "Текст вопроса? А) Да Б) Нет В) Позже"
 */
export function parseVariants(text: string): { question: string; variants: { id: string; text: string }[] } | null {
  // (?:^|\s) — маркер в начале строки или после пробела; захватывает пробел-разделитель
  const markers = [...text.matchAll(/(?:^|\s)([A-Ea-eАБВГДабвгд])\)\s*/g)];
  if (markers.length < 2) return null;
  const variants: { id: string; text: string }[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index! + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index! : text.length;
    const varText = text.slice(start, end).replace(/\s*\/\s*$/, "").trim();
    variants.push({ id: markers[i][1].toUpperCase(), text: varText });
  }
  return { question: text.slice(0, markers[0].index!).trim(), variants };
}
