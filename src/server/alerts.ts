import "server-only";
import { html, notifyTech } from "./notify";

const lastSent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
const MAX_PER_HOUR = 20;

/**
 * Тех-алерт с защитой от спама: одинаковый ключ — не чаще раза в `everyMin` минут, всего — не больше 20 в час.
 * Счётчики в памяти процесса: после перезапуска приложения алерт может прийти повторно.
 */
export async function alertTech(key: string, text: string, everyMin = 60) {
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - everyMin * 60_000) return;
  if (now - windowStart > 3600_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (++windowCount > MAX_PER_HOUR) return;
  lastSent.set(key, now);
  await notifyTech(text);
}

// Не ошибки приложения: устаревшая страница после деплоя, чужие/битые запросы к server actions
const NOISE = /Failed to find Server Action|Invalid Server Actions request|NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/;

/** Ошибки обработки запросов (вызывается из src/instrumentation.ts) */
export async function reportRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  const e = err instanceof Error ? err : new Error(String(err));
  if (NOISE.test(e.message) || NOISE.test(String((e as { digest?: string }).digest ?? ""))) return;
  const digest = (e as { digest?: string }).digest;
  await alertTech(
    `request:${context.routePath}:${e.message.slice(0, 80)}`,
    html`🔥 <b>Ошибка на сайте</b>\n${request.method} ${request.path}\n${context.routeType} · ${context.routePath}${digest ? ` · digest ${digest}` : ""}\n<code>${e.message.slice(0, 500)}</code>\nЛоги: docker compose logs app`,
    10,
  );
}
