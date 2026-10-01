import { addDays, atYerevan, ymd } from "./time";

export type PaymentMethod = "CASH" | "CARD";
export type PlanKind = "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE";

/** Один выполненный визит (Visit.status = DONE), передаётся из сервиса */
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
  /** Имя мастера для отображения, null если мастер не назначен */
  masterName: string | null;
  /** Способ оплаты заказа */
  paymentMethod: PaymentMethod;
  /** Мастер отметил приём наличных */
  cashCollected: boolean;
}

/** Сырая строка из базы данных перед преобразованием в FinanceVisit */
export interface DbFinanceRow {
  /** Дата завершения визита (UTC) */
  finishedAt: Date;
  price: number;
  kind: string;
  /** Статус заказа (Order.status). Не используется для фильтрации — все DONE-визиты входят в выручку */
  orderStatus: string;
  orderId: string;
  masterId: string | null;
  /** JSON-поле name мастера ({ ru, en, am } или строка), null если мастер не назначен */
  masterName: unknown;
  paymentMethod: string;
  cashCollected: boolean;
}

/** Конвертирует строку из базы данных в FinanceVisit; дата конвертируется через ymd() (UTC → Ереван) */
export function mapDbRow(row: DbFinanceRow): FinanceVisit {
  return {
    date: ymd(row.finishedAt),
    price: row.price,
    kind: row.kind as PlanKind,
    orderId: row.orderId,
    masterId: row.masterId,
    masterName: row.masterId !== null ? extractMasterName(row.masterName) : null,
    paymentMethod: row.paymentMethod as PaymentMethod,
    cashCollected: row.cashCollected,
  };
}

/** Вытаскивает русское имя мастера из JSON-поля name: { ru, en, am } */
export function extractMasterName(name: unknown): string {
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const n = name as Record<string, string>;
    return n.ru ?? n.en ?? n.am ?? "";
  }
  return "";
}

/** Границы периода и предыдущего периода для запроса к базе */
export interface PeriodBounds {
  /** Начало периода — 00:00 первого дня по Еревану */
  fromDt: Date;
  /** Конец периода — 00:00 дня после последнего по Еревану */
  toDt: Date;
  /** Длина периода в днях */
  days: number;
  /** Начало предыдущего периода той же длины */
  prevFrom: string;
  /** Конец предыдущего периода той же длины */
  prevTo: string;
}

/** Вычисляет границы периода [from, to] и предыдущего периода той же длины */
export function calcPeriodBounds(from: string, to: string): PeriodBounds {
  const fromDt = atYerevan(from, "00:00");
  const toDt = atYerevan(addDays(to, 1), "00:00");
  const days = Math.round((toDt.getTime() - fromDt.getTime()) / 86_400_000);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -days);
  return { fromDt, toDt, days, prevFrom, prevTo };
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

/** Полученные наличными по одному мастеру */
export interface MasterCashRow {
  masterId: string;
  masterName: string | null;
  /** Число визитов с оплатой наличными */
  visitsCount: number;
  /** Число уникальных заказов с оплатой наличными */
  ordersCount: number;
  /** Ещё не отмечено мастером как сданное (cashCollected=false) */
  toCollect: number;
  /** Уже отмечено мастером как сданное (cashCollected=true) */
  received: number;
  /** Всего наличными = toCollect + received */
  total: number;
}

/** Итого наличными за период */
export interface CashSummary {
  masters: MasterCashRow[];
  /** Итого ещё не сдано (cashCollected=false) */
  totalToCollect: number;
  /** Итого уже сдано (cashCollected=true) */
  totalReceived: number;
  /** Всего наличными = totalToCollect + totalReceived */
  totalAmount: number;
  /** Итого визитов с оплатой наличными */
  totalVisits: number;
}

/** Строка рейтинга мастеров */
export interface MasterRankRow {
  masterId: string;
  masterName: string | null;
  revenue: number;
  ordersCount: number;
  avgCheck: number;
}

/** Конверсия посетителей в заказы */
export interface ConversionInfo {
  /** null = нет данных о посещениях */
  value: number | null;
}

/**
 * Считает статистику за период.
 * Все выполненные визиты (Visit.status=DONE) входят в выручку — включая визиты
 * из отменённых заказов (возвраты пока не учитываются, PAY-3).
 * @param visits       — выполненные визиты периода (из сервиса)
 * @param prevRevenue  — выручка за предыдущий период той же длины; null если нет данных
 */
export function calcPeriodStats(
  visits: FinanceVisit[],
  prevRevenue: number | null,
): PeriodStats {
  let revenue = 0;
  let oneTime = 0;
  let subscription = 0;
  let pkg = 0;
  const orderIds = new Set<string>();

  for (const v of visits) {
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
  const byDate: Record<string, { oneTime: number; subscription: number; package: number }> = {};

  for (const v of visits) {
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
 * Считает наличные по мастерам за период.
 * Визиты без мастера (masterId=null) не учитываются.
 * Возвращает «к сдаче» (cashCollected=false) и «получено» (cashCollected=true) раздельно.
 */
export function calcCashByMaster(visits: FinanceVisit[]): CashSummary {
  const rv = visits.filter((v) => v.paymentMethod === "CASH" && v.masterId !== null);

  const byMaster: Record<string, {
    name: string | null;
    visitsCount: number;
    orderIds: Set<string>;
    toCollect: number;
    received: number;
  }> = {};

  for (const v of rv) {
    const key = v.masterId!;
    if (!byMaster[key]) byMaster[key] = { name: v.masterName, visitsCount: 0, orderIds: new Set(), toCollect: 0, received: 0 };
    byMaster[key].visitsCount++;
    byMaster[key].orderIds.add(v.orderId);
    if (v.cashCollected) {
      byMaster[key].received += v.price;
    } else {
      byMaster[key].toCollect += v.price;
    }
  }

  const masters: MasterCashRow[] = Object.entries(byMaster).map(([masterId, m]) => ({
    masterId,
    masterName: m.name,
    visitsCount: m.visitsCount,
    ordersCount: m.orderIds.size,
    toCollect: m.toCollect,
    received: m.received,
    total: m.toCollect + m.received,
  }));

  masters.sort((a, b) => b.total - a.total);

  const totalToCollect = masters.reduce((s, m) => s + m.toCollect, 0);
  const totalReceived = masters.reduce((s, m) => s + m.received, 0);
  const totalAmount = totalToCollect + totalReceived;
  const totalVisits = masters.reduce((s, m) => s + m.visitsCount, 0);

  return { masters, totalToCollect, totalReceived, totalAmount, totalVisits };
}

/**
 * Считает рейтинг мастеров по выручке (топ-10 по умолчанию).
 * Визиты без мастера (masterId=null) не учитываются.
 */
export function calcMasterRanking(
  visits: FinanceVisit[],
  limit = 10,
): MasterRankRow[] {
  const rv = visits.filter((v) => v.masterId !== null);

  const byMaster: Record<string, { name: string | null; revenue: number; orderIds: Set<string> }> = {};

  for (const v of rv) {
    const key = v.masterId!;
    if (!byMaster[key]) byMaster[key] = { name: v.masterName, revenue: 0, orderIds: new Set() };
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

// ─── Список операций (транзакций) ────────────────────────────────────────────

/** Одна строка в списке/выгрузке операций */
export interface TransactionRow {
  visitId: string;
  /** YYYY-MM-DD по ереванскому времени */
  date: string;
  type: PlanKind;
  /** Имя клиента из user.name; телефон и email не передаются */
  clientName: string;
  masterName: string | null;
  serviceName: string;
  amount: number;
  paymentMethod: PaymentMethod;
}

const TYPE_LABELS: Record<PlanKind, string> = {
  ONE_TIME: "Разовый",
  SUBSCRIPTION: "Подписка",
  PACKAGE: "Пакет",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Наличными",
  CARD: "Картой",
};

/** Экранирует значение для CSV (поле в кавычках, внутренние кавычки удваиваются) */
function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * Конвертирует список операций в CSV-строку.
 * Кодировка UTF-8 с BOM, разделитель — точка с запятой (Excel-совместимый формат).
 * Телефоны и адреса почты клиентов в выгрузку не попадают.
 */
export function transactionsToCsv(rows: TransactionRow[]): string {
  const BOM = "﻿";
  const headers = ["Дата", "Тип", "Клиент", "Мастер", "Услуга", "Сумма", "Способ оплаты"];
  const lines: string[] = [headers.map(csvCell).join(";")];

  for (const r of rows) {
    const cells = [
      r.date,
      TYPE_LABELS[r.type] ?? r.type,
      r.clientName,
      r.masterName ?? "",
      r.serviceName,
      String(r.amount),
      PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod,
    ];
    lines.push(cells.map(csvCell).join(";"));
  }

  return BOM + lines.join("\r\n");
}
