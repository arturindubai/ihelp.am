import { describe, it, expect } from "vitest";
import { calculatePrice, calculatePlanSavings, PriceLine } from "./pricing";

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

describe("calculatePlanSavings — настоящая выгода клиента", () => {
  // Пример из задачи COMP-38: база 16 000, пакет 4 визита без тарифного дисконта
  // Новый клиент: 4 разовых = 14 400 + 3×16 000 = 62 400; пакет = 12 000 + 3×16 000 = 60 000
  it("новый клиент, пакет ≥4: экономия = разово за N визитов − payNow пакета", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "PACKAGE" as const, discountPercent: 0, packageVisits: 4 };
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: true })).toBe(2400);
  });

  it("постоянный клиент, пакет ≥4 с тарифным дисконтом 3%: экономия от скидки тарифа, без скидки первого визита", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "PACKAGE" as const, discountPercent: 3, packageVisits: 4 };
    // regular = round(16000*0.97,50) = 15500; payNow = 15500*4 = 62000
    // oneTime.first = 16000 (нет скидки первого); oneTimeCost = 16000*4 = 64000
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: false })).toBe(2000);
  });

  it("гость = новый клиент: isFirstOrder по умолчанию undefined, скидки нет → как isFirstOrder=false", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "PACKAGE" as const, discountPercent: 3, packageVisits: 4 };
    // guest: isFirstOrder = undefined → treated as false by calculatePrice
    expect(calculatePlanSavings({ lines, plan })).toBe(2000);
  });

  it("выгода ≤ 0 → возвращает 0 (строку не показывают)", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "PACKAGE" as const, discountPercent: 0, packageVisits: 4 };
    // Постоянный клиент, нет тарифного дисконта: payNow = 16000*4, oneTimeCost = 16000*4 → 0
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: false })).toBe(0);
  });

  it("подписка для нового клиента: 10% разово хуже 5% подписки → экономии нет (0)", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "SUBSCRIPTION" as const, discountPercent: 5 };
    // oneTime.first = 14400 (10%); regular = 15200 (5%); saving = 14400-15200 = -800 → 0
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: true })).toBe(0);
  });

  it("подписка для постоянного клиента: разово 16000, подписка 15200 → экономия 800", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "SUBSCRIPTION" as const, discountPercent: 5 };
    // oneTime.first = 16000; regular = 15200; saving = 800
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: false })).toBe(800);
  });

  it("подписка для нового клиента с высоким дисконтом: 25% подписки > 10% разово → есть экономия", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "SUBSCRIPTION" as const, discountPercent: 15 };
    // oneTime.first = 14400 (10%); regular = round(16000*0.85,50) = 13600; saving = 14400-13600 = 800
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: true })).toBe(800);
  });

  it("пакет 1 визит: пакет без обязательства — скидка та же, что разово → выгоды нет", () => {
    const lines = [dur(2, 16000)];
    const plan = { kind: "PACKAGE" as const, discountPercent: 3, packageVisits: 1 };
    // Не обязательство: оба первых визита получают 10% → first.price = 14400 с обеих сторон
    // oneTimeCost = 14400; payNow = 14400; saving = 0
    expect(calculatePlanSavings({ lines, plan, isFirstOrder: true })).toBe(0);
  });
});

describe("banner — выбор процента плашки скидки", () => {
  it("разовый тариф: first.percent равен firstVisitDiscount (10)", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "ONE_TIME", discountPercent: 0 }, isFirstOrder: true });
    expect(r.first.percent).toBe(10);
  });

  it("подписка: first.percent равен firstVisitCommittedDiscount (25), а не разовому 10", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, isFirstOrder: true });
    expect(r.first.percent).toBe(25);
  });

  it("пакет ≥4 визитов — обязательство: first.percent = 25", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "PACKAGE", discountPercent: 0, packageVisits: 4 }, isFirstOrder: true });
    expect(r.first.percent).toBe(25);
  });

  it("пакет <4 визитов — без обязательства: first.percent = 10", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "PACKAGE", discountPercent: 0, packageVisits: 2 }, isFirstOrder: true });
    expect(r.first.percent).toBe(10);
  });

  it("не первый заказ: first.percent совпадает с planPct (нет скидки первого визита)", () => {
    const r = calculatePrice({ lines: [dur(2, 16000)], plan: { kind: "SUBSCRIPTION", discountPercent: 5 }, isFirstOrder: false });
    expect(r.first.percent).toBe(5);
  });
});
