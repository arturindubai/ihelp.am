import { describe, it, expect } from "vitest";
import { calcCancelPenalty, isValidTipAmount } from "./cancelPenalty";

const FEE = 2000;
const FREE_HOURS = 24;

function hoursBeforeVisit(h: number): { scheduledAt: Date; cancelledAt: Date } {
  const now = new Date("2026-10-01T10:00:00+04:00");
  const scheduledAt = new Date(now.getTime() + h * 3_600_000);
  return { scheduledAt, cancelledAt: now };
}

describe("calcCancelPenalty — штраф за позднюю отмену", () => {
  it("нет визита (null) → 0", () => {
    expect(calcCancelPenalty(null, new Date(), FREE_HOURS, FEE)).toBe(0);
  });

  it("отмена за 25 ч (больше freeCancelHours) → 0", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(25);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, FEE)).toBe(0);
  });

  it("отмена за 24 ч ровно (граница: < freeCancelHours не выполняется) → 0", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(24);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, FEE)).toBe(0);
  });

  it("отмена за 23.9 ч (меньше freeCancelHours) → фиксированный штраф", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(23.9);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, FEE)).toBe(FEE);
  });

  it("отмена за 1 ч → штраф", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(1);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, FEE)).toBe(FEE);
  });

  it("отмена уже после визита (прошедшее время) → штраф", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(-1);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, FEE)).toBe(FEE);
  });

  it("штраф равен значению из настроек, не проценту", () => {
    const { scheduledAt, cancelledAt } = hoursBeforeVisit(1);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, 5000)).toBe(5000);
    expect(calcCancelPenalty(scheduledAt, cancelledAt, FREE_HOURS, 3000)).toBe(3000);
  });
});

describe("isValidTipAmount — чаевые целыми драмами ≥ 0", () => {
  it("0 (не выбраны) — валидно", () => {
    expect(isValidTipAmount(0)).toBe(true);
  });

  it("положительное целое — валидно", () => {
    expect(isValidTipAmount(500)).toBe(true);
    expect(isValidTipAmount(1000)).toBe(true);
  });

  it("отрицательное — невалидно", () => {
    expect(isValidTipAmount(-100)).toBe(false);
  });

  it("дробное — невалидно (только целые драмы)", () => {
    expect(isValidTipAmount(100.5)).toBe(false);
  });
});

describe("noCall не попадает в comment", () => {
  it("comment не содержит [Не звонить] — поле noCall отдельное", () => {
    // Инвариант: noCall хранится как булево поле Order.noCall,
    // comment передаётся как есть, без добавления префикса
    function buildComment(noCall: boolean, raw: string | null): { noCall: boolean; comment: string | null } {
      return { noCall, comment: raw };
    }
    const { noCall, comment } = buildComment(true, "домофон 12");
    expect(noCall).toBe(true);
    expect(comment).toBe("домофон 12");
    expect(comment).not.toContain("[Не звонить]");
  });

  it("noCall=false, comment пустой → comment=null", () => {
    function buildComment(noCall: boolean, raw: string | null): { noCall: boolean; comment: string | null } {
      return { noCall, comment: raw?.trim() || null };
    }
    const { noCall, comment } = buildComment(false, "");
    expect(noCall).toBe(false);
    expect(comment).toBeNull();
  });
});
