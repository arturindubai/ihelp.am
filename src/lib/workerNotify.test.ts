import { describe, it, expect } from "vitest";
import { masterCanReceive, tomorrowYmd, fillTemplate } from "./workerNotify";

describe("masterCanReceive", () => {
  it("мастер с chat ID получает уведомление", () => {
    expect(masterCanReceive("123456789")).toBe(true);
  });

  it("мастер с null chat ID не получает уведомление", () => {
    expect(masterCanReceive(null)).toBe(false);
  });

  it("мастер с undefined chat ID не получает уведомление", () => {
    expect(masterCanReceive(undefined)).toBe(false);
  });

  it("пустая строка считается отсутствием привязки", () => {
    expect(masterCanReceive("")).toBe(false);
  });
});

describe("tomorrowYmd", () => {
  it("возвращает следующий день в поясе Asia/Yerevan (+04:00)", () => {
    // 2026-09-28 19:00 UTC = 2026-09-28 23:00 Erevan → «завтра» = 2026-09-29
    const now = new Date("2026-09-28T19:00:00Z");
    expect(tomorrowYmd(now)).toBe("2026-09-29");
  });

  it("правильно считает «завтра» в полночь по Еревану", () => {
    // 2026-09-28 20:00:00 Erevan = 2026-09-28T16:00:00Z → завтра = 2026-09-29
    const now = new Date("2026-09-28T16:00:00Z");
    expect(tomorrowYmd(now)).toBe("2026-09-29");
  });

  it("правильно обрабатывает конец месяца (01:00 UTC, то есть 05:00 Erevan)", () => {
    // 2026-09-30 05:00 Erevan = 2026-09-30T01:00Z → завтра = 2026-10-01
    const now = new Date("2026-09-30T01:00:00Z");
    expect(tomorrowYmd(now)).toBe("2026-10-01");
  });

  it("в 23:59 UTC+4 = 19:59 UTC «завтра» — следующий день", () => {
    // 2026-09-28 23:59 Erevan = 2026-09-28T19:59:00Z
    const now = new Date("2026-09-28T19:59:00Z");
    expect(tomorrowYmd(now)).toBe("2026-09-29");
  });
});

describe("fillTemplate", () => {
  it("подставляет параметры в шаблон", () => {
    expect(fillTemplate("Клиент: {clientName}", { clientName: "Иван" })).toBe("Клиент: Иван");
  });

  it("подставляет несколько параметров", () => {
    expect(fillTemplate("{date}, {time}", { date: "2026-09-29", time: "10:00" })).toBe("2026-09-29, 10:00");
  });

  it("оставляет незаменённые плейсхолдеры нетронутыми", () => {
    expect(fillTemplate("{date}", {})).toBe("{date}");
  });
});
