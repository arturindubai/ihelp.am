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
  extractMasterName,
  type FinanceVisit,
  type PeriodStats,
  type DailyChannelRow,
  type CashSummary,
  type MasterRankRow,
  type ConversionInfo,
  type TransactionRow,
  type PlanKind,
  type PaymentMethod,
} from "@/lib/finance";

export type { PeriodStats, DailyChannelRow, CashSummary, MasterRankRow, ConversionInfo, TransactionRow };

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

/** Вспомогательная функция: извлекает ru-заголовок из JSON-поля title услуги */
function extractServiceName(title: unknown): string {
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const t = title as Record<string, string>;
    return t.ru ?? t.en ?? t.am ?? "";
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

export interface TransactionFilters {
  from: string;
  to: string;
  type?: PlanKind;
  masterId?: string;
  serviceId?: string;
}

export interface TransactionPage {
  rows: TransactionRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

const TX_PAGE_SIZE = 50;

/** Загружает список транзакций (выполненных визитов) за период с фильтрами и курсорной пагинацией */
export async function getFinanceTransactions(
  filters: TransactionFilters,
  cursor?: string,
): Promise<TransactionPage> {
  const { fromDt, toDt } = calcPeriodBounds(filters.from, filters.to);

  const rows = await db.visit.findMany({
    where: {
      status: "DONE",
      finishedAt: { gte: fromDt, lt: toDt },
      ...(filters.masterId ? { masterId: filters.masterId } : {}),
      order: {
        ...(filters.type ? { kind: filters.type } : {}),
        ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
      },
    },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    take: TX_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      finishedAt: true,
      price: true,
      masterId: true,
      master: { select: { name: true } },
      order: {
        select: {
          kind: true,
          paymentMethod: true,
          user: { select: { name: true } },
          service: { select: { title: true } },
        },
      },
    },
  });

  const hasMore = rows.length > TX_PAGE_SIZE;
  const page = rows.slice(0, TX_PAGE_SIZE);

  const mapped: TransactionRow[] = page.map((r) => ({
    visitId: r.id,
    date: new Date(r.finishedAt!).toLocaleDateString("en-CA", { timeZone: "Asia/Yerevan" }),
    type: r.order.kind as PlanKind,
    clientName: r.order.user.name ?? "",
    masterName: r.masterId !== null ? extractMasterName(r.master?.name ?? null) : null,
    serviceName: extractServiceName(r.order.service.title),
    amount: r.price,
    paymentMethod: r.order.paymentMethod as PaymentMethod,
  }));

  return {
    rows: mapped,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Опции для фильтра мастеров: только активные мастера, имя по-русски */
export async function getFinanceMasterOptions(): Promise<{ id: string; name: string }[]> {
  const masters = await db.master.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { sort: "asc" },
  });
  return masters.map((m) => ({ id: m.id, name: extractMasterName(m.name) }));
}

/** Опции для фильтра услуг: только активные услуги, заголовок по-русски */
export async function getFinanceServiceOptions(): Promise<{ id: string; name: string }[]> {
  const services = await db.service.findMany({
    where: { active: true },
    select: { id: true, title: true },
    orderBy: { sort: "asc" },
  });
  return services.map((s) => ({ id: s.id, name: extractServiceName(s.title) }));
}
