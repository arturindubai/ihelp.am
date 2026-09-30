/**
 * Штраф за позднюю отмену (FLOW-4).
 * Фиксированная сумма из настроек, если отмена происходит позже freeCancelHours до визита.
 * Списание — только после PAY-1; здесь только запись в заказ.
 */

/**
 * Возвращает фиксированный штраф за отмену, если она поздняя.
 * @param scheduledAt — время визита; null → 0 (визит не запланирован, штрафа нет)
 * @param cancelledAt — время отмены
 * @param freeCancelHours — часов до визита, в пределах которых отмена бесплатна
 * @param lateCancelFeeAmd — фиксированная сумма штрафа (целые драмы)
 */
export function calcCancelPenalty(
  scheduledAt: Date | null,
  cancelledAt: Date,
  freeCancelHours: number,
  lateCancelFeeAmd: number,
): number {
  if (!scheduledAt) return 0;
  const msTilVisit = scheduledAt.getTime() - cancelledAt.getTime();
  return msTilVisit < freeCancelHours * 3_600_000 ? lateCancelFeeAmd : 0;
}

/** Валидация поля tipAmount: целое число ≥ 0 */
export function isValidTipAmount(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
