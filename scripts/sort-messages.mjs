#!/usr/bin/env node
/**
 * Стабильный порядок ключей в messages/*.json: сортирует рекурсивно по алфавиту.
 * Параллельные правки разных ключей перестают конфликтовать, когда строки всегда в одном порядке.
 * Запускать из корня рабочей копии перед коммитом, если правили messages/*.json:
 *   node scripts/sort-messages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "messages");

function sortRecursive(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortRecursive(obj[k])]));
}

function isSorted(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return true;
  const keys = Object.keys(obj);
  for (let i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) return false;
  return Object.values(obj).every(isSorted);
}

const changed = [];
for (const name of fs.readdirSync(dir).sort()) {
  if (!name.endsWith(".json")) continue;
  const file = path.join(dir, name);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (isSorted(data)) { console.log(`  ${name}: уже отсортирован`); continue; }
  const sorted = sortRecursive(data);
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
  changed.push(name);
  console.log(`  ${name}: отсортирован`);
}
if (changed.length) console.log(`\nИзменено: ${changed.join(", ")} — добавьте в коммит (git add messages/)`);
else console.log("\nВсе файлы уже отсортированы");
