"use server";
import { requireSection } from "../../admin";
import { audit } from "../../audit";
import { get } from "../../services/aiQueue";
import { requestScheduleProposal, parseAndValidateProposal } from "../../services/scheduleAssistant";
import { scheduleVisit } from "../../services/booking";

/** Поставить запрос на предложение расписания для указанного дня */
export async function requestProposalAction(date: string): Promise<
  { ok: true; requestId: string; visitCount: number } | { ok: false; error: string }
> {
  const u = await requireSection("schedule");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "invalid_date" };
  try {
    const result = await requestScheduleProposal(date, u.id);
    await audit(u.id, "schedule.propose", "AiRequest", result.requestId, { date });
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Применить предложение: назначить мастеров и время одним вызовом.
 * Требует право schedule. Невалидные назначения пропускаются и возвращаются в skipped.
 */
export async function applyProposalAction(requestId: string): Promise<
  | { ok: true; applied: number; skipped: { visitId: string; reason: string }[] }
  | { ok: false; error: string }
> {
  const u = await requireSection("schedule");

  const req = await get(requestId);
  if (!req) return { ok: false, error: "not_found" };
  if (req.status !== "done") return { ok: false, error: "not_done" };

  const proposal = await parseAndValidateProposal(req.output);
  const valid = proposal.assignments.filter((a) => a.valid);
  const skipped: { visitId: string; reason: string }[] = proposal.assignments
    .filter((a) => !a.valid)
    .map((a) => ({ visitId: a.visitId, reason: a.invalidReason ?? "unknown" }));

  let applied = 0;
  for (const a of valid) {
    try {
      await scheduleVisit(a.visitId, a.date, a.time, a.masterId, { strictMaster: true });
      applied++;
    } catch (e) {
      skipped.push({ visitId: a.visitId, reason: e instanceof Error ? e.message : "unknown" });
    }
  }

  await audit(u.id, "schedule.apply", "AiRequest", requestId, {
    applied,
    skipped: skipped.length,
  });
  return { ok: true, applied, skipped };
}

/**
 * Отклонить предложение: ничего не меняет в расписании,
 * только фиксирует решение в аудит-логе.
 */
export async function rejectProposalAction(requestId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const u = await requireSection("schedule");
  const req = await get(requestId);
  if (!req) return { ok: false, error: "not_found" };
  await audit(u.id, "schedule.reject", "AiRequest", requestId, {});
  return { ok: true };
}
