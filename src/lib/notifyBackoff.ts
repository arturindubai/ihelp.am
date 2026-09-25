/** Максимальное число попыток доставки уведомления */
export const NOTIFY_MAX_ATTEMPTS = 10;

/**
 * Задержка в миллисекундах перед следующей попыткой доставки.
 * Экспоненциальный рост: 2 мин → 8 мин → 30 мин → 2 часа
 */
export function notifyBackoffMs(attempts: number): number {
  if (attempts <= 1) return 2 * 60_000;
  if (attempts <= 2) return 8 * 60_000;
  if (attempts <= 3) return 30 * 60_000;
  return 120 * 60_000;
}
