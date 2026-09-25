export interface DailyRow {
  date: string;
  orders_count: number;
  revenue_amd: number;
  master_utilization_pct: number;
  first_visit_ratio_pct: number;
}

/** Сериализует строки в CSV (RFC 4180): заголовок + строки с CRLF. */
export function rowsToCsv(rows: DailyRow[]): string {
  const header = "date,orders_count,revenue_amd,master_utilization_pct,first_visit_ratio_pct";
  const lines = rows.map(
    (r) => `${r.date},${r.orders_count},${r.revenue_amd},${r.master_utilization_pct},${r.first_visit_ratio_pct}`,
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
