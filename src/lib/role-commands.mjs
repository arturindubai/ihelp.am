/**
 * Сверка команд из инструкций ролей с правами воркеров (scripts/worker-run.sh) — DEV-79.
 *
 * Файл на чистом JavaScript (.mjs), а не .ts: его же импортирует scripts/check-role-commands.mjs,
 * который запускается на сервере обычным Node 20 без сборки. Типы — в role-commands.d.mts.
 *
 * Модель проверки повторяет то, как Claude Code в режиме dontAsk решает, пустить ли команду.
 * Она выведена из журнала отказов (data/workers/*.json, permission_denials) и нарочно строгая:
 * всё, что не проходит наверняка, считается отклонённым — инструкция не должна советовать такое.
 *   1. Составная команда (&&, ||, ;, |) проходит, только если разрешена каждая её часть.
 *   2. Подстановки $(…), `…`, $ПЕРЕМЕННАЯ, heredoc, несколько строк, фон (&), запись в файл через > — не проходят.
 *   3. cd, ls, cat, grep… с путём вне рабочей папки запуска отклоняются, даже если правило Bash(cd *) есть:
 *      разработчик и тестировщик запущены в .claude/worktrees/…, для них /opt/ihelp.am — чужая папка.
 *   4. Запрет (deny) сильнее разрешения (allow).
 */

/** Роли воркеров и инструкция каждой роли */
export const ROLE_DOCS = {
  dev: "docs/roles/DEVELOPER.md",
  tester: "docs/roles/TESTER.md",
  triage: "docs/roles/TRIAGE.md",
  nocode: "docs/roles/NOCODE.md",
  product: "docs/roles/PRODUCT.md",
  designer: "docs/roles/DESIGNER.md",
  deployer: "docs/DEPLOYER_GUIDE.md",
};

export const ROOT_DIR = "/opt/ihelp.am";

/** Рабочая папка запуска роли (scripts/dispatcher.mjs → workDir): ключ задачи заранее неизвестен, поэтому — префикс */
export function workDirFor(role) {
  if (role === "dev" || role === "tester") return `${ROOT_DIR}/.claude/worktrees/`;
  return `${ROOT_DIR}/`;
}

/* ───── разбор scripts/worker-run.sh ───── */

/** Слова массива bash от позиции после «(» до парной «)»: кавычки и комментарии учитываются */
function readArray(text, from) {
  const tokens = [];
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === ")") return { tokens, end: i + 1 };
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" && c === '"' ? 2 : 1;
      tokens.push({ value: text.slice(i + 1, j), quoted: true });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !/[\s)]/.test(text[j])) j++;
    tokens.push({ value: text.slice(i, j), quoted: false });
    i = j;
  }
  return { tokens, end: i };
}

/** Выполнить присваивания массивов (имя=(…) и имя+=(…)) из куска скрипта над набором массивов */
function applyAssignments(text, arrays) {
  const re = /(^|[\s;])([a-z_]+)(\+?)=\(/g;
  let m;
  while ((m = re.exec(text))) {
    const { tokens, end } = readArray(text, re.lastIndex);
    const values = [];
    for (const t of tokens) {
      const ref = t.value.match(/^\$\{([a-z_]+)\[@\]\}$/);
      if (ref) values.push(...(arrays[ref[1]] ?? []));
      else values.push(t.value);
    }
    arrays[m[2]] = m[3] ? [...(arrays[m[2]] ?? []), ...values] : values;
    re.lastIndex = end;
  }
  return arrays;
}

/** Правила каждой роли из текста scripts/worker-run.sh: { роль: { allow: [...], deny: [...] } } */
export function parseWorkerRules(text) {
  const caseAt = text.search(/^case\s+"\$role"\s+in\s*$/m);
  if (caseAt < 0) throw new Error("в worker-run.sh не найден блок case \"$role\"");
  const esacAt = text.indexOf("\nesac", caseAt);
  const base = applyAssignments(text.slice(0, caseAt), {});
  const body = text.slice(caseAt, esacAt < 0 ? undefined : esacAt).split("\n").slice(1);
  const rules = {};
  let role = null;
  let chunk = [];
  const close = () => {
    if (role && role !== "*") {
      const arrays = applyAssignments(chunk.join("\n"), { ...base });
      rules[role] = { allow: arrays.allow ?? [], deny: arrays.deny ?? [] };
    }
    role = null;
    chunk = [];
  };
  for (const line of body) {
    const label = line.match(/^\s*([a-z*]+)\)\s*(.*)$/);
    if (!role && label) {
      role = label[1];
      chunk = [label[2]];
    } else if (role) chunk.push(line);
    if (role && /;;\s*$/.test(line)) close();
  }
  close();
  return rules;
}

/* ───── сопоставление с правилом ───── */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Правило вида «Инструмент(образец)» → { tool, pattern }; «Инструмент» без скобок — pattern = null */
export function parseRule(rule) {
  const m = rule.match(/^([A-Za-z]+)(?:\((.*)\))?$/s);
  if (!m) return { tool: rule, pattern: null };
  return { tool: m[1], pattern: m[2] ?? null };
}

/** Образец Bash-правила → регулярное выражение: * — любые символы; «команда *» подходит и команде без аргументов */
export function bashPatternToRegExp(pattern) {
  let body = pattern;
  let tail = "";
  if (body.endsWith(":*")) {
    body = body.slice(0, -2);
    tail = ".*";
  } else if (body.endsWith(" *")) {
    body = body.slice(0, -2);
    tail = "( .*)?";
  }
  return new RegExp(`^${body.split("*").map(esc).join(".*")}${tail}$`, "s");
}

/** Образец пути из правила Write/Edit/Read: «//путь» — от корня диска, ** — любая глубина, * — внутри одной папки */
export function pathPatternToRegExp(pattern) {
  const p = pattern.startsWith("//") ? pattern.slice(1) : pattern;
  const body = p
    .split("**")
    .map((part) => part.split("*").map(esc).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

/* ───── разбор команды ───── */

/** Разрезать команду по &&, ||, ; и | вне кавычек */
export function splitCommand(command) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < command.length) {
        cur += c + command[++i];
        continue;
      }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "\\" && i + 1 < command.length) {
      cur += c + command[++i];
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      parts.push(cur);
      cur = "";
      i++;
      continue;
    }
    // «2>&1» и «>&2» — не разделитель, а склейка потоков
    if (c === "&" && cur.endsWith(">")) {
      cur += c;
      continue;
    }
    if (c === ";" || c === "|") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Текст команды без содержимого кавычек: для поиска спецсимволов, которые видит оболочка */
function outsideQuotes(command, { keepDouble = false } = {}) {
  let out = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      else if (keepDouble && quote === '"') out += c;
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    out += c;
  }
  return out;
}

/** Слова части команды: кавычки сняты, но помечено, было ли слово в кавычках */
function words(part) {
  const out = [];
  let cur = "";
  let quoted = false;
  let started = false;
  let quote = null;
  const push = () => {
    if (started) out.push({ value: cur, quoted });
    cur = "";
    quoted = false;
    started = false;
  };
  for (let i = 0; i < part.length; i++) {
    const c = part[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(c)) {
      push();
      continue;
    }
    cur += c;
    started = true;
  }
  push();
  return out;
}

/** Убрать безопасные перенаправления (2>&1, 2>/dev/null, >/dev/null, </dev/null); вернуть остаток и цель записи в файл, если она есть */
function stripRedirects(part) {
  let fileTarget = null;
  const bare = outsideQuotes(part);
  const m = bare.match(/(?:\d?>>?|&>)\s*(?!&)(\S+)/g) ?? [];
  for (const r of m) {
    const target = r.replace(/^(?:\d?>>?|&>)\s*/, "");
    if (target !== "/dev/null") fileTarget = target;
  }
  const rest = part
    .replace(/\s*\d?>&\d/g, "")
    .replace(/\s*(?:\d?>>?|&>)\s*\/dev\/null/g, "")
    .replace(/\s*<\s*\/dev\/null/g, "")
    .trim();
  return { rest, fileTarget };
}

/** Команды, у которых Claude Code сверяет пути с рабочей папкой запуска */
const PATH_COMMANDS = new Set(["cd", "ls", "cat", "head", "tail", "grep", "find", "wc", "jq", "diff", "sort", "sed", "mkdir", "touch", "cp", "mv", "rm", "stat", "awk"]);

/** Заполнители из инструкций (<КЛЮЧ>, <роль>, <имя>) — не перенаправления: подставляем слово */
export function fillPlaceholders(command) {
  return command.replace(/<([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9 _-]*)>/g, (_, name) => (/ключ|key/i.test(name) ? "DEV-1" : "x"));
}

/**
 * Пройдёт ли команда у роли. Возвращает { ok, reason?, part? }: reason — почему отклонена, part — какая часть.
 * rules — { allow, deny } роли; role нужна для рабочей папки.
 */
export function checkCommand(command, rules, role) {
  // Обращение к инструменту, как его записывают в инструкциях: «Write /путь/файл»
  const tool = command.match(/^(Write|Edit|Read)\s+(\/\S+)/);
  if (tool) return checkTool(tool[1], fillPlaceholders(tool[2]), rules);

  const full = fillPlaceholders(command.replace(/\\\n\s*/g, " ")).trim();
  if (!full) return { ok: true };
  if (/\n/.test(full)) return { ok: false, reason: "несколько строк в одной команде", part: full };
  const bare = outsideQuotes(full);
  const bareWithDouble = outsideQuotes(full, { keepDouble: true });
  if (/\$\(|`/.test(bareWithDouble)) return { ok: false, reason: "подстановка команды $(…) или `…`", part: full };
  if (/\$[A-Za-z_{?]/.test(bareWithDouble)) return { ok: false, reason: "переменная оболочки ($ИМЯ)", part: full };
  if (/<</.test(bare)) return { ok: false, reason: "heredoc (<<)", part: full };
  if (/(^|[^&>])&\s*$/.test(bare)) return { ok: false, reason: "запуск в фоне (&)", part: full };

  const cwd = workDirFor(role);
  for (const raw of splitCommand(full)) {
    const { rest: part, fileTarget } = stripRedirects(raw);
    if (fileTarget) return { ok: false, reason: `запись в файл через перенаправление (${fileTarget})`, part: raw };
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(part)) return { ok: false, reason: "переменная окружения перед командой", part: raw };

    for (const rule of rules.deny) {
      const { tool: t, pattern } = parseRule(rule);
      if (t !== "Bash" || pattern == null) continue;
      if (bashPatternToRegExp(pattern).test(part) || bashPatternToRegExp(pattern).test(raw)) return { ok: false, reason: `запрещено правилом ${rule}`, part: raw };
    }
    const allowed = rules.allow.some((rule) => {
      const { tool: t, pattern } = parseRule(rule);
      if (t !== "Bash") return false;
      return pattern == null || bashPatternToRegExp(pattern).test(part);
    });
    if (!allowed) return { ok: false, reason: "нет разрешающего правила", part: raw };

    const w = words(part);
    if (w.length && PATH_COMMANDS.has(w[0].value)) {
      for (const arg of w.slice(1)) {
        const v = arg.value;
        if (v.startsWith("-")) continue;
        if (!arg.quoted && /[[\]()]/.test(v) && v.includes("/")) return { ok: false, reason: `скобки в пути без кавычек (${v})`, part: raw };
        if (v === "/dev/null") continue;
        if (v.startsWith("/") && !`${v}/`.startsWith(cwd)) return { ok: false, reason: `путь вне рабочей папки запуска (${v})`, part: raw };
        if (v === ".." || v.startsWith("../") || v.includes("/../")) return { ok: false, reason: `путь вне рабочей папки запуска (${v})`, part: raw };
      }
    }
  }
  return { ok: true };
}

/** Пройдёт ли обращение к инструменту с путём (Write, Edit, Read) */
export function checkTool(tool, filePath, rules) {
  for (const rule of rules.deny) {
    const { tool: t, pattern } = parseRule(rule);
    if (t !== tool) continue;
    if (pattern == null || pathPatternToRegExp(pattern).test(filePath)) return { ok: false, reason: `запрещено правилом ${rule}`, part: `${tool} ${filePath}` };
  }
  const allowed = rules.allow.some((rule) => {
    const { tool: t, pattern } = parseRule(rule);
    return t === tool && (pattern == null || pathPatternToRegExp(pattern).test(filePath));
  });
  return allowed ? { ok: true } : { ok: false, reason: `нет правила ${tool} для этого пути`, part: `${tool} ${filePath}` };
}

/* ───── команды из инструкции ───── */

/** Убрать комментарий в конце строки: « # …» вне кавычек */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

/** С чего начинается команда в тексте инструкции (а не название файла или поля в обратных кавычках) */
const COMMAND_START = /^(node|bash|sh|git|cd|docker|dig|host|nslookup|whois|curl|scripts\/|deploy\/|\/opt\/ihelp\.am\/scripts\/|npx|npm|python3|systemctl|sudo|mkdir|cat|ls|grep)(\s|$)/;

/**
 * Команды из markdown: строки блоков ```bash и команды в обратных кавычках посреди текста.
 * Возвращает [{ line, command, inline }]. Строка-комментарий «# Write /путь» — обращение к инструменту Write.
 */
export function extractCommands(markdown) {
  const out = [];
  const lines = markdown.split("\n");
  let fence = null;
  let pending = null;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const open = rawLine.match(/^\s*```\s*([A-Za-z]*)\s*$/);
    if (open) {
      if (pending) {
        out.push(pending);
        pending = null;
      }
      fence = fence == null ? open[1].toLowerCase() || "text" : null;
      continue;
    }
    if (fence != null) {
      if (!["bash", "sh", "shell"].includes(fence)) continue;
      const t = rawLine.trim();
      if (pending) {
        pending.command += ` ${stripComment(t).replace(/\\$/, "").trim()}`;
        if (!/\\$/.test(stripComment(t))) {
          out.push(pending);
          pending = null;
        }
        continue;
      }
      if (!t) continue;
      if (t.startsWith("#")) {
        const w = t.match(/\b(Write|Edit)\b[^/]*(\/opt\/\S+)/);
        if (w) out.push({ line: i + 1, command: `${w[1]} ${w[2]}`, inline: false });
        continue;
      }
      const cmd = stripComment(t);
      if (/\\$/.test(cmd)) pending = { line: i + 1, command: cmd.replace(/\\$/, "").trim(), inline: false };
      else out.push({ line: i + 1, command: cmd, inline: false });
      continue;
    }
    for (const m of rawLine.matchAll(/`([^`\n]+)`/g)) {
      const code = m[1].trim();
      if (COMMAND_START.test(code) && /\s/.test(code)) out.push({ line: i + 1, command: code, inline: true });
    }
  }
  if (pending) out.push(pending);
  return out;
}

/** Сверка одной инструкции: список команд, которые инструкция советует, а правила роли отклоняют */
export function checkDoc(markdown, rules, role) {
  const bad = [];
  const commands = extractCommands(markdown);
  for (const c of commands) {
    const r = checkCommand(c.command, rules, role);
    if (!r.ok) bad.push({ line: c.line, command: c.command, reason: r.reason ?? "", part: r.part ?? c.command });
  }
  return { total: commands.length, bad };
}
