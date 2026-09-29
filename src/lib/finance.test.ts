import { describe, it, expect } from "vitest";
import {
  calcPeriodStats,
  calcDailyRevenue,
  calcCashByMaster,
  calcMasterRanking,
  noConversionData,
  type FinanceVisit,
} from "./finance";

function v(
  overrides: Partial<FinanceVisit> & { date: string; price: number },
): FinanceVisit {
  return {
    orderId: "ord-1",
    kind: "ONE_TIME",
    masterId: "m-1",
    masterName: "Анна",
    paymentMethod: "CASH",
    orderCancelled: false,
    ...overrides,
  };
}

// ─── calcPeriodStats ─────────────────────────────────────────────────────────

describe("calcPeriodStats", () => {
  it("пустой период — нули и null дельта", () => {
    const s = calcPeriodStats([], null);
    expect(s.revenue).toBe(0);
    expect(s.ordersCount).toBe(0);
    expect(s.avgCheck).toBe(0);
    expect(s.revenueDelta).toBeNull();
    expect(s.byChannel.oneTime).toBe(0);
    expect(s.byChannel.subscription).toBe(0);
    expect(s.byChannel.package).toBe(0);
  });

  it("отменённый заказ не входит в выручку", () => {
    const visits: FinanceVisit[] = [
      v({ date: "2026-09-15", price: 10000, orderCancelled: true }),
      v({ date: "2026-09-15", price: 5000, orderId: "ord-2", orderCancelled: false }),
    ];
    const s = calcPeriodStats(visits, null);
    expect(s.revenue).toBe(5000);
    expect(s.ordersCount).toBe(1);
  });

  it("правильно считает выручку и число уникальных заказов", () => {
    const visits: FinanceVisit[] = [
      v({ date: "2026-09-01", price: 9000, orderId: "ord-1" }),
      v({ date: "2026-09-05", price: 9000, orderId: "ord-1" }),   // тот же заказ
      v({ date: "2026-09-10", price: 12000, orderId: "ord-2" }),
    ];
    const s = calcPeriodStats(visits, null);
    expect(s.revenue).toBe(30000);
    expect(s.ordersCount).toBe(2);
    expect(s.avgCheck).toBe(15000);
  });

  it("разбивка по каналам суммируется в общую выручку", () => {
    const visits: FinanceVisit[] = [
      v({ date: "2026-09-01", price: 9000, kind: "ONE_TIME", orderId: "ord-1" }),
      v({ date: "2026-09-02", price: 8000, kind: "SUBSCRIPTION", orderId: "ord-2" }),
      v({ date: "2026-09-03", price: 7000, kind: "PACKAGE", orderId: "ord-3" }),
    ];
    const s = calcPeriodStats(visits, null);
    expect(s.byChannel.oneTime).toBe(9000);
    expect(s.byChannel.subscription).toBe(8000);
    expect(s.byChannel.package).toBe(7000);
    expect(s.byChannel.oneTime + s.byChannel.subscription + s.byChannel.package).toBe(s.revenue);
  });

  it("дельта считается верно при наличии прошлой выручки", () => {
    const visits = [v({ date: "2026-09-01", price: 12000 })];
    const s = calcPeriodStats(visits, 10000);
    expect(s.revenueDelta).toBe(20); // +20%
  });

  it("дельта null при нулевой прошлой выручке", () => {
    const visits = [v({ date: "2026-09-01", price: 5000 })];
    const s = calcPeriodStats(visits, 0);
    expect(s.revenueDelta).toBeNull();
  });

  it("дельта null если prevRevenue не передан", () => {
    const visits = [v({ date: "2026-09-01", price: 5000 })];
    const s = calcPeriodStats(visits, null);
    expect(s.revenueDelta).toBeNull();
  });

  it("дельта отрицательная при падении выручки", () => {
    const visits = [v({ date: "2026-09-01", price: 8000 })];
    const s = calcPeriodStats(visits, 10000);
    expect(s.revenueDelta).toBe(-20);
  });
});

// ─── calcDailyRevenue ────────────────────────────────────────────────────────

describe("calcDailyRevenue", () => {
  it("пустой период — нули за каждый день", () => {
    const rows = calcDailyRevenue([], "2026-09-01", "2026-09-03");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: "2026-09-01", oneTime: 0, subscription: 0, package: 0, total: 0 });
  });

  it("дни без визитов присутствуют с нулями", () => {
    const visits = [v({ date: "2026-09-03", price: 9000, kind: "ONE_TIME" })];
    const rows = calcDailyRevenue(visits, "2026-09-01", "2026-09-03");
    expect(rows).toHaveLength(3);
    expect(rows[0].total).toBe(0);
    expect(rows[2].total).toBe(9000);
  });

  it("визит в 23:59 (date=2026-09-15) попадает в 15-е, не в 16-е", () => {
    const visits = [v({ date: "2026-09-15", price: 5000 })];
    const rows = calcDailyRevenue(visits, "2026-09-15", "2026-09-16");
    expect(rows[0].total).toBe(5000);
    expect(rows[1].total).toBe(0);
  });

  it("визит в 00:01 (date=2026-09-16) попадает в 16-е, не в 15-е", () => {
    const visits = [v({ date: "2026-09-16", price: 7000 })];
    const rows = calcDailyRevenue(visits, "2026-09-15", "2026-09-16");
    expect(rows[0].total).toBe(0);
    expect(rows[1].total).toBe(7000);
  });

  it("отменённый заказ не в графике", () => {
    const visits = [
      v({ date: "2026-09-01", price: 10000, orderCancelled: true }),
      v({ date: "2026-09-01", price: 5000, orderId: "ord-2", orderCancelled: false }),
    ];
    const rows = calcDailyRevenue(visits, "2026-09-01", "2026-09-01");
    expect(rows[0].total).toBe(5000);
  });

  it("разбивка по каналам верна", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, kind: "ONE_TIME", orderId: "ord-1" }),
      v({ date: "2026-09-01", price: 8000, kind: "SUBSCRIPTION", orderId: "ord-2" }),
      v({ date: "2026-09-01", price: 7000, kind: "PACKAGE", orderId: "ord-3" }),
    ];
    const rows = calcDailyRevenue(visits, "2026-09-01", "2026-09-01");
    expect(rows[0].oneTime).toBe(9000);
    expect(rows[0].subscription).toBe(8000);
    expect(rows[0].package).toBe(7000);
    expect(rows[0].total).toBe(24000);
  });
});

// ─── calcCashByMaster ────────────────────────────────────────────────────────

describe("calcCashByMaster", () => {
  it("нет визитов — пустой итог", () => {
    const s = calcCashByMaster([]);
    expect(s.totalAmount).toBe(0);
    expect(s.totalVisits).toBe(0);
    expect(s.masters).toHaveLength(0);
  });

  it("карточные оплаты не считаются", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, paymentMethod: "CARD" }),
      v({ date: "2026-09-01", price: 5000, orderId: "ord-2", paymentMethod: "CASH" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalAmount).toBe(5000);
    expect(s.totalVisits).toBe(1);
  });

  it("отменённые заказы не считаются", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, orderCancelled: true }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalAmount).toBe(0);
  });

  it("итог по мастерам верен", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, masterId: "m-1", masterName: "Анна", paymentMethod: "CASH", orderId: "ord-1" }),
      v({ date: "2026-09-02", price: 8000, masterId: "m-1", masterName: "Анна", paymentMethod: "CASH", orderId: "ord-2" }),
      v({ date: "2026-09-03", price: 7000, masterId: "m-2", masterName: "Мария", paymentMethod: "CASH", orderId: "ord-3" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalAmount).toBe(24000);
    expect(s.totalVisits).toBe(3);
    expect(s.masters).toHaveLength(2);
    expect(s.masters[0]).toMatchObject({ masterId: "m-1", visitsCount: 2, amount: 17000 });
    expect(s.masters[1]).toMatchObject({ masterId: "m-2", visitsCount: 1, amount: 7000 });
  });

  it("мастера отсортированы по убыванию суммы", () => {
    const visits = [
      v({ date: "2026-09-01", price: 3000, masterId: "m-a", masterName: "А", orderId: "ord-a" }),
      v({ date: "2026-09-01", price: 9000, masterId: "m-b", masterName: "Б", orderId: "ord-b" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.masters[0].masterId).toBe("m-b");
  });
});

// ─── calcMasterRanking ───────────────────────────────────────────────────────

describe("calcMasterRanking", () => {
  it("нет визитов — пустой рейтинг", () => {
    expect(calcMasterRanking([])).toHaveLength(0);
  });

  it("визит без мастера не попадает в рейтинг", () => {
    const visits = [v({ date: "2026-09-01", price: 9000, masterId: null })];
    expect(calcMasterRanking(visits)).toHaveLength(0);
  });

  it("отменённые заказы не в рейтинге", () => {
    const visits = [v({ date: "2026-09-01", price: 9000, orderCancelled: true })];
    expect(calcMasterRanking(visits)).toHaveLength(0);
  });

  it("рейтинг сортируется по выручке", () => {
    const visits = [
      v({ date: "2026-09-01", price: 5000, masterId: "m-a", masterName: "А", orderId: "ord-a" }),
      v({ date: "2026-09-01", price: 15000, masterId: "m-b", masterName: "Б", orderId: "ord-b" }),
    ];
    const rows = calcMasterRanking(visits);
    expect(rows[0].masterId).toBe("m-b");
    expect(rows[1].masterId).toBe("m-a");
  });

  it("ограничение списка по limit", () => {
    const visits = Array.from({ length: 15 }, (_, i) =>
      v({ date: "2026-09-01", price: 1000, masterId: `m-${i}`, masterName: `М-${i}`, orderId: `ord-${i}` }),
    );
    expect(calcMasterRanking(visits, 5)).toHaveLength(5);
    expect(calcMasterRanking(visits)).toHaveLength(10);
  });

  it("средний чек — выручка / уникальных заказов", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, masterId: "m-1", orderId: "ord-1" }),
      v({ date: "2026-09-05", price: 9000, masterId: "m-1", orderId: "ord-1" }), // тот же заказ
      v({ date: "2026-09-10", price: 12000, masterId: "m-1", orderId: "ord-2" }),
    ];
    const rows = calcMasterRanking(visits);
    expect(rows[0]).toMatchObject({ masterId: "m-1", revenue: 30000, ordersCount: 2, avgCheck: 15000 });
  });
});

// ─── noConversionData ────────────────────────────────────────────────────────

describe("noConversionData", () => {
  it("возвращает value=null (данных о посещениях нет)", () => {
    expect(noConversionData().value).toBeNull();
  });
});
