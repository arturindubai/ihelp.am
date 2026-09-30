/** Результат трёхстороннего слияния JSON-объектов переводов. */
export interface MergeResult {
  merged: Record<string, unknown>;
  /** Ключи верхнего уровня, где обе ветки изменили значение по-разному. */
  conflicts: string[];
}

/**
 * Трёхстороннее плоское слияние JSON-объектов переводов (по ключам верхнего уровня).
 * Используется git merge driver'ом из scripts/merge-translations.mjs.
 *
 * - Новый ключ только в other → добавляется в merged.
 * - Новый ключ в обоих, но со РАЗНЫМИ значениями → конфликт.
 * - Ключ был в предке, только other изменил → берём из other.
 * - Ключ был в предке, оба изменили по-разному → конфликт.
 * - Всё остальное → сохраняем current.
 */
export function mergeTranslations(
  ancestor: Record<string, unknown>,
  current: Record<string, unknown>,
  other: Record<string, unknown>,
): MergeResult {
  const merged: Record<string, unknown> = { ...current };
  const conflicts: string[] = [];

  for (const key of Object.keys(other)) {
    const hadAncestor = Object.prototype.hasOwnProperty.call(ancestor, key);
    const hadCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const otherStr = JSON.stringify(other[key]);

    if (!hadAncestor && !hadCurrent) {
      // Новый ключ только в other — добавляем
      merged[key] = other[key];
    } else if (!hadAncestor && hadCurrent) {
      // Добавлен в обоих — конфликт при разных значениях
      if (JSON.stringify(current[key]) !== otherStr) {
        conflicts.push(key);
      }
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

  return { merged, conflicts };
}
