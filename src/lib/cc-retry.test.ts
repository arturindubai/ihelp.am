import { describe, expect, it } from "vitest";
import { RETRY_TOTAL_MS, isRetryable, retryDelay, retrySchedule } from "./cc-retry.mjs";

describe("retrySchedule — паузы между повторами запроса cc.mjs", () => {
  it("в сумме ровно минута и не больше", () => {
    const s = retrySchedule();
    expect(s.reduce((a, b) => a + b, 0)).toBe(RETRY_TOTAL_MS);
    expect(RETRY_TOTAL_MS).toBe(60_000);
  });

  it("паузы растут от секунды и не превышают десяти секунд", () => {
    const s = retrySchedule();
    expect(s.slice(0, 6)).toEqual([1000, 2000, 3000, 5000, 8000, 10_000]);
    expect(Math.max(...s)).toBe(10_000);
    for (let i = 1; i < s.length - 1; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
  });

  it("перезапуск приложения на 20 секунд переживается: к этому времени сделано не меньше пяти повторов", () => {
    const s = retrySchedule();
    let t = 0;
    let n = 0;
    while (n < s.length && t + s[n] <= 20_000) t += s[n++];
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it("другой общий срок: последняя пауза укорачивается, нулевой срок — без повторов", () => {
    expect(retrySchedule(4000)).toEqual([1000, 2000, 1000]);
    expect(retrySchedule(0)).toEqual([]);
  });
});

describe("retryDelay — пауза перед очередным повтором", () => {
  it("учитывает, сколько уже прошло: запросы тоже занимают время", () => {
    expect(retryDelay(1, 0)).toBe(1000);
    expect(retryDelay(3, 15_000)).toBe(3000);
    expect(retryDelay(9, 55_000)).toBe(5000);
  });

  it("время вышло — повтора нет", () => {
    expect(retryDelay(4, 60_000)).toBeNull();
    expect(retryDelay(4, 75_000)).toBeNull();
    expect(retryDelay(0, 0)).toBeNull();
  });
});

describe("isRetryable — когда запрос повторяется", () => {
  it("502 и 503 — приложение перезапускается, запрос не выполнен: повторяем и чтение, и запись", () => {
    expect(isRetryable({ method: "POST", status: 502 })).toBe(true);
    expect(isRetryable({ method: "POST", status: 503 })).toBe(true);
    expect(isRetryable({ method: "GET", status: 502 })).toBe(true);
  });

  it("отказ соединения — повторяем и чтение, и запись", () => {
    expect(isRetryable({ method: "POST", errorCode: "ECONNREFUSED", errorName: "TypeError" })).toBe(true);
    expect(isRetryable({ method: "GET", errorCode: "ECONNREFUSED", errorName: "TypeError" })).toBe(true);
  });

  it("обычные ответы и ошибки приложения не повторяются", () => {
    for (const status of [200, 400, 403, 404, 409, 500, 504]) expect(isRetryable({ method: "POST", status }), String(status)).toBe(false);
  });

  it("оборванное соединение и таймаут: чтение повторяем, запись — нет, чтобы она не задвоилась", () => {
    expect(isRetryable({ method: "GET", errorCode: "ECONNRESET" })).toBe(true);
    expect(isRetryable({ method: "GET", errorName: "TimeoutError" })).toBe(true);
    expect(isRetryable({ method: "POST", errorCode: "ECONNRESET" })).toBe(false);
    expect(isRetryable({ method: "POST", errorName: "TimeoutError" })).toBe(false);
  });

  it("неизвестная ошибка не повторяется", () => {
    expect(isRetryable({ method: "GET", errorName: "TypeError" })).toBe(false);
    expect(isRetryable()).toBe(false);
  });
});
