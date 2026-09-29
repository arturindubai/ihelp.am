#!/usr/bin/env node
// Git merge driver для JSON-файлов переводов (messages/*.json).
// Вызывается git-ом: node scripts/merge-translations.mjs %O %A %B
// %O — общий предок, %A — текущая ветка (результат пишется сюда), %B — вливаемая ветка.
// Выход 0 — слито без конфликтов, 1 — конфликт (git отметит файл как конфликтный).
// Логика совпадает с src/lib/merge-translations.ts (тесты там).
import { readFileSync, writeFileSync } from 'fs';

const [,, ancestorPath, currentPath, otherPath] = process.argv;
if (!ancestorPath || !currentPath || !otherPath) {
  process.stderr.write('Использование: merge-translations.mjs %O %A %B\n');
  process.exit(2);
}

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

const ancestor = readJSON(ancestorPath);
const current = readJSON(currentPath);
const other = readJSON(otherPath);

const merged = Object.assign({}, current);
const conflicts = [];

for (const key of Object.keys(other)) {
  const hadAncestor = Object.prototype.hasOwnProperty.call(ancestor, key);
  const hadCurrent = Object.prototype.hasOwnProperty.call(current, key);
  const otherStr = JSON.stringify(other[key]);

  if (!hadAncestor && !hadCurrent) {
    // Новый ключ только в other — добавляем
    merged[key] = other[key];
  } else if (!hadAncestor && hadCurrent) {
    // Добавлен в обоих — конфликт при разных значениях
    if (JSON.stringify(current[key]) !== otherStr) conflicts.push(key);
  } else {
    // Ключ был в предке — трёхстороннее слияние
    const ancestorStr = JSON.stringify(ancestor[key]);
    const currentStr = hadCurrent ? JSON.stringify(current[key]) : undefined;
    if (currentStr === ancestorStr && otherStr !== ancestorStr) {
      // Только other изменил — берём из other
      merged[key] = other[key];
    } else if (
      currentStr !== undefined &&
      currentStr !== ancestorStr &&
      otherStr !== ancestorStr &&
      currentStr !== otherStr
    ) {
      // Оба изменили по-разному — конфликт
      conflicts.push(key);
    }
  }
}

if (conflicts.length > 0) {
  process.stderr.write(`Конфликт в файле переводов: ключи ${conflicts.join(', ')}\n`);
  process.exit(1);
}

writeFileSync(currentPath, JSON.stringify(merged, null, 2) + '\n');
process.exit(0);
