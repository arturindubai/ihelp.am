import { describe, it, expect } from "vitest";
import { recurrenceDates } from "./recurrence";

describe("recurrence", () => {
  it("weekly single day", () => {
    expect(recurrenceDates({ start: "2026-09-21", time: "10:00", weekdays: [1], intervalDays: 7 }, "2026-09-21", "2026-10-12")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
  });
  it("biweekly", () => {
    expect(recurrenceDates({ start: "2026-09-23", time: "10:00", weekdays: [3], intervalDays: 14 }, "2026-09-23", "2026-10-31")).toEqual(["2026-09-23", "2026-10-07", "2026-10-21"]);
  });
  it("2 times a week, start mid-week", () => {
    expect(recurrenceDates({ start: "2026-09-24", time: "10:00", weekdays: [1, 4], intervalDays: 7 }, "2026-09-24", "2026-10-05")).toEqual(["2026-09-24", "2026-09-28", "2026-10-01", "2026-10-05"]);
  });
  it("monthly (every 4 weeks) continues from later from-date", () => {
    expect(recurrenceDates({ start: "2026-09-21", time: "10:00", weekdays: [1], intervalDays: 28 }, "2026-10-01", "2026-11-30")).toEqual(["2026-10-19", "2026-11-16"]);
  });
});
