import "server-only";
import { db } from "../db";
import {
  calcPeriodStats,
  calcDailyRevenue,
  calcCashByMaster,
  calcMasterRanking,
  noConversionData,
  mapDbRow,
  calcPeriodBounds,
  type FinanceVisit,
  type PeriodStats,
  type DailyChannelRow,
  type CashSummary,
  type MasterRankRow,
  type ConversionInfo,
} from "@/lib/finance";

export type { PeriodStats, DailyChannelRow, CashSummary, MasterRankRow, ConversionInfo };

/** Загружает выполненные визиты за период [from, to] включительно (по ереванскому времени) */
async function loadVisits(from: string, to: string): Promise<FinanceVisit[]> {
  const { fromDt, toDt } = calcPeriodBounds(from, to);

  const rows = await db.visit.findMany({
    where: {
      status: "DONE",
      finishedAt: { gte: fromDt, lt: toDt },
    },
    select: {
      price: true,
      finishedAt: true,
      masterId: true,
      cashCollected: true,
      master: { select: { name: true } },
      order: {
        select: {
          id: true,
          kind: true,
          status: true,
          paymentMethod: true,
        },
      },
    },
  });

  return rows.map((r) => mapDbRow({
    finishedAt: r.finishedAt!,
    price: r.price,
    kind: r.order.kind,
    orderStatus: r.order.status,
    orderId: r.order.id,
    masterId: r.masterId,
    masterName: r.master?.name ?? null,
    paymentMethod: r.order.paymentMethod,
    cashCollected: r.cashCollected,
  }));
}

/** Финансовые показатели за период [from, to] */
export async function getFinanceStats(from: string, to: string): Promise<{
  stats: PeriodStats;
  daily: DailyChannelRow[];
  cash: CashSummary;
  masters: MasterRankRow[];
  conversion: ConversionInfo;
}> {
  const { prevFrom, prevTo } = calcPeriodBounds(from, to);

  const [visits, prevVisits] = await Promise.all([
    loadVisits(from, to),
    loadVisits(prevFrom, prevTo),
  ]);

  const prevRevenue = prevVisits.reduce((s, v) => s + v.price, 0);

  return {
    stats: calcPeriodStats(visits, prevRevenue),
    daily: calcDailyRevenue(visits, from, to),
    cash: calcCashByMaster(visits),
    masters: calcMasterRanking(visits),
    conversion: noConversionData(),
  };
}
