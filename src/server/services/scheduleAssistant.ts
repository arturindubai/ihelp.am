import "server-only";
import { z } from "zod";
import { db } from "../db";
import { enqueueInternal } from "./aiQueue";
import { isMasterFree, type MasterAvailability } from "@/lib/slots";
import { BUSY_STATUSES } from "./booking";
import { atYerevan } from "@/lib/time";
import { getSettings } from "../settings";

// ---------- Zod-схема выхода модели ----------

const AssignmentSchema = z.object({
  visitId: z.string(),
  masterId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "неверный формат даты"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "неверный формат времени"),
  reason: z.string(),
});

const ProposalOutputSchema = z.object({
  assignments: z.array(AssignmentSchema),
  explanation: z.string(),
});

export type ProposalAssignment = z.infer<typeof AssignmentSchema>;

export interface ValidatedAssignment extends ProposalAssignment {
  /** true — прошло валидацию, false — отброшено с пояснением */
  valid: boolean;
  /** причина отброса, только при valid=false */
  invalidReason?: string;
}

export interface ParsedProposal {
  assignments: ValidatedAssignment[];
  explanation: string;
}

// ---------- Построение запроса ----------

/**
 * Собирает нераспределённые визиты дня (scheduledAt на дату, masterId=null)
 * и занятость активных мастеров, ставит запрос kind=schedule-proposal в очередь.
 * Возвращает id AiRequest и число визитов в запросе.
 *
 * Поле travelMatrix зарезервировано для ROUTE-4 (время в пути между адресами).
 */
export async function requestScheduleProposal(
  date: string,
  requestedBy?: string,
): Promise<{ requestId: string; visitCount: number }> {
  const settings = await getSettings();
  const bufferMin = settings.booking.bufferMin;
  const dayStart = atYerevan(date, "00:00");
  const dayEnd = atYerevan(date, "23:59");

  const [visits, masters] = await Promise.all([
    db.visit.findMany({
      where: {
        scheduledAt: { gte: dayStart, lte: dayEnd },
        masterId: null,
        status: { notIn: ["CANCELLED", "SKIPPED", "NO_SHOW", "DONE"] },
      },
      include: {
        order: {
          include: {
            address: { select: { district: true, street: true } },
          },
        },
      },
    }),
    db.master.findMany({
      where: { active: true },
      include: {
        timeOff: { where: { to: { gt: dayStart }, from: { lt: dayEnd } } },
        visits: {
          where: {
            status: { in: BUSY_STATUSES },
            scheduledAt: {
              gte: new Date(dayStart.getTime() - 12 * 3600_000),
              lt: new Date(dayEnd.getTime() + 2 * 3600_000),
            },
          },
          select: { scheduledAt: true, durationMin: true },
        },
        skills: { select: { id: true } },
      },
    }),
  ]);

  const input: Record<string, unknown> = {
    date,
    bufferMin,
    visits: visits.map((v) => ({
      id: v.id,
      durationMin: v.durationMin,
      serviceId: v.order.serviceId,
      // Только район и улица — без имени клиента (ПДн, docs/PERSONAL_DATA.md)
      address: v.order.address
        ? { district: v.order.address.district ?? null, street: v.order.address.street }
        : null,
    })),
    masters: masters.map((m) => ({
      id: m.id,
      skillIds: m.skills.map((s) => s.id),
      workingHours: m.workingHours,
      timeOff: m.timeOff.map((t) => ({ from: t.from.toISOString(), to: t.to.toISOString() })),
      busy: m.visits.map((v) => ({
        start: v.scheduledAt!.toISOString(),
        end: new Date(v.scheduledAt!.getTime() + v.durationMin * 60_000).toISOString(),
      })),
    })),
    // Зарезервировано для ROUTE-4: матрица времени в пути между адресами
    travelMatrix: null,
  };

  const req = await enqueueInternal("schedule-proposal", input, requestedBy);
  return { requestId: req.id, visitCount: visits.length };
}

// ---------- Разбор и валидация ответа ----------

/**
 * Разбирает output AiRequest по строгой схеме ProposalOutputSchema.
 * Каждое назначение проверяется теми же правилами, что и ручное назначение:
 * мастер активен, имеет нужный навык, слот свободен с учётом буфера.
 *
 * Порядок важен: первое валидное назначение мастера добавляется в его busy-список,
 * чтобы последующие назначения того же мастера не конфликтовали с ним.
 */
export async function parseAndValidateProposal(output: unknown): Promise<ParsedProposal> {
  const parsed = ProposalOutputSchema.safeParse(output);
  if (!parsed.success) {
    const raw =
      typeof output === "object" && output !== null && "raw" in output
        ? String((output as { raw: unknown }).raw)
        : "Не удалось разобрать ответ модели";
    return { assignments: [], explanation: raw };
  }

  const { assignments, explanation } = parsed.data;
  if (assignments.length === 0) return { assignments: [], explanation };

  const settings = await getSettings();
  const bufferMin = settings.booking.bufferMin;

  const masterIds = [...new Set(assignments.map((a) => a.masterId))];
  const visitIds = [...new Set(assignments.map((a) => a.visitId))];

  // Диапазон дат для загрузки занятости мастеров
  const sortedDates = assignments.map((a) => a.date).sort();
  const from = new Date(atYerevan(sortedDates[0], "00:00").getTime() - 12 * 3600_000);
  const to = new Date(atYerevan(sortedDates[sortedDates.length - 1], "23:59").getTime() + 2 * 3600_000);

  const [visits, mastersData] = await Promise.all([
    db.visit.findMany({
      where: { id: { in: visitIds } },
      include: { order: { select: { serviceId: true } } },
    }),
    db.master.findMany({
      where: { id: { in: masterIds }, active: true },
      include: {
        skills: { select: { id: true } },
        timeOff: { where: { to: { gt: from }, from: { lt: to } } },
        visits: {
          where: {
            status: { in: BUSY_STATUSES },
            scheduledAt: { gte: from, lt: to },
            // исключаем сами визиты из предложения: они пока без мастера
            id: { notIn: visitIds },
          },
          select: { scheduledAt: true, durationMin: true },
        },
      },
    }),
  ]);

  const visitMap = new Map(visits.map((v) => [v.id, v]));

  // In-memory занятость мастеров; пополняется по мере подтверждения назначений
  type MasterState = {
    skillIds: Set<string>;
    availability: MasterAvailability;
  };
  const masterState = new Map<string, MasterState>(
    mastersData.map((m) => [
      m.id,
      {
        skillIds: new Set(m.skills.map((s) => s.id)),
        availability: {
          id: m.id,
          workingHours: m.workingHours as MasterAvailability["workingHours"],
          timeOff: m.timeOff.map((t) => ({ from: t.from, to: t.to })),
          busy: m.visits.map((v) => ({
            start: v.scheduledAt!,
            end: new Date(v.scheduledAt!.getTime() + v.durationMin * 60_000),
          })),
        },
      },
    ]),
  );

  const validated: ValidatedAssignment[] = [];

  for (const a of assignments) {
    const visit = visitMap.get(a.visitId);
    if (!visit) {
      validated.push({ ...a, valid: false, invalidReason: "визит не найден" });
      continue;
    }

    const state = masterState.get(a.masterId);
    if (!state) {
      validated.push({ ...a, valid: false, invalidReason: "мастер неактивен или не найден" });
      continue;
    }

    if (!state.skillIds.has(visit.order.serviceId)) {
      validated.push({ ...a, valid: false, invalidReason: "мастер не имеет навыка для этой услуги" });
      continue;
    }

    const start = atYerevan(a.date, a.time);
    if (!isMasterFree(state.availability, start, visit.durationMin, bufferMin)) {
      validated.push({ ...a, valid: false, invalidReason: "слот занят или вне рабочих часов" });
      continue;
    }

    // Назначение прошло: добавляем в busy мастера, чтобы следующие его назначения это учли
    state.availability.busy.push({
      start,
      end: new Date(start.getTime() + visit.durationMin * 60_000),
    });
    validated.push({ ...a, valid: true });
  }

  return { assignments: validated, explanation };
}
