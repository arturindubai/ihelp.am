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
 * Разбивает текст на несколько вопросов только если автор явно пронумеровал их («1. …?», «2. …?»)
 * и каждый заканчивается знаком вопроса. Пустые строки, абзацы-пояснения, рекомендации, разделители
 * и контекст не создают отдельных блоков с полем ответа.
 */
export function parseMultiQuestion(text: string): MultiQuestionBlock[] {
  // Ищем явно пронумерованные блоки «N. текст» или «N) текст»
  const numberedRe = /(?:^|\n)(\d+)[.)]\s+([\s\S]+?)(?=\n\d+[.)]\s|$)/g;
  const matches = [...text.matchAll(numberedRe)];

  // Считать отдельными вопросами только если их ≥ 2 и первая строка каждого кончается «?»
  // (варианты А/Б/В на следующих строках — часть вопроса, не конец текста)
  if (matches.length >= 2 && matches.every((m) => /\?\s*$/.test(m[2].trim().split("\n")[0].trim()))) {
    return matches.map((m) => {
      const block = m[2].trim();
      const parsed = parseVariants(block);
      return { question: parsed?.question ?? block, variants: parsed?.variants ?? null };
    });
  }

  // Иначе весь текст — один вопрос с одним полем ответа
  const parsed = parseVariants(text);
  return [{ question: parsed?.question ?? text, variants: parsed?.variants ?? null }];
}

/**
 * Подсчитывает число уникальных «карточек» (групп) из списка задач, заблокированных на владельце.
 * Задачи с одинаковым текстом вопроса (trimmed blockedReason) объединяются в одну карточку.
 * Используется как в ccCounts() (бейдж вкладки), так и в YouTab (заголовок секции) — чтобы числа совпадали.
 */
export function countOwnerCards(tasks: { blockedReason: string | null }[]): number {
  const seen = new Set<string>();
  for (const t of tasks) {
    seen.add((t.blockedReason ?? "").trim());
  }
  return seen.size;
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
