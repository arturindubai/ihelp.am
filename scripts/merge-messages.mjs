#!/usr/bin/env node
/**
 * Git merge driver для messages/*.json
 * Вызывается git при конфликте: merge-messages.mjs %O %A %B
 *   %O = общий предок (base)
 *   %A = наша сторона (файл модифицируется на месте)
 *   %B = их сторона
 * Результат: объединяет ключи обеих сторон и сортирует по алфавиту.
 * Конфликт (код 1) — только если обе стороны изменили значение одного ключа на разные значения.
 * Настройка в git config:
 *   git config merge.json-messages.driver "node /opt/ihelp.am/scripts/merge-messages.mjs %O %A %B"
 * или через deploy-task.sh (автоматически).
 */
import fs from "node:fs";

const [, , base, ours, theirs] = process.argv;

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function sortRecursive(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortRecursive(obj[k])]));
}

// 3-стороннее слияние объектов: возвращает {merged, conflicts: bool}
function merge3(b, a, t) {
  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

  if (!isObj(a) && !isObj(t)) {
    const aChanged = JSON.stringify(a) !== JSON.stringify(b);
    const tChanged = JSON.stringify(t) !== JSON.stringify(b);
    if (!aChanged || !tChanged) return { merged: aChanged ? a : t, conflicts: false };
    if (JSON.stringify(a) === JSON.stringify(t)) return { merged: a, conflicts: false };
    return { merged: a, conflicts: true };
  }

  const bObj = isObj(b) ? b : {};
  const aObj = isObj(a) ? a : {};
  const tObj = isObj(t) ? t : {};
  const allKeys = new Set([...Object.keys(aObj), ...Object.keys(tObj), ...Object.keys(bObj)]);
  const result = {};
  let hasConflicts = false;

  for (const key of allKeys) {
    const bv = bObj[key];
    const av = aObj[key];
    const tv = tObj[key];
    const inA = key in aObj;
    const inT = key in tObj;
    const inB = key in bObj;

    // Удалён обеими сторонами — пропустить
    if (!inA && !inT) continue;

    // Только одна из сторон имеет ключ, а в базе его не было: добавлено
    if (!inB) {
      if (inA && !inT) { result[key] = av; continue; }
      if (!inA && inT) { result[key] = tv; continue; }
    }

    // Удалён одной стороной
    if (inB && !inA && inT && JSON.stringify(tv) === JSON.stringify(bv)) continue;
    if (inB && inA && !inT && JSON.stringify(av) === JSON.stringify(bv)) continue;

    // Рекурсия для вложенных объектов
    if (isObj(av) || isObj(tv)) {
      const sub = merge3(bv ?? {}, av ?? {}, tv ?? {});
      result[key] = sub.merged;
      if (sub.conflicts) hasConflicts = true;
      continue;
    }

    const r = merge3(bv, av, tv);
    result[key] = r.merged;
    if (r.conflicts) hasConflicts = true;
  }

  return { merged: result, conflicts: hasConflicts };
}

const bData = readJson(base);
const aData = readJson(ours);
const tData = readJson(theirs);

const { merged, conflicts } = merge3(bData, aData, tData);
const sorted = sortRecursive(merged);
fs.writeFileSync(ours, JSON.stringify(sorted, null, 2) + "\n");

process.exit(conflicts ? 1 : 0);
