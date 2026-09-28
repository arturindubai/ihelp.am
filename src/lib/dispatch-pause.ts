/** Возможные итоги запуска воркера */
export type RunOutcome = "done" | "failed" | "timeout" | "limit" | "stopped" | "permission_blocked";

/**
 * Вычисляет итог запуска по результату claude -p.
 * Функция без побочных эффектов — удобна для тестирования.
 */
export function calcOutcome(
  result: { result?: unknown; subtype?: string; is_error?: boolean } | null,
  killed: boolean,
  err = "",
): RunOutcome {
  const text = `${result?.result ?? ""} ${result?.subtype ?? ""} ${err}`;
  if (/usage limit|limit reached|rate.?limit|out of (extra )?usage|5-hour limit|weekly limit/i.test(text))
    return "limit";
  if (!result) return killed ? "timeout" : "failed";
  if (result.subtype === "error_max_turns") return "failed";
  // Запись в карточку отклонена правилами прав
  if (
    /(cc\.mjs|scripts\/cc).*(note|block|review|done|triaged|unblock|msg)/i.test(text) &&
    /(denied|not permitted|not allowed|отклонен|запрещен|заблокирован|недоступн|tool.*blocked|permission)/i.test(text)
  )
    return "permission_blocked";
  return result.is_error ? "failed" : "done";
}

/**
 * Нужна ли пауза воркеров по ошибке входа в Claude.
 * Пауза ставится только при проваленном запуске — не при успешном,
 * даже если в его отчёте встречаются слова «oauth», «/login», «401».
 */
export function needsLoginPause(status: RunOutcome, summary: string): boolean {
  if (!["failed", "timeout"].includes(status)) return false;
  return /not logged in|\/login|oauth|failed to authenticate|authentication_error|\b401\b/i.test(summary);
}
