import { describe, expect, it } from "vitest";
import { rowsToCsv, type DailyRow } from "./analytics";

describe("rowsToCsv", () => {
  const rows: DailyRow[] = [
    { date: "2026-09-01", orders_count: 3, revenue_amd: 15000, master_utilization_pct: 62, first_visit_ratio_pct: 33 },
    { date: "2026-09-02", orders_count: 0, revenue_amd: 0, master_utilization_pct: 0, first_visit_ratio_pct: 0 },
  ];

  it("содержит заголовок первой строкой", () => {
    const csv = rowsToCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("date,orders_count,revenue_amd,master_utilization_pct,first_visit_ratio_pct");
  });

  it("каждая строка данных следует после заголовка", () => {
    const lines = rowsToCsv(rows).split("\r\n");
    expect(lines[1]).toBe("2026-09-01,3,15000,62,33");
    expect(lines[2]).toBe("2026-09-02,0,0,0,0");
  });

  it("заканчивается на CRLF", () => {
    expect(rowsToCsv(rows).endsWith("\r\n")).toBe(true);
  });

  it("пустой список — только заголовок и перенос", () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe("date,orders_count,revenue_amd,master_utilization_pct,first_visit_ratio_pct\r\n");
  });
});
