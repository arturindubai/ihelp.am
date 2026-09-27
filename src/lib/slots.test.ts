import { describe, it, expect } from "vitest";
import { computeSlots, computeAllSlots, isMasterFree } from "./slots";
import { atYerevan } from "./time";

const hours = { "1": [["10:00", "14:00"]] as [string, string][] };
// 2026-09-21 — понедельник
describe("slots", () => {
  it("generates slots within working hours", () => {
    const s = computeSlots({ date: "2026-09-21", durationMin: 120, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [{ id: "a", workingHours: hours, timeOff: [], busy: [] }] });
    expect(s.map((x) => x.time)).toEqual(["10:00", "11:00", "12:00"]);
  });
  it("respects busy + buffer", () => {
    const busy = [{ start: atYerevan("2026-09-21", "12:00"), end: atYerevan("2026-09-21", "13:00") }];
    const s = computeSlots({ date: "2026-09-21", durationMin: 60, bufferMin: 30, stepMin: 30, notBefore: new Date(0), masters: [{ id: "a", workingHours: hours, timeOff: [], busy }] });
    expect(s.map((x) => x.time)).toEqual(["10:00", "10:30"]);
  });
  it("merges masters", () => {
    const busy = [{ start: atYerevan("2026-09-21", "10:00"), end: atYerevan("2026-09-21", "14:00") }];
    const s = computeSlots({ date: "2026-09-21", durationMin: 60, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [{ id: "a", workingHours: hours, timeOff: [], busy }, { id: "b", workingHours: hours, timeOff: [], busy: [] }] });
    expect(s[0].masterIds).toEqual(["b"]);
  });
  it("computeAllSlots: occupied slot visible when master is busy", () => {
    // hours 10:00-14:00, step 60, duration 60 → 4 potential slots (10,11,12,13)
    const busy = [{ start: atYerevan("2026-09-21", "10:00"), end: atYerevan("2026-09-21", "14:00") }];
    const all = computeAllSlots({ date: "2026-09-21", durationMin: 60, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [{ id: "a", workingHours: hours, timeOff: [], busy }] });
    expect(all.map((x) => x.time)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
    expect(all.every((x) => !x.available)).toBe(true);
  });
  it("computeAllSlots: partial availability", () => {
    // busy 10:00-12:00 блокирует слоты 10 и 11; 12 и 13 — свободны
    const busy = [{ start: atYerevan("2026-09-21", "10:00"), end: atYerevan("2026-09-21", "12:00") }];
    const all = computeAllSlots({ date: "2026-09-21", durationMin: 60, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [{ id: "a", workingHours: hours, timeOff: [], busy }] });
    expect(all.map((x) => ({ time: x.time, available: x.available }))).toEqual([
      { time: "10:00", available: false },
      { time: "11:00", available: false },
      { time: "12:00", available: true },
      { time: "13:00", available: true },
    ]);
  });
  it("no slots on day off; isMasterFree", () => {
    const m = { id: "a", workingHours: hours, timeOff: [], busy: [] };
    expect(computeSlots({ date: "2026-09-22", durationMin: 60, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [m] })).toHaveLength(0);
    expect(isMasterFree(m, atYerevan("2026-09-21", "13:00"), 60, 0)).toBe(true);
    expect(isMasterFree(m, atYerevan("2026-09-21", "13:30"), 60, 0)).toBe(false);
  });
});
