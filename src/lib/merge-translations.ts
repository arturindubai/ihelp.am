/** Результат трёхстороннего слияния JSON-объектов переводов. */
export interface MergeResult {
  merged: Record<string, unknown>;
  /** Полные пути конфликтующих ключей (через точку), например «admin.banners.title». */
  conflicts: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep(
  ancestor: Record<string, unknown>,
  current: Record<string, unknown>,
  other: Record<string, unknown>,
  pathPrefix: string,
): { merged: Record<string, unknown>; conflicts: string[] } {
  const merged: Record<string, unknown> = { ...current };
  const conflicts: string[] = [];

  // Удаления: ключ был в предке и в current, но other его удалил
  for (const key of Object.keys(ancestor)) {
    if (
      !Object.prototype.hasOwnProperty.call(other, key) &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (JSON.stringify(current[key]) === JSON.stringify(ancestor[key])) {
        // current не менял — удаление из other победило
        delete merged[key];
      } else {
        // current изменил, other удалил — конфликт, оставляем значение current
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
      // Новый ключ (не было в предке)
      if (!hadCurrent) {
        // Только в other — добавляем
        merged[key] = otherVal;
      } else if (isPlainObject(currentVal) && isPlainObject(otherVal)) {
        // Оба добавили объект — рекурсивно сливаем с пустым предком
        const sub = mergeDeep({}, currentVal, otherVal, fullPath);
        merged[key] = sub.merged;
        conflicts.push(...sub.conflicts);
      } else if (JSON.stringify(currentVal) !== JSON.stringify(otherVal)) {
        // Оба добавили разные финальные значения — конфликт
        conflicts.push(fullPath);
        // merged[key] уже содержит currentVal (из spread)
      }
      // Иначе: оба добавили одинаковое — сохраняем current (уже в merged)
    } else if (!hadCurrent) {
      // current удалил ключ
      if (JSON.stringify(otherVal) !== JSON.stringify(ancestorVal)) {
        // other изменил — конфликт (удалён в current, изменён в other)
        conflicts.push(fullPath);
        // merged уже не содержит этот ключ; для отчёта о конфликте этого достаточно
      }
      // Иначе: other не менял — удаление current победило, ключа нет в merged
    } else if (isPlainObject(currentVal) && isPlainObject(otherVal)) {
      // Оба имеют объекты — рекурсивное трёхстороннее слияние
      const subAncestor = isPlainObject(ancestorVal) ? ancestorVal : {};
      const sub = mergeDeep(subAncestor, currentVal, otherVal, fullPath);
      merged[key] = sub.merged;
      conflicts.push(...sub.conflicts);
    } else {
      // Финальные значения: стандартное трёхстороннее слияние
      const ancestorStr = JSON.stringify(ancestorVal);
      const currentStr = JSON.stringify(currentVal);
      const otherStr = JSON.stringify(otherVal);
      if (currentStr === ancestorStr && otherStr !== ancestorStr) {
        // Только other изменил — берём из other
        merged[key] = otherVal;
      } else if (
        currentStr !== ancestorStr &&
        otherStr !== ancestorStr &&
        currentStr !== otherStr
      ) {
        // Оба изменили по-разному — конфликт, оставляем current
        conflicts.push(fullPath);
      }
      // Иначе: current изменил, other нет — сохраняем current (уже в merged)
      // Или: оба изменили одинаково — сохраняем current (уже в merged)
    }
  }

  return { merged, conflicts };
}

/**
 * Рекурсивное трёхстороннее слияние JSON-объектов переводов.
 * Используется git merge driver'ом из scripts/merge-translations.mjs.
 *
 * - Новый ключ только в other → добавляется.
 * - Новый ключ в обоих, оба объекты → рекурсивное слияние с пустым предком.
 * - Новый ключ в обоих, разные финальные значения → конфликт.
 * - Ключ был в предке, только other изменил → берём из other.
 * - Ключ был в предке, оба изменили по-разному → конфликт.
 * - Удалён в одной, не тронут в другой → удаляется.
 * - Удалён в одной, изменён в другой → конфликт.
 * - Массивы и строки — финальные значения, рекурсия не применяется.
 * - Конфликты: полный путь ключа (например «admin.banners.title»), значение current сохраняется.
 * - Порядок ключей: существующие сохраняются, новые добавляются в конец раздела.
 */
export function mergeTranslations(
  ancestor: Record<string, unknown>,
  current: Record<string, unknown>,
  other: Record<string, unknown>,
): MergeResult {
  return mergeDeep(ancestor, current, other, '');
}
