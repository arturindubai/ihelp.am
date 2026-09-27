/**
 * Разбор текста команды cc — выносится в отдельный модуль для тестирования.
 * Источники по приоритету: --text-file > позиционный аргумент > непустой stdin.
 * Пустой stdin не перекрывает позиционный аргумент.
 */

export type CcTextContext = {
  /** Содержимое --text-file (уже прочитанное вызывающей стороной); undefined — флага нет */
  fileContent?: string;
  /** Позиционные аргументы после команды (pos после сдвига cmd) */
  positional: string[];
  /** Текст из stdin; null — stdin не читался; пустая строка — stdin пустой */
  stdinContent: string | null;
  /** true (по умолчанию) — pos[0] это ключ задачи, текст с pos[1]; false — весь pos текст */
  skipFirst?: boolean;
};

/**
 * Возвращает текст команды с учётом приоритета источников.
 * Пустой stdin игнорируется в пользу позиционного аргумента.
 */
export function resolveText(ctx: CcTextContext): string {
  const { fileContent, positional, stdinContent, skipFirst = true } = ctx;
  if (fileContent !== undefined) return fileContent;
  const positionalText = (skipFirst ? positional.slice(1) : positional).join(" ").trim();
  if (positionalText) return positionalText;
  return stdinContent?.trim() || "";
}

/**
 * Нужно ли читать stdin перед выполнением команды.
 * Возвращает false, если:
 * - stdin терминал (пользователь работает интерактивно)
 * - передан --text-file
 * - в позиционных аргументах уже есть текст (команда не зависает при открытом молчащем stdin)
 */
export function shouldReadStdin(opts: {
  isTTY: boolean;
  hasTextFile: boolean;
  cmd: string;
  positional: string[];
}): boolean {
  if (opts.isTTY || opts.hasTextFile) return false;
  // Команды, у которых нет позиционного ключа задачи — весь pos это текст
  const noKeyCmds = new Set(["intake", "msg", "search", "help", "list", "triage", "attention", "inbox", "worktrees", "gc", "lib"]);
  const hasTextArg = noKeyCmds.has(opts.cmd) ? opts.positional.length > 0 : opts.positional.length > 1;
  return !hasTextArg;
}
