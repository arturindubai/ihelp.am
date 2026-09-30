/**
 * Считает html` вхождения в src/server и пишет в messages/i18n-meta.json.
 * Запускать при добавлении новых Telegram-шаблонов в серверный код.
 *
 * Использование: node scripts/gen-i18n-meta.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const serverDir = join(ROOT, "src", "server");

let count = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const content = readFileSync(full, "utf-8");
      const matches = content.match(/html`/g);
      if (matches) count += matches.length;
    }
  }
}

walk(serverDir);

const meta = { telegramCount: count };
writeFileSync(join(ROOT, "messages", "i18n-meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`telegramCount: ${count} → messages/i18n-meta.json`);
