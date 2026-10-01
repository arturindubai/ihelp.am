"use server";
import { z } from "zod";
import { requireSection } from "../../admin";
import { getFinanceTransactions, type TransactionPage } from "../../services/finance";
import type { PlanKind } from "@/lib/finance";

const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"]).optional(),
  masterId: z.string().max(60).optional(),
  serviceId: z.string().max(60).optional(),
  cursor: z.string().max(60).optional(),
});

/** Загружает следующую страницу транзакций. Доступно только с правом control */
export async function getFinanceTransactionsAction(
  params: z.infer<typeof paramsSchema>,
): Promise<{ ok: true } & TransactionPage | { ok: false; error: string }> {
  try {
    await requireSection("control");
  } catch {
    return { ok: false, error: "forbidden" };
  }

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { from, to, type, masterId, serviceId, cursor } = parsed.data;

  if (from > to) return { ok: false, error: "invalid" };

  const page = await getFinanceTransactions(
    { from, to, type: type as PlanKind | undefined, masterId, serviceId },
    cursor,
  );

  return { ok: true, ...page };
}
