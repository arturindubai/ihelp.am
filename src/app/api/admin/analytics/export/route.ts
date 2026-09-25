import { type NextRequest } from "next/server";
import { requireSection } from "@/server/admin";
import { getDailyMetrics, rowsToCsv } from "@/server/services/analytics";

export async function GET(req: NextRequest) {
  try {
    await requireSection("analytics");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return new Response("Bad Request: from и to должны быть в формате YYYY-MM-DD, from ≤ to", { status: 400 });
  }

  // Ограничение: не более 366 дней за один запрос
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (toMs - fromMs > 366 * 86400_000) {
    return new Response("Bad Request: диапазон не может превышать 366 дней", { status: 400 });
  }

  const rows = await getDailyMetrics(from, to);
  const csv = rowsToCsv(rows);
  const filename = `analytics_${from}_${to}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
