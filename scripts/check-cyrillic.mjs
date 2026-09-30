#!/usr/bin/env node
/**
 * SEO-8: проверяет, что на страницах английской версии нет кириллицы.
 * Использование:
 *   node scripts/check-cyrillic.mjs [base_url]
 * Пример:
 *   node scripts/check-cyrillic.mjs http://localhost:3000
 *   node scripts/check-cyrillic.mjs https://ihelp.am
 */

const base = process.argv[2] ?? "http://localhost:3000";

const PAGES = [
  "/en",
  "/en/services",
  "/en/s/regular-cleaning",
];

const CYRILLIC = /[Ѐ-ӿ]/;

// Теги, которые не содержат отображаемый текст
const SKIP_TAGS = new Set(["script", "style", "noscript", "head", "meta", "link", "title"]);

function extractText(html) {
  // Убираем скрипты, стили и атрибуты, оставляем текстовые ноды
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, "");
  const noTags = noStyle.replace(/<[^>]+>/g, " ");
  // Декодируем HTML-сущности (только основные)
  return noTags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function checkPage(url) {
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status} — ${url}`);
    return { url, ok: false, cyrillic: [] };
  }
  const html = await res.text();

  // Проверка robots meta
  const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  const robotsContent = robotsMatch ? robotsMatch[1] : null;
  if (robotsContent && robotsContent.includes("noindex")) {
    console.error(`  ✗ NOINDEX: meta robots="${robotsContent}" — ${url}`);
    return { url, ok: false, cyrillic: [] };
  }

  // Проверка hreflang
  const hreflangEn = /<link[^>]+hreflang=["']en["'][^>]*>/i.test(html);
  const hreflangRu = /<link[^>]+hreflang=["']ru["'][^>]*>/i.test(html);
  if (!hreflangEn || !hreflangRu) {
    console.warn(`  ⚠ hreflang: en=${hreflangEn} ru=${hreflangRu} — ${url}`);
  }

  const text = extractText(html);
  const lines = text.split("\n");
  const found = [];
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (CYRILLIC.test(trimmed)) {
      found.push({ line: i + 1, text: trimmed.slice(0, 120) });
    }
  }
  return { url, ok: found.length === 0, cyrillic: found };
}

async function main() {
  console.log(`Проверка кириллицы на английских страницах: ${base}\n`);
  let hasErrors = false;
  for (const path of PAGES) {
    const url = `${base}${path}`;
    process.stdout.write(`Проверяю ${url} ... `);
    const result = await checkPage(url);
    if (!result.ok) {
      hasErrors = true;
      if (result.cyrillic.length > 0) {
        console.log(`НАЙДЕНА КИРИЛЛИЦА (${result.cyrillic.length} совпадений)`);
        for (const m of result.cyrillic.slice(0, 5)) {
          console.log(`  стр.${m.line}: ${m.text}`);
        }
        if (result.cyrillic.length > 5) console.log(`  ... ещё ${result.cyrillic.length - 5}`);
      }
    } else {
      console.log("ОК");
    }
  }
  if (hasErrors) {
    console.error("\n✗ Проверка не пройдена: кириллица на /en страницах или noindex");
    process.exit(1);
  } else {
    console.log("\n✓ Кириллицы не найдено, pages открыты для индексации");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
