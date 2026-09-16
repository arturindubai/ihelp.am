import { describe, it, expect } from "vitest";
import { calculatePrice, PriceLine } from "./pricing";

const dur = (h: number, price: number): PriceLine => ({ groupTitle: "d", optionTitle: `${h}h`, price, discountable: true, durationMin: h * 60 });
const mat: PriceLine = { groupTitle: "m", optionTitle: "materials", price: 1000, discountable: false, durationMin: 0 };

describe("pricing — tariff grid from unit economics", () => {
  it("1h one-time, no discounts", () => {
    const r = calculatePrice({ lines: [dur(1, 9000)] });
    expect(r.payNow).toBe(9000);
  });
  it("2 visits/month −3% → 8750 (rounded to 50)", () => {
    expect(calculatePrice({ lines: [dur(1, 9000)], plan: { kind: "SUBSCRIPTION", discountPercent: 3 } }).regular.price).toBe(8750);
  });
  it("weekly −5% → 8550; 2+/week −7% → 8350", () => {
    expect(calculatePrice({ lines: [dur(1, 9000)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 } }).regular.price).toBe(8550);
    expect(calculatePrice({ lines: [dur(1, 9000)], plan: { kind: "SUBSCRIPTION", discountPercent: 7 } }).regular.price).toBe(8350);
  });
  it("first visit −25% only with commitment (subscription): 1.5h 12500 → 9400", () => {
    const r = calculatePrice({ lines: [dur(1.5, 12500)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, isFirstOrder: true });
    expect(r.first.price).toBe(9400);
    expect(r.regular.price).toBe(11900);
  });
  it("first one-time order without commitment gets 10%", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], isFirstOrder: true });
    expect(r.first.price).toBe(14400);
  });
  it("discounts do not apply to materials", () => {
    const r = calculatePrice({ lines: [dur(2, 16000), mat], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, isFirstOrder: true });
    expect(r.first.price).toBe(12000 + 1000);
    expect(r.regular.price).toBe(15200 + 1000);
  });
  it("package of 4: first visit −25%, rest with plan discount", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "PACKAGE", discountPercent: 3, packageVisits: 4 }, isFirstOrder: true });
    expect(r.payNow).toBe(12000 + 15500 * 3);
  });
  it("package of 2 is not a commitment → first 10%", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "PACKAGE", discountPercent: 0, packageVisits: 2 }, isFirstOrder: true });
    expect(r.first.price).toBe(14400);
  });
  it("non-stackable promo: best discount wins", () => {
    const small = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, promo: { code: "X", type: "PERCENT", value: 3 } });
    expect(small.promoApplied).toBe(false);
    expect(small.first.price).toBe(15200);
    const big = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, promo: { code: "Y", type: "PERCENT", value: 20 } });
    expect(big.promoApplied).toBe(true);
    expect(big.first.price).toBe(12800);
    expect(big.regular.price).toBe(15200);
  });
  it("stackable fixed promo on top", () => {
    const r = calculatePrice({ lines: [dur(2, 16000), mat], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, promo: { code: "Z", type: "FIXED", value: 2000, stackable: true } });
    expect(r.first.price).toBe(15200 - 2000 + 1000);
  });
  it("promo max discount cap", () => {
    const r = calculatePrice({ lines: [dur(4, 30000)], promo: { code: "C", type: "PERCENT", value: 50, maxDiscount: 5000 } });
    expect(r.first.price).toBe(25000);
  });
});
