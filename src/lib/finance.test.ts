import { describe, it, expect } from "vitest";
import {
  calcPeriodStats,
  calcDailyRevenue,
  calcCashByMaster,
  calcMasterRanking,
  noConversionData,
  mapDbRow,
  calcPeriodBounds,
  extractMasterName,
  type FinanceVisit,
  type DbFinanceRow,
} from "./finance";

/** Готовый FinanceVisit для тестов чистых функций расчёта */
function v(
  overrides: Partial<FinanceVisit> & { date: string; price: number },
): FinanceVisit {
  return {
    orderId: "ord-1",
    kind: "ONE_TIME",
    masterId: "m-1",
    masterName: "Анна",
    paymentMethod: "CASH",
    cashCollected: false,
    ...overrides,
  };
}

/** Минимальная сырая строка БД для тестов mapDbRow */
function dbRow(overrides: Partial<DbFinanceRow> & { finishedAt: Date; price: number }): DbFinanceRow {
  return {
    kind: "ONE_TIME",
    orderStatus: "ACTIVE",
    orderId: "ord-1",
    masterId: "m-1",
    masterName: { ru: "Анна" },
    paymentMethod: "CARD",
    cashCollected: false,
    ...overrides,
  };
}

// ─── mapDbRow ────────────────────────────────────────────────────────────────

describe("mapDbRow", () => {
  it("визит в 19:59:59Z (23:59 по Еревану) → date=2026-09-15", () => {
    const fv = mapDbRow(dbRow({ finishedAt: new Date("2026-09-15T19:59:59Z"), price: 5000 }));
    expect(fv.date).toBe("2026-09-15");
  });

  it("визит в 20:00:00Z (00:00 по Еревану) → date=2026-09-16", () => {
    const fv = mapDbRow(dbRow({ finishedAt: new Date("2026-09-15T20:00:00Z"), price: 7000 }));
    expect(fv.date).toBe("2026-09-16");
  });

  it("визит отменённого заказа (orderStatus=CANCELLED) — попадает в FinanceVisit без фильтрации", () => {
    const fv = mapDbRow(dbRow({
      finishedAt: new Date("2026-09-15T10:00:00Z"),
      price: 9000,
      orderStatus: "CANCELLED",
    }));
    expect(fv.price).toBe(9000);
    expect(fv.orderId).toBe("ord-1");
  });

  it("мастер не назначен → masterId=null, masterName=null", () => {
    const fv = mapDbRow(dbRow({
      finishedAt: new Date("2026-09-15T10:00:00Z"),
      price: 9000,
      masterId: null,
      masterName: null,
    }));
    expect(fv.masterId).toBeNull();
    expect(fv.masterName).toBeNull();
  });

  it("визит со скидкой первого заказа — цена берётся из базы как есть", () => {
    const fv = mapDbRow(dbRow({ finishedAt: new Date("2026-09-15T10:00:00Z"), price: 6750 }));
    expect(fv.price).toBe(6750);
  });

  it("cashCollected=true копируется в FinanceVisit", () => {
    const fv = mapDbRow(dbRow({
      finishedAt: new Date("2026-09-15T10:00:00Z"),
      price: 8000,
      paymentMethod: "CASH",
      cashCollected: true,
    }));
    expect(fv.cashCollected).toBe(true);
  });
});

// ─── extractMasterName ───────────────────────────────────────────────────────

describe("extractMasterName", () => {
  it("приоритет: ru → en → am", () => {
    expect(extractMasterName({ ru: "Анна", en: "Anna", am: "Անի" })).toBe("Анна");
    expect(extractMasterName({ en: "Anna", am: "Անի" })).toBe("Anna");
    expect(extractMasterName({ am: "Անի" })).toBe("Անի");
  });

  it("строка возвращается как есть", () => {
    expect(extractMasterName("Анна")).toBe("Анна");
  });

  it("null и пустой объект → пустая строка", () => {
    expect(extractMasterName(null)).toBe("");
    expect(extractMasterName({})).toBe("");
    expect(extractMasterName(undefined)).toBe("");
  });
});

// ─── calcPeriodBounds ────────────────────────────────────────────────────────

describe("calcPeriodBounds", () => {
  it("однодневный период — prevTo = день до, prevFrom = тот же день", () => {
    const b = calcPeriodBounds("2026-09-15", "2026-09-15");
    expect(b.days).toBe(1);
    expect(b.prevTo).toBe("2026-09-14");
    expect(b.prevFrom).toBe("2026-09-14");
  });

  it("семидневный период — предыдущие 7 дней", () => {
    const b = calcPeriodBounds("2026-09-08", "2026-09-14");
    expect(b.days).toBe(7);
    expect(b.prevTo).toBe("2026-09-07");
    expect(b.prevFrom).toBe("2026-09-01");
  });

  it("fromDt — ровно 00:00 по Еревану = 20:00 UTC предыдущего дня", () => {
    const b = calcPeriodBounds("2026-09-15", "2026-09-15");
    // 2026-09-15T00:00+04:00 = 2026-09-14T20:00:00.000Z
    expect(b.fromDt.toISOString()).toBe("2026-09-14T20:00:00.000Z");
    // 2026-09-16T00:00+04:00 = 2026-09-15T20:00:00.000Z
    expect(b.toDt.toISOString()).toBe("2026-09-15T20:00:00.000Z");
  });

  it("визит ровно в fromDt (00:00 по Еревану) попадает в период", () => {
    const b = calcPeriodBounds("2026-09-15", "2026-09-15");
    const visitAt = new Date("2026-09-14T20:00:00.000Z"); // ровно fromDt
    expect(visitAt >= b.fromDt && visitAt < b.toDt).toBe(true);
  });

  it("визит в 19:59:59Z (23:59 по Еревану 15-го) попадает в период 15-го", () => {
    const b = calcPeriodBounds("2026-09-15", "2026-09-15");
    const visitAt = new Date("2026-09-15T19:59:59Z");
    expect(visitAt >= b.fromDt && visitAt < b.toDt).toBe(true);
  });

  it("визит в 20:00:00Z (00:00 по Еревану 16-го) не попадает в период 15-го", () => {
    const b = calcPeriodBounds("2026-09-15", "2026-09-15");
    const visitAt = new Date("2026-09-15T20:00:00Z");
    expect(visitAt >= b.fromDt && visitAt < b.toDt).toBe(false);
  });
});

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

  it("выполненный визит входит в выручку, даже если заказ отменён", () => {
    const visits: FinanceVisit[] = [
      v({ date: "2026-09-15", price: 10000, orderId: "ord-1" }),
      v({ date: "2026-09-15", price: 5000, orderId: "ord-2" }),
    ];
    const s = calcPeriodStats(visits, null);
    expect(s.revenue).toBe(15000);
    expect(s.ordersCount).toBe(2);
  });

  it("заказ отменён после двух выполненных визитов — оба в выручке", () => {
    const visits: FinanceVisit[] = [
      v({ date: "2026-09-10", price: 8000, orderId: "ord-cancel" }),
      v({ date: "2026-09-17", price: 8000, orderId: "ord-cancel" }),
      v({ date: "2026-09-20", price: 5000, orderId: "ord-active" }),
    ];
    const s = calcPeriodStats(visits, null);
    expect(s.revenue).toBe(21000);
    expect(s.ordersCount).toBe(2);
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

  it("выполненные визиты в графике, включая визиты отменённых заказов", () => {
    const visits = [
      v({ date: "2026-09-01", price: 10000, orderId: "ord-1" }),
      v({ date: "2026-09-01", price: 5000, orderId: "ord-2" }),
    ];
    const rows = calcDailyRevenue(visits, "2026-09-01", "2026-09-01");
    expect(rows[0].total).toBe(15000);
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
    expect(s.totalToCollect).toBe(0);
    expect(s.totalReceived).toBe(0);
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

  it("визит без мастера (masterId=null) не попадает в наличные", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, masterId: null, paymentMethod: "CASH" }),
      v({ date: "2026-09-01", price: 5000, masterId: "m-1", paymentMethod: "CASH", orderId: "ord-2" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalAmount).toBe(5000);
    expect(s.masters).toHaveLength(1);
  });

  it("toCollect (cashCollected=false) и received (cashCollected=true) разделены", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, masterId: "m-1", paymentMethod: "CASH", cashCollected: false, orderId: "ord-1" }),
      v({ date: "2026-09-02", price: 6000, masterId: "m-1", paymentMethod: "CASH", cashCollected: true, orderId: "ord-2" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalToCollect).toBe(9000);
    expect(s.totalReceived).toBe(6000);
    expect(s.totalAmount).toBe(15000);
    expect(s.masters[0]).toMatchObject({ toCollect: 9000, received: 6000, total: 15000, ordersCount: 2 });
  });

  it("ordersCount считает уникальные заказы мастера", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, masterId: "m-1", paymentMethod: "CASH", orderId: "sub-1" }),
      v({ date: "2026-09-08", price: 9000, masterId: "m-1", paymentMethod: "CASH", orderId: "sub-1" }), // тот же заказ
      v({ date: "2026-09-15", price: 5000, masterId: "m-1", paymentMethod: "CASH", orderId: "ord-2" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.masters[0]).toMatchObject({ visitsCount: 3, ordersCount: 2 });
  });

  it("наличные из выполненного визита учитываются, даже если заказ отменён", () => {
    const visits = [
      v({ date: "2026-09-01", price: 9000, paymentMethod: "CASH", orderId: "ord-1" }),
    ];
    const s = calcCashByMaster(visits);
    expect(s.totalAmount).toBe(9000);
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
    expect(s.masters[0]).toMatchObject({ masterId: "m-1", visitsCount: 2, ordersCount: 2, total: 17000 });
    expect(s.masters[1]).toMatchObject({ masterId: "m-2", visitsCount: 1, ordersCount: 1, total: 7000 });
  });

  it("мастера отсортированы по убыванию общей суммы", () => {
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

  it("выполненный визит участвует в рейтинге, даже если заказ отменён", () => {
    const visits = [v({ date: "2026-09-01", price: 9000, orderId: "ord-1" })];
    expect(calcMasterRanking(visits)).toHaveLength(1);
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

  it("ordersCount считает уникальные заказы, avgCheck = выручка / ordersCount", () => {
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
