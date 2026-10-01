import { type NextRequest } from "next/server";
import { requireSection } from "@/server/admin";
import { getCurrentUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { getFinanceTransactions } from "@/server/services/finance";
import { transactionsToCsv, type PlanKind } from "@/lib/finance";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireSection("control");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return new Response("Bad Request: from и to в формате YYYY-MM-DD, from ≤ to", { status: 400 });
  }

  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  if (diffMs > MAX_DAYS * 86_400_000) {
    return new Response("Bad Request: диапазон не может превышать 366 дней", { status: 400 });
  }

  const rawType = searchParams.get("type") ?? "";
  const validTypes: PlanKind[] = ["ONE_TIME", "SUBSCRIPTION", "PACKAGE"];
  const type = (validTypes as string[]).includes(rawType) ? (rawType as PlanKind) : undefined;

  const masterId = searchParams.get("masterId") ?? undefined;
  const serviceId = searchParams.get("serviceId") ?? undefined;

  // Выгружаем все страницы последовательно (не более ~10 000 строк за раз)
  const allRows = [];
  let cursor: string | undefined;
  let iterations = 0;
  do {
    const page = await getFinanceTransactions({ from, to, type, masterId, serviceId }, cursor);
    allRows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
    iterations++;
    // Защита от бесконечного цикла: не более 200 страниц × 50 строк = 10 000 строк
    if (iterations >= 200) break;
  } while (cursor);

  const csv = transactionsToCsv(allRows);
  const filename = `finance_${from}_${to}.csv`;

  // Пишем в журнал: кто, когда, за какой период
  await audit(user.id, "finance.export", "User", user.id, {
    from,
    to,
    type: type ?? null,
    masterId: masterId ?? null,
    serviceId: serviceId ?? null,
    rows: allRows.length,
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
