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

export type MultiQuestionBlock = { question: string; variants: { id: string; text: string }[] | null };

/**
 * Разбивает текст на несколько вопросов, если их несколько (разделены пустой строкой или нумерацией).
 * Каждый блок прогоняется через parseVariants. Если блок один — поведение аналогично parseVariants.
 */
export function parseMultiQuestion(text: string): MultiQuestionBlock[] {
  const rawBlocks = text.split(/\n\n+|\n(?=\d+\.\s)/);
  const blocks = rawBlocks.map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    const parsed = parseVariants(text);
    return [{ question: parsed?.question ?? text, variants: parsed?.variants ?? null }];
  }
  return blocks.map((block) => {
    const parsed = parseVariants(block);
    return { question: parsed?.question ?? block, variants: parsed?.variants ?? null };
  });
}

/**
 * Формирует причину блокировки при откладывании на N дней.
 * Исходный вопрос сохраняется после даты: триаж восстановит блокировку на владельце после разблокировки по дате.
 */
export function buildPostponeReason(untilStr: string, originalReason: string): string {
  const base = `Отложено до ${untilStr}`;
  const trimmed = originalReason.trim();
  return trimmed ? `${base}. ${trimmed}` : base;
}
