import { describe, it, expect } from "vitest";
import { notifyBackoffMs, NOTIFY_MAX_ATTEMPTS } from "./notifyBackoff";

describe("notifyBackoffMs", () => {
  it("первая повторная попытка — 2 минуты", () => {
    expect(notifyBackoffMs(1)).toBe(2 * 60_000);
  });

  it("вторая — 8 минут", () => {
    expect(notifyBackoffMs(2)).toBe(8 * 60_000);
  });

  it("третья — 30 минут", () => {
    expect(notifyBackoffMs(3)).toBe(30 * 60_000);
  });

  it("четвёртая и далее — 2 часа", () => {
    expect(notifyBackoffMs(4)).toBe(120 * 60_000);
    expect(notifyBackoffMs(9)).toBe(120 * 60_000);
  });

  it("задержка всегда положительная", () => {
    for (let i = 0; i <= NOTIFY_MAX_ATTEMPTS; i++) {
      expect(notifyBackoffMs(i)).toBeGreaterThan(0);
    }
  });
});

describe("NOTIFY_MAX_ATTEMPTS", () => {
  it("не меньше 5 (достаточно для устранения сбоя)", () => {
    expect(NOTIFY_MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
  });
});
