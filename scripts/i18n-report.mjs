#!/usr/bin/env node
/**
 * Отчёт о готовности переводов.
 *
 * Использование:
 *   node scripts/i18n-report.mjs              # сводка
 *   node scripts/i18n-report.mjs --missing en  # список пропущенных ключей EN
 *   node scripts/i18n-report.mjs --missing am  # список пропущенных ключей AM
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Рекурсивно разворачивает вложенный JSON в плоские ключи */
function flat(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flat(v, key, out);
  }
  return out;
}

const ru = flat(JSON.parse(readFileSync(join(ROOT, "messages/ru.json"), "utf-8")));
const en = flat(JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf-8")));
const am = flat(JSON.parse(readFileSync(join(ROOT, "messages/am.json"), "utf-8")));

const ruKeys = Object.keys(ru);
const missingEn = ruKeys.filter((k) => !en[k]);
const missingAm = ruKeys.filter((k) => !am[k]);

/** Считает html` в серверных .ts/.tsx файлах */
function countTelegramTemplates() {
  let count = 0;
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
        const content = readFileSync(full, "utf-8");
        const m = content.match(/html`/g);
        if (m) count += m.length;
      }
    }
  }
  walk(join(ROOT, "src/server"));
  return count;
}

/** Проверяет JSX-файлы на хардкодные кириллические строки */
function findHardcodedCyrillic() {
  const found = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) {
        const lines = readFileSync(full, "utf-8").split("\n");
        const rel = "src/" + full.slice(join(ROOT, "src").length + 1);
        lines.forEach((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
          if (/^(import|export)\s/.test(trimmed)) return;
          if (/(?:useTranslations|getTranslations)\s*\(/.test(line)) return;
          const stripped = line.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\{[^}]*\}/g, "");
          if (/>[^<]*[А-Яа-яёЁ][^<]*</.test(stripped)) {
            found.push({ file: rel, line: i + 1, text: trimmed.slice(0, 100) });
          }
        });
      }
    }
  }
  walk(join(ROOT, "src/app"));
  walk(join(ROOT, "src/components"));
  return found;
}

const args = process.argv.slice(2);
const missingFlag = args.indexOf("--missing");

if (missingFlag !== -1) {
  const lang = args[missingFlag + 1];
  if (lang !== "en" && lang !== "am") {
    console.error("Укажите язык: --missing en | --missing am");
    process.exit(1);
  }
  const missing = lang === "en" ? missingEn : missingAm;
  console.log(`\nПропущенные ключи (${lang.toUpperCase()}): ${missing.length}\n`);
  for (const key of missing) {
    console.log(`  ${key}`);
    console.log(`    ru: "${ru[key]}"`);
  }
} else {
  // Сводный отчёт
  const telegramCount = countTelegramTemplates();
  const hardcoded = findHardcodedCyrillic();

  console.log("\n═══ Отчёт готовности переводов ═══\n");

  const langs = [
    { code: "ru", label: "Русский (RU)", total: ruKeys.length, missing: 0 },
    { code: "en", label: "Английский (EN)", total: ruKeys.length, missing: missingEn.length },
    { code: "am", label: "Армянский (AM)", total: ruKeys.length, missing: missingAm.length },
  ];

  const colW = [20, 8, 12, 10, 14];
  const header = ["Язык", "Всего", "Переведено", "Пропущено", "Статус"];
  console.log(header.map((h, i) => h.padEnd(colW[i])).join(" "));
  console.log("─".repeat(colW.reduce((a, b) => a + b + 1, 0)));

  for (const { label, total, missing } of langs) {
    const translated = total - missing;
    const status = missing === 0 ? "✓ Готов" : translated === 0 ? "✗ Не переведён" : `~ Частично`;
    const row = [label, String(total), String(translated), String(missing), status];
    console.log(row.map((v, i) => v.padEnd(colW[i])).join(" "));
  }

  console.log("\n─── Тексты вне файлов переводов ───\n");
  console.log(`  Письма клиентам (mail-template.ts) — тексты идут через tr(), перевод подключён`);
  console.log(`  Сообщения команде в Telegram — ${telegramCount} шаблонов на русском (внутреннее использование)`);
  console.log(`  Контент каталога (услуги, мастера) — переводится в соответствующих разделах админки\n`);

  console.log("─── Хардкодные строки в JSX ───\n");
  if (hardcoded.length === 0) {
    console.log("  ✓ Зашитых кириллических строк в клиентских компонентах не найдено\n");
  } else {
    console.log(`  ✗ Найдено ${hardcoded.length} вхождений:\n`);
    for (const { file, line, text } of hardcoded) {
      console.log(`  ${file}:${line}`);
      console.log(`    ${text}`);
    }
    console.log();
  }

  console.log(`  Подробнее: node scripts/i18n-report.mjs --missing en`);
  console.log(`             node scripts/i18n-report.mjs --missing am\n`);
}
