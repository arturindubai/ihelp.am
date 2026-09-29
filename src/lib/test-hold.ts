/** Запуск тестировщика без вердикта — задачу ему снова не даём столько минут */
export const TEST_HOLD_MIN = 60;

/**
 * До какого момента задачу «На проверке» не давать тестировщику.
 * Пауза нужна, когда запуск тестировщика закончился, а вердикта нет: иначе он гоняет задачу по кругу.
 * Паузы нет, если вердикт был:
 *   — «протестировано»: отметка testedAt не раньше окончания запуска;
 *   — «возврат»: задача ушла разработчику и сдана заново — перешла в «На проверке» после окончания запуска.
 */
export function testHoldUntil(
  t: { lastRunEnded?: Date | null; testedAt?: Date | null; enteredReviewAt?: Date | null },
  holdMin = TEST_HOLD_MIN,
): Date | null {
  const ended = t.lastRunEnded;
  if (!ended) return null;
  if (t.testedAt && t.testedAt >= ended) return null;
  if (t.enteredReviewAt && t.enteredReviewAt > ended) return null;
  return new Date(ended.getTime() + holdMin * 60_000);
}
