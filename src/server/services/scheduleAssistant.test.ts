import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---------- Хранилища для моков ----------

type VisitRecord = {
  id: string;
  durationMin: number;
  masterId: string | null;
  scheduledAt: Date | null;
  status: string;
  order: { serviceId: string; address: { district: string | null; street: string } | null };
};

type MasterRecord = {
  id: string;
  active: boolean;
  workingHours: Record<string, [string, string][]>;
  skills: { id: string }[];
  timeOff: { from: Date; to: Date }[];
  visits: { scheduledAt: Date; durationMin: number }[];
};

const visitStore = new Map<string, VisitRecord>();
const masterStore = new Map<string, MasterRecord>();
let enqueueInternalCalls: { kind: string; input: unknown; requestedBy?: string }[] = [];
let nextReqId = 1;

vi.mock("../db", () => ({
  db: {
    visit: {
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const ids = (where?.id as { in?: string[] })?.in;
        if (ids) {
          return Promise.resolve(ids.map((id) => visitStore.get(id)).filter(Boolean));
        }
        // Запрос по scheduledAt и masterId
        return Promise.resolve([...visitStore.values()].filter((v) => v.masterId === null));
      }),
    },
    master: {
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const ids = (where?.id as { in?: string[] })?.in;
        const activeOnly = where?.active === true;
        let result = [...masterStore.values()];
        if (ids) result = result.filter((m) => ids.includes(m.id));
        if (activeOnly) result = result.filter((m) => m.active);
        return Promise.resolve(result);
      }),
    },
  },
}));

vi.mock("../settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    booking: { bufferMin: 30, slotStepMin: 30, leadHours: 3, horizonDays: 21, subscriptionHorizonDays: 30 },
  }),
}));

vi.mock("./aiQueue", () => ({
  enqueueInternal: vi.fn().mockImplementation((kind: string, input: unknown, requestedBy?: string) => {
    enqueueInternalCalls.push({ kind, input, requestedBy });
    return Promise.resolve({ id: `req-${nextReqId++}` });
  }),
}));

vi.mock("./booking", () => ({
  BUSY_STATUSES: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"],
}));

import { parseAndValidateProposal, requestScheduleProposal } from "./scheduleAssistant";

// ---------- Вспомогательные функции ----------

function makeDate(date: string, time: string) {
  return new Date(`${date}T${time}:00+04:00`);
}

function addVisit(v: VisitRecord) {
  visitStore.set(v.id, v);
}

function addMaster(m: MasterRecord) {
  masterStore.set(m.id, m);
}

// ---------- Тесты ----------

beforeEach(() => {
  visitStore.clear();
  masterStore.clear();
  enqueueInternalCalls = [];
  nextReqId = 1;
});

describe("parseAndValidateProposal", () => {
  it("невалидный output → пустые назначения, explanation из raw", async () => {
    const result = await parseAndValidateProposal({ raw: "claude ответил не JSON" });
    expect(result.assignments).toHaveLength(0);
    expect(result.explanation).toContain("claude ответил не JSON");
  });

  it("output не соответствует схеме → пустые назначения", async () => {
    const result = await parseAndValidateProposal({ assignments: "не массив", explanation: "ok" });
    expect(result.assignments).toHaveLength(0);
  });

  it("пустой массив assignments → пустой результат", async () => {
    const result = await parseAndValidateProposal({ assignments: [], explanation: "нечего делать" });
    expect(result.assignments).toHaveLength(0);
    expect(result.explanation).toBe("нечего делать");
  });

  it("мастер не найден в БД → invalid, причина 'мастер неактивен или не найден'", async () => {
    addVisit({
      id: "v1",
      durationMin: 120,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    // Мастер m1 не добавлен в store

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "проверка" }],
      explanation: "тест",
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].valid).toBe(false);
    expect(result.assignments[0].invalidReason).toMatch(/мастер неактивен/);
  });

  it("визит не найден в БД → invalid, причина 'визит не найден'", async () => {
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "3": [["09:00", "18:00"]] }, // среда
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [],
    });
    // visitId "v1" не в store

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "проверка" }],
      explanation: "тест",
    });

    expect(result.assignments[0].valid).toBe(false);
    expect(result.assignments[0].invalidReason).toMatch(/визит не найден/);
  });

  it("мастер не имеет навыка для услуги → invalid", async () => {
    addVisit({
      id: "v1",
      durationMin: 60,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-cleaning", address: null },
    });
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "3": [["09:00", "18:00"]] },
      skills: [{ id: "svc-other" }], // другая услуга
      timeOff: [],
      visits: [],
    });

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "тест" }],
      explanation: "тест",
    });

    expect(result.assignments[0].valid).toBe(false);
    expect(result.assignments[0].invalidReason).toMatch(/навык/);
  });

  it("слот вне рабочих часов → invalid", async () => {
    addVisit({
      id: "v1",
      durationMin: 60,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "22:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    addMaster({
      id: "m1",
      active: true,
      // Среда (2026-10-01 = четверг, ISO day 4), дадим только пн
      workingHours: { "1": [["09:00", "18:00"]] },
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [],
    });

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "22:00", reason: "тест" }],
      explanation: "тест",
    });

    expect(result.assignments[0].valid).toBe(false);
    expect(result.assignments[0].invalidReason).toMatch(/рабочих часов/);
  });

  it("слот занят существующим визитом → invalid", async () => {
    const existingStart = makeDate("2026-10-01", "10:00");
    addVisit({
      id: "v1",
      durationMin: 60,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    // 2026-10-01 — четверг, ISO day 4
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "4": [["09:00", "18:00"]] },
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [
        {
          scheduledAt: existingStart,
          durationMin: 120, // занят 10:00–12:00
        },
      ],
    });

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "тест" }],
      explanation: "тест",
    });

    expect(result.assignments[0].valid).toBe(false);
    expect(result.assignments[0].invalidReason).toMatch(/занят/);
  });

  it("валидное назначение → valid=true", async () => {
    addVisit({
      id: "v1",
      durationMin: 60,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    // 2026-10-01 — четверг, ISO day 4
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "4": [["09:00", "18:00"]] },
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [],
    });

    const result = await parseAndValidateProposal({
      assignments: [{ visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "свободен" }],
      explanation: "назначен",
    });

    expect(result.assignments[0].valid).toBe(true);
    expect(result.explanation).toBe("назначен");
  });

  it("два назначения одному мастеру подряд — второе конфликтует с первым → invalid", async () => {
    // Мастер работает целый день, занятых визитов нет
    addVisit({
      id: "v1",
      durationMin: 120,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    addVisit({
      id: "v2",
      durationMin: 60,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "10:30"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: null },
    });
    // 2026-10-01 — четверг, ISO day 4
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "4": [["09:00", "18:00"]] },
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [],
    });

    const result = await parseAndValidateProposal({
      assignments: [
        { visitId: "v1", masterId: "m1", date: "2026-10-01", time: "10:00", reason: "первый" },
        { visitId: "v2", masterId: "m1", date: "2026-10-01", time: "10:30", reason: "второй — конфликт" },
      ],
      explanation: "тест",
    });

    // Первое валидно, второе конфликтует с первым (v1 занимает 10:00–12:00 + буфер)
    expect(result.assignments[0].valid).toBe(true);
    expect(result.assignments[1].valid).toBe(false);
    expect(result.assignments[1].invalidReason).toMatch(/занят/);
  });
});

describe("requestScheduleProposal", () => {
  it("ставит запрос kind=schedule-proposal с визитами и мастерами", async () => {
    addVisit({
      id: "v1",
      durationMin: 90,
      masterId: null,
      scheduledAt: makeDate("2026-10-01", "11:00"),
      status: "SCHEDULED",
      order: { serviceId: "svc-1", address: { district: "Кентрон", street: "ул. Абовяна" } },
    });
    addMaster({
      id: "m1",
      active: true,
      workingHours: { "4": [["09:00", "18:00"]] },
      skills: [{ id: "svc-1" }],
      timeOff: [],
      visits: [],
    });

    const result = await requestScheduleProposal("2026-10-01", "user-1");

    expect(result.requestId).toBe("req-1");
    expect(result.visitCount).toBe(1);
    expect(enqueueInternalCalls).toHaveLength(1);
    const { kind, input } = enqueueInternalCalls[0];
    expect(kind).toBe("schedule-proposal");
    const inp = input as Record<string, unknown>;
    expect(inp.date).toBe("2026-10-01");
    expect((inp.visits as unknown[]).length).toBe(1);
    expect(inp.travelMatrix).toBeNull(); // зарезервировано для ROUTE-4
    // Адрес передаётся без имени клиента
    const visitInput = (inp.visits as Array<{ address: { district: string; street: string } }>)[0];
    expect(visitInput.address.district).toBe("Кентрон");
    expect(visitInput.address.street).toBe("ул. Абовяна");
  });

  it("нет нераспределённых визитов → visitCount=0, запрос всё равно ставится", async () => {
    addMaster({
      id: "m1",
      active: true,
      workingHours: {},
      skills: [],
      timeOff: [],
      visits: [],
    });

    const result = await requestScheduleProposal("2026-10-01");
    expect(result.visitCount).toBe(0);
    expect(result.requestId).toBeDefined();
  });
});
