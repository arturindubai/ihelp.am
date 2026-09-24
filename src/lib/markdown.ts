/**
 * Небольшой разборщик Markdown для «Библиотеки» Control Center: документы проекта — заголовки, абзацы, списки,
 * таблицы, цитаты, блоки кода, ссылки. Результат — дерево данных, которое компонент рисует React-элементами:
 * HTML из текста не вставляется, поэтому разметка документа не может выполнить скрипт
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] };

export type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" }
  | { type: "quote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; items: { text: string; level: number }[] }
  | { type: "table"; head: string[]; rows: string[][] };

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang: fence[2] || "", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      blocks.push({ type: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", blocks: parseMarkdown(body.join("\n")) });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }
    const li = listItem.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: { text: string; level: number }[] = [];
      while (i < lines.length) {
        const m = listItem.exec(lines[i]);
        if (m) {
          const level = Math.min(4, Math.floor(m[1].replace(/\t/g, "  ").length / 2));
          // Маркированный и нумерованный списки подряд — два разных списка
          if (level === 0 && items.length && /\d/.test(m[2]) !== ordered) break;
          items.push({ text: m[3], level });
          i++;
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          // Продолжение пункта на следующей строке с отступом
          items[items.length - 1].text += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^\s*(```|~~~)|^\s*>/.test(lines[i]) && !listItem.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    else i++;
  }
  return blocks;
}

/** Строчная разметка: `код`, **жирный**, *курсив* и _курсив_, [ссылка](адрес). Ссылки — только http(s) и относительные */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ t: "code", v: code[1] });
      i += code[0].length;
      continue;
    }
    const bold = /^\*\*(.+?)\*\*/.exec(rest);
    if (bold) {
      flush();
      out.push({ t: "b", c: parseInline(bold[1]) });
      i += bold[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      // Любая схема, кроме http(s), — не ссылка: javascript:, data: и прочие остаются текстом
      const safe = !/^[a-z][a-z0-9+.-]*:/i.test(link[2]) || /^https?:\/\//i.test(link[2]);
      out.push(safe ? { t: "a", href: link[2], c: parseInline(link[1]) } : { t: "text", v: link[1] });
      i += link[0].length;
      continue;
    }
    const em = /^(\*|_)(?!\s)(.+?)(?<!\s)\1(?![\w*])/.exec(rest);
    if (em && (em[1] === "*" || i === 0 || /[\s(«"]/.test(src[i - 1]))) {
      flush();
      out.push({ t: "i", c: parseInline(em[2]) });
      i += em[0].length;
      continue;
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

/** Оглавление: заголовки второго и третьего уровня */
export function outline(blocks: Block[]) {
  return blocks.filter((b): b is Extract<Block, { type: "h" }> => b.type === "h" && (b.level === 2 || b.level === 3)).map((b) => ({ level: b.level, text: b.text.replace(/[*_`]/g, "") }));
}
