import "server-only";
import { db } from "../db";
import { denialStats, type DenialStats } from "@/lib/worker-denials";

/**
 * Отказы прав воркеров за сутки для страницы «Здоровье» (DEV-79).
 * Данные — из конца лога запуска: диспетчер дописывает туда раздел об отказах (scripts/dispatcher.mjs → formatDenials).
 * Отдельного поля в таблице WorkerRun для отказов нет; раздел короче четырёх тысяч знаков, поэтому от лога берём хвост.
 */
export async function workerDenials24(): Promise<DenialStats> {
  const day = new Date(Date.now() - 24 * 3600_000);
  const runs = await db.workerRun.findMany({ where: { finishedAt: { gte: day } }, select: { log: true } });
  return denialStats(runs.map((r) => (r.log ? r.log.slice(-4000) : null)));
}
