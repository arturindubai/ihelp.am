const STEP = 50; // шаг округления, как в pricing.ts DEFAULT_RULES.roundTo

function roundToStep(v: number): number {
  return Math.round(v / STEP) * STEP;
}

/**
 * Применить массовое изменение к одной цене.
 * Возвращает null в двух случаях:
 *   - price === 0: нулевые варианты пропускаются, не изменяются
 *   - результат был бы ≤ 0: такое изменение должно быть заблокировано через validateBulkChange
 * Результат процентного изменения округляется до шага 50 ֏.
 */
export function applyBulkChange(
  price: number,
  type: "percent" | "flat",
  value: number
): number | null {
  if (price === 0) return null;
  const raw =
    type === "percent"
      ? roundToStep(price * (1 + value / 100))
      : price + Math.round(value);
  if (raw <= 0) return null;
  return Math.min(raw, 10_000_000);
}

/**
 * Проверить, что массовое изменение не обнулит ни одну ненулевую цену.
 * Нулевые цены пропускаются — они никогда не изменяются.
 * Возвращает true, если операция безопасна.
 */
export function validateBulkChange(
  prices: number[],
  type: "percent" | "flat",
  value: number
): boolean {
  return prices.every((p) => {
    if (p === 0) return true;
    const raw =
      type === "percent"
        ? roundToStep(p * (1 + value / 100))
        : p + Math.round(value);
    return raw > 0;
  });
}
