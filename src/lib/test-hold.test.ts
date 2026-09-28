import { describe, expect, it } from "vitest";
import { TEST_HOLD_MIN, testHoldUntil } from "./test-hold";

const at = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00Z`);

describe("testHoldUntil — пауза после запуска тестировщика", () => {
  it("запусков не было — паузы нет", () => {
    expect(testHoldUntil({ lastRunEnded: null, testedAt: null, enteredReviewAt: at("11:00") })).toBeNull();
  });

  it("запуск закончился без вердикта, задача осталась на проверке — пауза 60 минут", () => {
    const until = testHoldUntil({ lastRunEnded: at("11:40"), testedAt: null, enteredReviewAt: at("11:00") });
    expect(until).toEqual(at("12:40"));
    expect(TEST_HOLD_MIN).toBe(60);
  });

  it("возврат и повторная сдача после окончания запуска — паузы нет (DEV-78: проверка до 15:40, сдана в 15:47)", () => {
    expect(testHoldUntil({ lastRunEnded: at("11:40"), testedAt: null, enteredReviewAt: at("11:47") })).toBeNull();
  });

  it("задача сдана до окончания запуска — пауза остаётся", () => {
    expect(testHoldUntil({ lastRunEnded: at("11:40"), testedAt: null, enteredReviewAt: at("11:39") })).toEqual(at("12:40"));
  });

  it("момент сдачи неизвестен — пауза остаётся, как раньше", () => {
    expect(testHoldUntil({ lastRunEnded: at("11:40"), testedAt: null })).toEqual(at("12:40"));
  });

  it("старая отметка «протестировано» раньше запуска — вердикта у запуска нет, пауза есть", () => {
    expect(testHoldUntil({ lastRunEnded: at("11:40"), testedAt: at("10:00"), enteredReviewAt: at("11:00") })).toEqual(at("12:40"));
  });

  it("отметка «протестировано» не раньше окончания запуска — паузы нет", () => {
    expect(testHoldUntil({ lastRunEnded: at("11:40"), testedAt: at("11:40"), enteredReviewAt: at("11:00") })).toBeNull();
  });
});
