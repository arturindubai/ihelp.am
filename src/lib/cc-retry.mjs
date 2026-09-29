/**
 * Повтор запросов scripts/cc.mjs, пока приложение перезапускается при выкладке (DEV-79).
 * Перезапуск занимает 10–20 секунд: в это время Control Center отвечает 502/503 или не принимает соединение,
 * и запись воркера (note, attach, pass) без повтора терялась.
 *
 * Файл на чистом JavaScript (.mjs): его импортирует scripts/cc.mjs, который запускается Node 20 без сборки.
 * Типы — в cc-retry.d.mts.
 */

/** Сколько всего ждём приложение, мс */
export const RETRY_TOTAL_MS = 60_000;

/** Паузы перед повторами по порядку, мс; дальше — по последней */
const STEPS = [1000, 2000, 3000, 5000, 8000, 10_000];

/**
 * Пауза перед повтором номер attempt (с единицы) или null, если время вышло.
 * elapsedMs — сколько прошло с первого запроса: пауза не выводит общее ожидание за totalMs.
 */
export function retryDelay(attempt, elapsedMs, totalMs = RETRY_TOTAL_MS) {
  if (!Number.isFinite(attempt) || attempt < 1) return null;
  const left = totalMs - Math.max(0, elapsedMs);
  if (left <= 0) return null;
  const want = STEPS[Math.min(attempt, STEPS.length) - 1];
  return Math.min(want, left);
}

/** Расписание пауз целиком — если бы сами запросы не занимали времени. Сумма равна totalMs */
export function retrySchedule(totalMs = RETRY_TOTAL_MS) {
  const out = [];
  let elapsed = 0;
  for (let attempt = 1; ; attempt++) {
    const d = retryDelay(attempt, elapsed, totalMs);
    if (d == null) return out;
    out.push(d);
    elapsed += d;
  }
}

/** Соединение не установлено: запрос до приложения точно не дошёл */
const NOT_CONNECTED = new Set(["ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);
/** Соединение оборвалось: запрос мог дойти, ответ потерян */
const DROPPED = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ETIMEDOUT"]);

/**
 * Повторять ли запрос. status — код ответа (если ответ был), errorCode и errorName — из ошибки fetch.
 * Пишущий запрос (не GET) повторяем, только когда он точно не был выполнен: 502/503 от прокси или отказ соединения.
 * Оборванное соединение и таймаут для записи не повторяем — иначе запись могла бы задвоиться.
 */
export function isRetryable({ method = "GET", status, errorCode, errorName } = {}) {
  if (status === 502 || status === 503) return true;
  if (status != null) return false;
  if (errorCode && NOT_CONNECTED.has(errorCode)) return true;
  if (String(method).toUpperCase() !== "GET") return false;
  if (errorCode && DROPPED.has(errorCode)) return true;
  return errorName === "TimeoutError" || errorName === "AbortError";
}
