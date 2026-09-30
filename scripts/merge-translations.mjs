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

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep(ancestor, current, other, pathPrefix) {
  const merged = { ...current };
  const conflicts = [];

  // Удаления: ключ был в предке и в current, но other его удалил
  for (const key of Object.keys(ancestor)) {
    if (
      !Object.prototype.hasOwnProperty.call(other, key) &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (JSON.stringify(current[key]) === JSON.stringify(ancestor[key])) {
        delete merged[key];
      } else {
        conflicts.push(fullPath);
      }
    }
  }

  for (const key of Object.keys(other)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const hadAncestor = Object.prototype.hasOwnProperty.call(ancestor, key);
    const hadCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const otherVal = other[key];
    const currentVal = current[key];
    const ancestorVal = ancestor[key];

    if (!hadAncestor) {
      if (!hadCurrent) {
        merged[key] = otherVal;
      } else if (isPlainObject(currentVal) && isPlainObject(otherVal)) {
        const sub = mergeDeep({}, currentVal, otherVal, fullPath);
        merged[key] = sub.merged;
        conflicts.push(...sub.conflicts);
      } else if (JSON.stringify(currentVal) !== JSON.stringify(otherVal)) {
        conflicts.push(fullPath);
      }
    } else if (!hadCurrent) {
      if (JSON.stringify(otherVal) !== JSON.stringify(ancestorVal)) {
        conflicts.push(fullPath);
      }
    } else if (isPlainObject(currentVal) && isPlainObject(otherVal)) {
      const subAncestor = isPlainObject(ancestorVal) ? ancestorVal : {};
      const sub = mergeDeep(subAncestor, currentVal, otherVal, fullPath);
      merged[key] = sub.merged;
      conflicts.push(...sub.conflicts);
    } else {
      const ancestorStr = JSON.stringify(ancestorVal);
      const currentStr = JSON.stringify(currentVal);
      const otherStr = JSON.stringify(otherVal);
      if (currentStr === ancestorStr && otherStr !== ancestorStr) {
        merged[key] = otherVal;
      } else if (
        currentStr !== ancestorStr &&
        otherStr !== ancestorStr &&
        currentStr !== otherStr
      ) {
        conflicts.push(fullPath);
      }
    }
  }

  return { merged, conflicts };
}

const ancestor = readJSON(ancestorPath);
const current = readJSON(currentPath);
const other = readJSON(otherPath);

const { merged, conflicts } = mergeDeep(ancestor, current, other, '');

// Всегда пишем результат: при конфликте — то, что слилось без спора,
// по спорным ключам сохраняется значение текущей ветки.
writeFileSync(currentPath, JSON.stringify(merged, null, 2) + '\n');

if (conflicts.length > 0) {
  process.stderr.write(`Конфликт в файле переводов: ${conflicts.join(', ')}\n`);
  process.exit(1);
}

process.exit(0);
