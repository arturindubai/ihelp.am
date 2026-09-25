import "server-only";
import { html, notifyTech } from "./notify";
import { db } from "./db";

const lastSent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
const MAX_PER_HOUR = 20;

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Извлекает читаемый источник из ключа алерта */
function extractSource(key: string): string {
  if (key.startsWith("request:")) {
    const parts = key.split(":");
    return parts[1] ?? key;
  }
  return key;
}

/** Записывает алерт в журнал AppError: upsert по ключу, счётчик повторений */
async function recordAppError(key: string, source: string, message: string): Promise<void> {
  const msg = message.slice(0, 500);
  const src = source.slice(0, 200);
  await db.appError.upsert({
    where: { key },
    update: { count: { increment: 1 }, lastSeenAt: new Date(), message: msg, source: src },
    create: { key, source: src, message: msg },
  });
}

/**
 * Тех-алерт с защитой от спама: одинаковый ключ — не чаще раза в `everyMin` минут, всего — не больше 20 в час.
 * Счётчики в памяти процесса: после перезапуска приложения алерт может прийти повторно.
 * Каждый вызов записывается в журнал AppError (независимо от спам-фильтра).
 */
export async function alertTech(key: string, text: string, everyMin = 60, source?: string) {
  // Записываем в журнал до спам-фильтра — считаем все повторения
  recordAppError(key, source ?? extractSource(key), stripHtml(text)).catch(() => null);

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
    context.routePath,
  );
}
