import "server-only";
import { db } from "../db";
import { atYerevan, addDays, ymd } from "@/lib/time";
import {
  calcPeriodStats,
  calcDailyRevenue,
  calcCashByMaster,
  calcMasterRanking,
  noConversionData,
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
  const fromDt = atYerevan(from, "00:00");
  const toDt = atYerevan(addDays(to, 1), "00:00");

  const rows = await db.visit.findMany({
    where: {
      status: "DONE",
      finishedAt: { gte: fromDt, lt: toDt },
    },
    select: {
      price: true,
      finishedAt: true,
      masterId: true,
      master: { select: { name: true } },
      order: {
        select: {
          id: true,
          kind: true,
          paymentMethod: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    date: ymd(r.finishedAt!),
    price: r.price,
    kind: r.order.kind as FinanceVisit["kind"],
    orderId: r.order.id,
    masterId: r.masterId,
    masterName: r.master ? extractName(r.master.name) : null,
    paymentMethod: r.order.paymentMethod as FinanceVisit["paymentMethod"],
  }));
}

/** Вытаскивает русское имя мастера из JSON-поля name: { ru, en, am } */
function extractName(name: unknown): string {
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const n = name as Record<string, string>;
    return n.ru ?? n.en ?? n.am ?? "";
  }
  return "";
}

/** Финансовые показатели за период [from, to] */
export async function getFinanceStats(from: string, to: string): Promise<{
  stats: PeriodStats;
  daily: DailyChannelRow[];
  cash: CashSummary;
  masters: MasterRankRow[];
  conversion: ConversionInfo;
}> {
  // Длина периода в днях для вычисления предыдущего периода
  const fromDt = new Date(atYerevan(from, "00:00").getTime());
  const toDt = new Date(atYerevan(addDays(to, 1), "00:00").getTime());
  const days = Math.round((toDt.getTime() - fromDt.getTime()) / 86_400_000);

  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -days);

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
