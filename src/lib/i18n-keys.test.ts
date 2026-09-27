import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// В Docker: cwd = /app, messages монтируются в /app/messages, src в /app/src
const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const RU_PATH = join(ROOT, "messages", "ru.json");

const ru: Record<string, unknown> = JSON.parse(readFileSync(RU_PATH, "utf-8"));

/** Проверяет, что путь вида "a.b.c" существует в ru.json (в том числе промежуточные узлы) */
function hasKey(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur !== undefined;
}

/** Рекурсивно собирает .ts/.tsx файлы, кроме тестов */
function walkSrc(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkSrc(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      result.push(full);
    }
  }
  return result;
}

interface Binding {
  line: number;
  varName: string;
  namespace: string;
}

interface Call {
  line: number;
  varName: string;
  key: string;
}

/**
 * Извлекает привязки вида:
 *   const t = useTranslations("ns")
 *   const t = await getTranslations("ns")
 *   const [t, tc] = await Promise.all([getTranslations("ns1"), getTranslations("ns2")])
 */
function extractBindings(content: string): Binding[] {
  const result: Binding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(
      /const\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*["']([^"']+)["']\s*\)/g,
    )) {
      result.push({ line: i + 1, varName: m[1], namespace: m[2] });
    }
  }

  // Promise.all: строка может занимать несколько строк (флаг s).
  // Массив может содержать не-переводные вызовы (getSettings(), getHome() и т.п.),
  // поэтому разбиваем по запятым верхнего уровня, чтобы позиции совпадали с переменными.
  for (const m of content.matchAll(
    /const\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[([^\]]*)\]\s*\)/gs,
  )) {
    const lineNum = content.slice(0, content.indexOf(m[0])).split("\n").length;
    const vars = m[1].split(",").map((s) => s.trim()).filter(Boolean);

    // Разбиваем список аргументов по запятым верхнего уровня
    const arrayStr = m[2];
    let depth = 0, itemStart = 0;
    const items: string[] = [];
    for (let i = 0; i < arrayStr.length; i++) {
      if ("([{".includes(arrayStr[i])) depth++;
      else if (")]}".includes(arrayStr[i])) depth--;
      else if (arrayStr[i] === "," && depth === 0) {
        items.push(arrayStr.slice(itemStart, i).trim());
        itemStart = i + 1;
      }
    }
    items.push(arrayStr.slice(itemStart).trim());

    items.forEach((item, idx) => {
      const nsMatch = item.match(/(?:use|get)Translations\(\s*["']([^"']+)["']\s*\)/);
      if (nsMatch && idx < vars.length) {
        result.push({ line: lineNum, varName: vars[idx], namespace: nsMatch[1] });
      }
    });
  }

  return result.sort((a, b) => a.line - b.line);
}

/**
 * Извлекает литеральные вызовы t("ключ") или t.has("ключ").
 * Пропускает шаблонные строки (с `), интерполяцию (${...}) и экранирование.
 */
function extractCalls(content: string): Call[] {
  const result: Call[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\b(\w+)(?:\.\w+)?\(\s*(["'])([^"'\\\n{}]+)\2/g)) {
      result.push({ line: i + 1, varName: m[1], key: m[3] });
    }
  }

  return result;
}

describe("i18n ключи", () => {
  it("все t(\"…\") с известным неймспейсом имеют ключ в messages/ru.json", () => {
    const files = walkSrc(SRC_DIR);
    const missing: Array<{ file: string; line: number; key: string }> = [];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      const bindings = extractBindings(content);
      if (bindings.length === 0) continue;

      const calls = extractCalls(content);
      const relPath = "src/" + filePath.slice(SRC_DIR.length + 1);

      for (const call of calls) {
        // Находим самую свежую привязку для этой переменной перед строкой вызова
        const relevant = bindings.filter((b) => b.varName === call.varName && b.line <= call.line);
        if (relevant.length === 0) continue;

        const binding = relevant[relevant.length - 1];
        const fullKey = `${binding.namespace}.${call.key}`;

        if (!hasKey(ru, fullKey)) {
          missing.push({ file: relPath, line: call.line, key: fullKey });
        }
      }
    }

    if (missing.length > 0) {
      const details = missing.map((m) => `  ${m.file}:${m.line} — "${m.key}"`).join("\n");
      expect.fail(`Ключи i18n отсутствуют в messages/ru.json:\n${details}`);
    }
  });
});
