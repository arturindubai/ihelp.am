import "server-only";
import type { VisitStatus } from "@prisma/client";
import { db } from "../db";
import { BUSY_STATUSES } from "./booking";
import { atYerevan, addDays, isoWeekday, ymd, toMin } from "@/lib/time";
import type { DailyRow } from "@/lib/analytics";

export type { DailyRow } from "@/lib/analytics";
export { rowsToCsv } from "@/lib/analytics";

/** Метрики дашборда по дням в диапазоне [from, to] включительно. */
export async function getDailyMetrics(from: string, to: string): Promise<DailyRow[]> {
  const fromDt = atYerevan(from, "00:00");
  const toDt = atYerevan(addDays(to, 1), "00:00");

  const COUNTED: VisitStatus[] = [...BUSY_STATUSES, "DONE"];

  const [orders, schedVisits, revenueVisits, masters] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: fromDt, lt: toDt } },
      select: { createdAt: true },
    }),
    db.visit.findMany({
      where: { scheduledAt: { gte: fromDt, lt: toDt }, status: { in: COUNTED } },
      select: { scheduledAt: true, durationMin: true, index: true, order: { select: { config: true } } },
    }),
    db.visit.findMany({
      where: { status: "DONE", finishedAt: { gte: fromDt, lt: toDt } },
      select: { finishedAt: true, price: true },
    }),
    db.master.findMany({
      where: { active: true },
      select: { workingHours: true },
    }),
  ]);

  // Рабочие минуты мастеров по дню недели (1=пн … 7=вс)
  const workMinByWeekday: Record<number, number> = {};
  for (const m of masters) {
    const wh = (m.workingHours || {}) as Record<string, [string, string][]>;
    for (let day = 1; day <= 7; day++) {
      const slots = wh[String(day)] || [];
      const min = slots.reduce((s, [f, e]) => s + toMin(e) - toMin(f), 0);
      workMinByWeekday[day] = (workMinByWeekday[day] || 0) + min;
    }
  }

  // Заказы по дате
  const ordersByDate: Record<string, number> = {};
  for (const o of orders) {
    const d = ymd(o.createdAt);
    ordersByDate[d] = (ordersByDate[d] || 0) + 1;
  }

  // Визиты по дате: всего, первых, занято минут
  type VisitDay = { total: number; first: number; busyMin: number };
  const visitsByDate: Record<string, VisitDay> = {};
  for (const v of schedVisits) {
    if (!v.scheduledAt) continue;
    const d = ymd(v.scheduledAt);
    if (!visitsByDate[d]) visitsByDate[d] = { total: 0, first: 0, busyMin: 0 };
    visitsByDate[d].total++;
    if (v.index === 1 && (v.order.config as Record<string, unknown>)?.firstOrder === true) visitsByDate[d].first++;
    visitsByDate[d].busyMin += v.durationMin;
  }

  // Выручка по дате завершения визита
  const revenueByDate: Record<string, number> = {};
  for (const v of revenueVisits) {
    if (!v.finishedAt) continue;
    const d = ymd(v.finishedAt);
    revenueByDate[d] = (revenueByDate[d] || 0) + v.price;
  }

  const rows: DailyRow[] = [];
  let cur = from;
  while (cur <= to) {
    const workMin = workMinByWeekday[isoWeekday(cur)] || 0;
    const vd = visitsByDate[cur] || { total: 0, first: 0, busyMin: 0 };
    rows.push({
      date: cur,
      orders_count: ordersByDate[cur] || 0,
      revenue_amd: revenueByDate[cur] || 0,
      master_utilization_pct: workMin ? Math.round((vd.busyMin / workMin) * 100) : 0,
      first_visit_ratio_pct: vd.total ? Math.round((vd.first / vd.total) * 100) : 0,
    });
    cur = addDays(cur, 1);
  }
  return rows;
}
