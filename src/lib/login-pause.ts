/**
 * Пауза воркеров «не вошли в Claude»: когда её ставить.
 * Чистая функция: диспетчер (scripts/dispatcher.mjs) повторяет то же условие — тест сверяет оба места.
 *
 * Слова про вход ищутся только в отчёте запуска, который завершился ошибкой или по времени.
 * Успешный запуск может упоминать OAuth, /login и 401 по делу (задачи про вход через Google) —
 * это не признак потерянного входа в подписку.
 */

/** Статусы запуска, при которых отчёт может говорить о потерянном входе */
export const LOGIN_PAUSE_STATUSES = ["failed", "timeout"] as const;

/** Признаки потерянного входа в тексте отчёта */
export const LOGIN_PAUSE_PATTERN = /not logged in|\/login|oauth|failed to authenticate|authentication_error|\b401\b/i;

export function needsLoginPause(status: string, summary: string): boolean {
  return (LOGIN_PAUSE_STATUSES as readonly string[]).includes(status) && LOGIN_PAUSE_PATTERN.test(summary);
}
