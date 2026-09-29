import { addDays } from "./time";

export type PaymentMethod = "CASH" | "CARD";
export type PlanKind = "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE";

/** Один выполненный визит, передаётся из сервиса (сервис фильтрует отменённые заказы) */
export interface FinanceVisit {
  /** YYYY-MM-DD по ереванскому времени (из visit.finishedAt) */
  date: string;
  /** Цена визита в драмах (visit.price) */
  price: number;
  /** Тип заказа (order.kind) */
  kind: PlanKind;
  /** ID заказа */
  orderId: string;
  /** ID мастера, null если не назначен */
  masterId: string | null;
  /** Имя мастера для отображения */
  masterName: string | null;
  /** Способ оплаты заказа */
  paymentMethod: PaymentMethod;
  /** Заказ был отменён — такие визиты исключаются из выручки */
  orderCancelled: boolean;
}

/** Статистика за период */
export interface PeriodStats {
  /** Общая выручка, AMD */
  revenue: number;
  /** Число уникальных заказов с выполненными визитами за период */
  ordersCount: number;
  /** Средний чек (revenue / ordersCount), 0 если нет заказов */
  avgCheck: number;
  /** Изменение выручки к предыдущему периоду той же длины, null если нет данных за прошлый период */
  revenueDelta: number | null;
  byChannel: {
    oneTime: number;
    subscription: number;
    package: number;
  };
}

/** Один день для графика выручки по каналам */
export interface DailyChannelRow {
  date: string;
  oneTime: number;
  subscription: number;
  package: number;
  total: number;
}

/** Наличные по одному мастеру */
export interface MasterCashRow {
  masterId: string;
  masterName: string;
  visitsCount: number;
  amount: number;
}

/** Итог наличных к сдаче */
export interface CashSummary {
  masters: MasterCashRow[];
  totalAmount: number;
  totalVisits: number;
}

/** Строка рейтинга мастеров */
export interface MasterRankRow {
  masterId: string;
  masterName: string;
  revenue: number;
  ordersCount: number;
  avgCheck: number;
}

/** Конверсия посетителей в заказы */
export interface ConversionInfo {
  /** null = нет данных о посещениях */
  value: number | null;
}

/** Фильтрует только визиты, которые входят в выручку (заказ не отменён) */
function revenueVisits(visits: FinanceVisit[]): FinanceVisit[] {
  return visits.filter((v) => !v.orderCancelled);
}

/**
 * Считает статистику за период.
 * @param visits       — выполненные визиты периода (из сервиса)
 * @param prevRevenue  — выручка за предыдущий период той же длины; null если нет данных
 */
export function calcPeriodStats(
  visits: FinanceVisit[],
  prevRevenue: number | null,
): PeriodStats {
  const rv = revenueVisits(visits);

  let revenue = 0;
  let oneTime = 0;
  let subscription = 0;
  let pkg = 0;
  const orderIds = new Set<string>();

  for (const v of rv) {
    revenue += v.price;
    orderIds.add(v.orderId);
    if (v.kind === "ONE_TIME") oneTime += v.price;
    else if (v.kind === "SUBSCRIPTION") subscription += v.price;
    else pkg += v.price;
  }

  const ordersCount = orderIds.size;
  const avgCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;

  let revenueDelta: number | null = null;
  if (prevRevenue !== null) {
    revenueDelta = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  }

  return {
    revenue,
    ordersCount,
    avgCheck,
    revenueDelta,
    byChannel: { oneTime, subscription, package: pkg },
  };
}

/**
 * Считает выручку по каналам за каждый день диапазона [from, to].
 * Дни без визитов присутствуют с нулями.
 */
export function calcDailyRevenue(
  visits: FinanceVisit[],
  from: string,
  to: string,
): DailyChannelRow[] {
  const rv = revenueVisits(visits);

  const byDate: Record<string, { oneTime: number; subscription: number; package: number }> = {};

  for (const v of rv) {
    if (!byDate[v.date]) byDate[v.date] = { oneTime: 0, subscription: 0, package: 0 };
    if (v.kind === "ONE_TIME") byDate[v.date].oneTime += v.price;
    else if (v.kind === "SUBSCRIPTION") byDate[v.date].subscription += v.price;
    else byDate[v.date].package += v.price;
  }

  const rows: DailyChannelRow[] = [];
  let cur = from;
  while (cur <= to) {
    const d = byDate[cur] ?? { oneTime: 0, subscription: 0, package: 0 };
    rows.push({
      date: cur,
      oneTime: d.oneTime,
      subscription: d.subscription,
      package: d.package,
      total: d.oneTime + d.subscription + d.package,
    });
    cur = addDays(cur, 1);
  }
  return rows;
}

/**
 * Считает наличные к сдаче по мастерам.
 * Учитываются только визиты с paymentMethod=CASH из невытых заказов.
 */
export function calcCashByMaster(visits: FinanceVisit[]): CashSummary {
  const rv = revenueVisits(visits).filter((v) => v.paymentMethod === "CASH");

  const byMaster: Record<string, { name: string; visitsCount: number; amount: number }> = {};

  for (const v of rv) {
    const key = v.masterId ?? "__unknown__";
    const name = v.masterName ?? "Не назначен";
    if (!byMaster[key]) byMaster[key] = { name, visitsCount: 0, amount: 0 };
    byMaster[key].visitsCount++;
    byMaster[key].amount += v.price;
  }

  const masters: MasterCashRow[] = Object.entries(byMaster).map(([masterId, m]) => ({
    masterId,
    masterName: m.name,
    visitsCount: m.visitsCount,
    amount: m.amount,
  }));

  masters.sort((a, b) => b.amount - a.amount);

  const totalAmount = masters.reduce((s, m) => s + m.amount, 0);
  const totalVisits = masters.reduce((s, m) => s + m.visitsCount, 0);

  return { masters, totalAmount, totalVisits };
}

/**
 * Считает рейтинг мастеров по выручке (топ-10 по умолчанию).
 * Выручка и число заказов — по всем выполненным визитам невытых заказов.
 */
export function calcMasterRanking(
  visits: FinanceVisit[],
  limit = 10,
): MasterRankRow[] {
  const rv = revenueVisits(visits).filter((v) => v.masterId !== null);

  const byMaster: Record<
    string,
    { name: string; revenue: number; orderIds: Set<string> }
  > = {};

  for (const v of rv) {
    const key = v.masterId!;
    if (!byMaster[key]) byMaster[key] = { name: v.masterName ?? key, revenue: 0, orderIds: new Set() };
    byMaster[key].revenue += v.price;
    byMaster[key].orderIds.add(v.orderId);
  }

  const rows: MasterRankRow[] = Object.entries(byMaster).map(([masterId, m]) => {
    const ordersCount = m.orderIds.size;
    return {
      masterId,
      masterName: m.name,
      revenue: m.revenue,
      ordersCount,
      avgCheck: ordersCount > 0 ? Math.round(m.revenue / ordersCount) : 0,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue);
  return rows.slice(0, limit);
}

/** Конверсия недоступна: данных о посещениях нет (веб-аналитика не подключена) */
export function noConversionData(): ConversionInfo {
  return { value: null };
}
