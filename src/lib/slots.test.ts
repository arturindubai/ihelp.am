import { describe, it, expect } from "vitest";
import { computeSlots, isMasterFree } from "./slots";
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
  it("no slots on day off; isMasterFree", () => {
    const m = { id: "a", workingHours: hours, timeOff: [], busy: [] };
    expect(computeSlots({ date: "2026-09-22", durationMin: 60, bufferMin: 0, stepMin: 60, notBefore: new Date(0), masters: [m] })).toHaveLength(0);
    expect(isMasterFree(m, atYerevan("2026-09-21", "13:00"), 60, 0)).toBe(true);
    expect(isMasterFree(m, atYerevan("2026-09-21", "13:30"), 60, 0)).toBe(false);
  });
});
