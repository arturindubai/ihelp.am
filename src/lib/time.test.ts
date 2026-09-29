import { describe, it, expect } from "vitest";
import { packageWarnWindow } from "./time";

describe("packageWarnWindow", () => {
  it("7 дней: диапазон охватывает целые сутки 2026-10-05 по Еревану", () => {
    // 2026-09-28T08:00:00Z = 12:00 по Еревану (UTC+4)
    const now = new Date("2026-09-28T08:00:00Z");
    const { from, to } = packageWarnWindow(now, 7);
    expect(from.toISOString()).toBe("2026-10-04T20:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-05T19:59:59.999Z");
  });

  it("2 дня: диапазон охватывает целые сутки 2026-09-30 по Еревану", () => {
    const now = new Date("2026-09-28T08:00:00Z");
    const { from, to } = packageWarnWindow(now, 2);
    expect(from.toISOString()).toBe("2026-09-29T20:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-30T19:59:59.999Z");
  });

  it("полночь по Еревану: смена даты учитывается корректно", () => {
    // 2026-09-28T20:00:00Z = 2026-09-29T00:00:00+04:00 (полночь по Еревану)
    const now = new Date("2026-09-28T20:00:00Z");
    const { from, to } = packageWarnWindow(now, 7);
    // Сегодня по Еревану: 2026-09-29, таргет через 7 дней: 2026-10-06
    expect(from.toISOString()).toBe("2026-10-05T20:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-06T19:59:59.999Z");
  });

  it("23:59 по Еревану: дата не уходит на следующие сутки", () => {
    // 2026-09-28T19:59:00Z = 2026-09-28T23:59:00+04:00
    const now = new Date("2026-09-28T19:59:00Z");
    const { from, to } = packageWarnWindow(now, 7);
    // Сегодня по Еревану: 2026-09-28, таргет через 7 дней: 2026-10-05
    expect(from.toISOString()).toBe("2026-10-04T20:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-05T19:59:59.999Z");
  });
});
