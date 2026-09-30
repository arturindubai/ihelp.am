import { describe, test, expect } from "vitest";
import { applyBulkChange, validateBulkChange } from "./price-bulk";

describe("applyBulkChange", () => {
  test("нулевая цена — пропускается (null) для обоих режимов", () => {
    expect(applyBulkChange(0, "percent", 10)).toBeNull();
    expect(applyBulkChange(0, "flat", 500)).toBeNull();
    expect(applyBulkChange(0, "percent", -50)).toBeNull();
  });

  test("процент: результат округляется до шага 50", () => {
    // 16000 * 1.07 = 17120 → round(17120 / 50) * 50 = 17100
    expect(applyBulkChange(16000, "percent", 7)).toBe(17100);
    // 10000 * 1.10 = 11000 — уже кратно 50
    expect(applyBulkChange(10000, "percent", 10)).toBe(11000);
    // 1000 * 1.03 = 1030 → round(1030/50)*50 = 1050
    expect(applyBulkChange(1000, "percent", 3)).toBe(1050);
  });

  test("процент: -100% даёт null (обнуление)", () => {
    expect(applyBulkChange(1000, "percent", -100)).toBeNull();
  });

  test("плоское: добавляет значение без округления до шага", () => {
    expect(applyBulkChange(10000, "flat", 500)).toBe(10500);
    expect(applyBulkChange(10000, "flat", -500)).toBe(9500);
    expect(applyBulkChange(1000, "flat", 123)).toBe(1123);
  });

  test("плоское: отрицательный результат даёт null", () => {
    expect(applyBulkChange(1000, "flat", -2000)).toBeNull();
    expect(applyBulkChange(1000, "flat", -1000)).toBeNull();
  });

  test("результат ограничен 10 000 000", () => {
    expect(applyBulkChange(9_000_000, "flat", 2_000_000)).toBe(10_000_000);
    expect(applyBulkChange(9_000_000, "percent", 50)).toBe(10_000_000);
  });

  test("небольшое процентное изменение нулевой цены — null", () => {
    expect(applyBulkChange(0, "flat", 500)).toBeNull();
  });
});

describe("validateBulkChange", () => {
  test("безопасно — все ненулевые цены остаются > 0", () => {
    expect(validateBulkChange([1000, 2000, 3000], "percent", 10)).toBe(true);
    expect(validateBulkChange([1000, 2000], "flat", -500)).toBe(true);
  });

  test("небезопасно — одна цена обнулится при -100%", () => {
    expect(validateBulkChange([1000, 2000], "percent", -100)).toBe(false);
  });

  test("небезопасно — одна цена уйдёт в минус при flat", () => {
    expect(validateBulkChange([500, 1000], "flat", -1000)).toBe(false);
  });

  test("нулевые цены не считаются ошибкой — они пропускаются", () => {
    // 0 пропускается, 1000+500=1500 > 0
    expect(validateBulkChange([0, 1000], "flat", 500)).toBe(true);
    // 0 пропускается, 1000 * (1-100%) = 0 ≤ 0 — небезопасно
    expect(validateBulkChange([0, 1000], "percent", -100)).toBe(false);
  });

  test("пустой список — безопасно", () => {
    expect(validateBulkChange([], "percent", -100)).toBe(true);
  });

  test("все нулевые — безопасно (пропускаются)", () => {
    expect(validateBulkChange([0, 0, 0], "flat", -5000)).toBe(true);
  });
});
