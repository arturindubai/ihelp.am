// Логика 3-стороннего слияния JSON-файлов переводов.
// Используется merge driver (scripts/merge-messages.mjs) и покрывается тестами.

export function sortRecursive(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  const o = obj as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortRecursive(o[k])]));
}

export function isSorted(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return true;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  for (let i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) return false;
  return Object.values(o).every(isSorted);
}

/** 3-стороннее слияние двух JSON-объектов относительно общего предка.
 * Возвращает {merged, conflicts}: конфликт — только если обе стороны изменили
 * одно значение на разные. */
export function merge3(
  b: unknown,
  a: unknown,
  t: unknown,
): { merged: unknown; conflicts: boolean } {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

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
  const result: Record<string, unknown> = {};
  let hasConflicts = false;

  for (const key of allKeys) {
    const bv = bObj[key];
    const av = aObj[key];
    const tv = tObj[key];
    const inA = key in aObj;
    const inT = key in tObj;
    const inB = key in bObj;

    if (!inA && !inT) continue;
    if (!inB) {
      if (inA && !inT) { result[key] = av; continue; }
      if (!inA && inT) { result[key] = tv; continue; }
    }
    if (inB && !inA && inT && JSON.stringify(tv) === JSON.stringify(bv)) continue;
    if (inB && inA && !inT && JSON.stringify(av) === JSON.stringify(bv)) continue;

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
