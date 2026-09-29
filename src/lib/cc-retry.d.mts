/** Типы для cc-retry.mjs (сам модуль — чистый JavaScript: его запускает Node на сервере без сборки) */

export const RETRY_TOTAL_MS: number;
export function retryDelay(attempt: number, elapsedMs: number, totalMs?: number): number | null;
export function retrySchedule(totalMs?: number): number[];
export function isRetryable(input?: { method?: string; status?: number | null; errorCode?: string | null; errorName?: string | null }): boolean;
