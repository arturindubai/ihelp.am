import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requireSection } from "../admin";
import { alertTech } from "../alerts";
import { html } from "../notify";

export type AiStatus = "queued" | "running" | "done" | "failed";

/* ─── Пользовательский API (проверка прав schedule) ─── */

/** Поставить запрос в очередь. Доступно только сотрудникам с правом schedule */
export async function enqueue(kind: string, input: Record<string, unknown>) {
  const u = await requireSection("schedule");
  return db.aiRequest.create({
    data: { kind, input: input as Prisma.InputJsonValue, requestedBy: u.id, status: "queued" },
  });
}

/** Получить запрос по id. Доступно только сотрудникам с правом schedule */
export async function get(id: string) {
  await requireSection("schedule");
  return db.aiRequest.findUnique({ where: { id } });
}

/** Отменить запрос в статусе queued. Доступно только сотрудникам с правом schedule */
export async function cancel(id: string) {
  await requireSection("schedule");
  const req = await db.aiRequest.findUnique({ where: { id } });
  if (!req) throw new Error("not_found");
  if (req.status !== "queued") throw new Error("not_queued");
  return db.aiRequest.update({
    where: { id },
    data: { status: "failed", error: "Отменено пользователем", finishedAt: new Date() },
  });
}

/** Суммарный расход токенов за текущий месяц (для чипа в шапке drawer ROUTE-5) */
export async function getMonthTokens(): Promise<number> {
  await requireSection("schedule");
  return sumMonthTokens();
}

/* ─── Внутренний API (вызывается диспетчером через /api/cc) ─── */

/** Создать запрос без проверки пользовательской сессии (диспетчер, тесты через CC-ключ) */
export async function enqueueInternal(kind: string, input: Record<string, unknown>, requestedBy?: string) {
  return db.aiRequest.create({
    data: { kind, input: input as Prisma.InputJsonValue, requestedBy: requestedBy ?? null, status: "queued" },
  });
}

/** Взять следующий queued-запрос для исполнения (диспетчер) */
export async function popQueued() {
  return db.aiRequest.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
}

/** Пометить запрос как запущенный */
export async function markRunning(id: string) {
  return db.aiRequest.update({
    where: { id },
    data: { status: "running", startedAt: new Date() },
  });
}

/** Записать результат выполнения */
export async function markDone(id: string, output: unknown, tokens: number) {
  return db.aiRequest.update({
    where: { id },
    data: { status: "done", output: output as object, tokens, finishedAt: new Date() },
  });
}

/** Записать ошибку выполнения; при отсутствии входа — тех-алерт */
export async function markFailed(id: string, error: string, loginError = false) {
  const result = await db.aiRequest.update({
    where: { id },
    data: { status: "failed", error: error.slice(0, 1000), finishedAt: new Date() },
  });
  if (loginError) {
    await alertTech(
      "ai-queue:no-login",
      html`⚠️ <b>ИИ-очередь: нет входа в Claude</b>\nЗапрос не выполнен — подписка недоступна.\nВойти: <code>scripts/claude-login.sh</code> на сервере.`,
      60,
      "ai-queue",
    );
  }
  return result;
}

/** Суммарный расход токенов за текущий месяц (без проверки прав, для чипа в drawer) */
export async function sumMonthTokens(): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const result = await db.aiRequest.aggregate({
    _sum: { tokens: true },
    where: { createdAt: { gte: start } },
  });
  return result._sum.tokens ?? 0;
}
