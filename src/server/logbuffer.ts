/**
 * Хвост журнала приложения в памяти — для страницы Control Center → Логи (как Logs в LIA):
 * последние ошибки и предупреждения без SSH. Перехватывает console.error / warn / log процесса Next.js,
 * вывод в docker logs не меняется. Живёт до перезапуска контейнера — полная история остаётся в docker compose logs.
 */

export type LogLine = { at: string; level: "error" | "warn" | "info"; text: string };

const MAX = 600;
const KEY = Symbol.for("ihelp.logbuffer");
type Store = { lines: LogLine[]; installed: boolean; startedAt: string };

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  if (!g[KEY]) g[KEY] = { lines: [], installed: false, startedAt: new Date().toISOString() };
  return g[KEY]!;
}

/**
 * Секреты в строках журнала не должны попасть на страницу: ключи, токены, пароли в URL и коды входа —
 * пока каналы доставки не подключены, код пишется в журнал ([otp:dev]), и по нему можно войти за клиента
 */
export function scrub(text: string) {
  return text
    .replace(/(\[otp[^\]]*\][^\n]*?→\s*)\d{3,10}/g, "$1***")
    .replace(/\b(code|код)(["'\s:=]+)\d{4,10}\b/gi, "$1$2***")
    .replace(/(token|secret|password|api[_-]?key|cc-key|authorization)(["'\s:=]+)([^\s"',;]{6,})/gi, "$1$2***")
    .replace(/\/\/([^:/\s]+):([^@/\s]+)@/g, "//$1:***@")
    .replace(/\bbot\d{6,}:[A-Za-z0-9_-]{20,}/g, "bot***");
}

function format(args: unknown[]) {
  return args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}${a.stack ? `\n${a.stack.split("\n").slice(1, 6).join("\n")}` : ""}` : typeof a === "string" ? a : safeJson(a)))
    .join(" ")
    .slice(0, 4000);
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function push(level: LogLine["level"], args: unknown[]) {
  const s = store();
  s.lines.push({ at: new Date().toISOString(), level, text: scrub(format(args)) });
  if (s.lines.length > MAX) s.lines.splice(0, s.lines.length - MAX);
}

/** Подключить перехват один раз на процесс (вызывается из instrumentation.ts) */
export function installLogCapture() {
  const s = store();
  if (s.installed) return;
  s.installed = true;
  const orig = { error: console.error, warn: console.warn, log: console.log };
  console.error = (...args: unknown[]) => {
    push("error", args);
    orig.error(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", args);
    orig.warn(...args);
  };
  console.log = (...args: unknown[]) => {
    push("info", args);
    orig.log(...args);
  };
}

export function logTail(level?: LogLine["level"] | "all") {
  const s = store();
  const lines = !level || level === "all" ? s.lines : s.lines.filter((l) => l.level === level);
  return { lines: [...lines].reverse(), since: s.startedAt, installed: s.installed };
}

/** Сколько ошибок за последние minutes минут — для страницы «Здоровье» */
export function recentErrors(minutes = 60) {
  const from = Date.now() - minutes * 60_000;
  return store().lines.filter((l) => l.level === "error" && Date.parse(l.at) >= from).length;
}

/** Строки ошибок за последние minutes минут — для лог-вотчера */
export function recentErrorLines(minutes = 60): LogLine[] {
  const from = Date.now() - minutes * 60_000;
  return store().lines.filter((l) => l.level === "error" && Date.parse(l.at) >= from);
}

/** Отпечаток ошибки: нормализованный текст первых строк плюс путь к файлу из стека */
export function makeFingerprint(text: string): string {
  // Первый исходный файл проекта в стеке — место в коде
  const locMatch = text.match(/\bsrc\/[^\s"':)]+\.(?:tsx?|jsx?)/);
  const location = locMatch ? locMatch[0].replace(/\d/g, "N") : "";

  const normalized = text
    .split("\n")
    .slice(0, 3)
    .join(" ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "X") // UUID
    .replace(/\b[a-z0-9]{24,}\b/g, "X")   // cuid, sha256 и подобные длинные идентификаторы
    .replace(/\b0x[0-9a-f]+\b/gi, "X")    // hex-числа
    .replace(/https?:\/\/\S+/g, "X")       // URL
    .replace(/(?:^|[\s("'])\/(?:[\w.-]+\/)+[\w.-]+/g, " PATH") // абсолютные пути
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

  const fp = location ? `${normalized}|${location}` : normalized;
  return fp.length >= 10 ? fp : "";
}

/** Ошибка во время рендера страницы (RSC/SSR) — порог 1 повторение вместо 3 */
export function isPageBuildError(text: string): boolean {
  return /\(rsc\)\/|Error occurred prerendering|react-server-dom-webpack/.test(text);
}
