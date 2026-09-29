/**
 * Отказы прав в логе запуска воркера (DEV-79): сторона диспетчера.
 * scripts/dispatcher.mjs берёт permission_denials из ответа claude -p и дописывает раздел в конец лога запуска —
 * отдельного поля в таблице WorkerRun для них нет. Разбор раздела и сводка для «Здоровья» — src/lib/worker-denials.ts.
 *
 * В лог попадает только форма команды: текст в кавычках, ключи, длинные строки и параметры адресов вырезаются.
 * Файл на чистом JavaScript (.mjs): диспетчер запускается Node 20 без сборки. Типы — в worker-denials-format.d.mts.
 */

/** Заголовок раздела в логе: «--- отказы прав: 3 ---» */
export const DENIALS_MARK = "--- отказы прав:";
/** Сколько форм пишем в лог и какой длины: раздел должен уместиться в хвост лога */
export const DENIALS_MAX_LINES = 25;
export const DENIALS_MAX_LEN = 110;

const cut = (s) => (s.length > DENIALS_MAX_LEN ? `${s.slice(0, DENIALS_MAX_LEN - 1)}…` : s);

/** Заменить содержимое кавычек на «…»: текст аргумента в лог не попадает. Незакрытая кавычка — до конца строки */
function dropQuoted(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '"' && c !== "'") {
      out += c;
      continue;
    }
    let j = i + 1;
    while (j < text.length && text[j] !== c) j += text[j] === "\\" && c === '"' ? 2 : 1;
    out += `${c}…${c}`;
    i = j;
  }
  return out;
}

/** Убрать из строки всё, что может оказаться секретом или просто текстом аргумента */
function scrub(text) {
  return dropQuoted(text)
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)=\S+/g, "$1=***")
    .replace(/(https?:\/\/[^\s/?#]+)[^\s]*/g, "$1/…")
    .replace(/[A-Za-z0-9_+=-]{24,}/g, "***")
    .replace(/\/worktrees\/[^/\s]+/g, "/worktrees/КЛЮЧ")
    .replace(/\b[A-Z]{2,10}-\d+[A-Z]?\b/g, "КЛЮЧ")
    .replace(/--agent\s+\S+/g, "--agent имя")
    .replace(/\s+/g, " ")
    .trim();
}

/** Форма отклонённого обращения: для Bash — команда без текста аргументов, для остальных — инструмент и папка */
export function denialForm(toolName, toolInput) {
  const tool = String(toolName ?? "?");
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  if (tool === "Bash") {
    const raw = String(input.command ?? "");
    const lines = raw.split("\n");
    // Многострочная команда: берём первую строку — дальше обычно текст heredoc или продолжение отчёта
    const first = lines[0].replace(/\\$/, "").trim();
    const form = scrub(first);
    return cut(`${form || "(пустая команда)"}${lines.length > 1 ? " ⏎…" : ""}`);
  }
  const p = input.file_path ?? input.path ?? input.notebook_path;
  if (typeof p === "string" && p) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
    return cut(`${tool} ${scrub(dir)}…`);
  }
  if (typeof input.url === "string") return cut(`${tool} ${scrub(input.url)}`);
  return cut(tool);
}

/**
 * Раздел лога об отказах. denials — массив permission_denials из ответа claude -p.
 * Не массив (ответа не было) — пустая строка: данных об отказах у запуска нет, в долю он не войдёт.
 */
export function formatDenials(denials) {
  if (!Array.isArray(denials)) return "";
  const forms = denials.map((d) => denialForm(d?.tool_name, d?.tool_input));
  const shown = forms.slice(0, DENIALS_MAX_LINES);
  const rest = forms.length - shown.length;
  return [`${DENIALS_MARK} ${forms.length} ---`, ...shown, ...(rest > 0 ? [`… и ещё ${rest}`] : [])].join("\n");
}
