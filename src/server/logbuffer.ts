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
