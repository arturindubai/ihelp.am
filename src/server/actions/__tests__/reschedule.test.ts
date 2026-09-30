import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleVisit: vi.fn().mockResolvedValue({ id: "visit-1" }),
  getMastersForService: vi.fn().mockResolvedValue([]),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null), set: vi.fn(), delete: vi.fn() }),
}));

vi.mock("../../db", () => ({
  db: {
    visit: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    master: { findMany: vi.fn() },
    user: { update: vi.fn() },
    review: { findUnique: vi.fn() },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("../../auth", () => ({ getCurrentUser: vi.fn() }));

vi.mock("../../settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    booking: {
      freeCancelHours: 24,
      leadHours: 4,
      horizonDays: 36500,
      bufferMin: 15,
      allowChooseMaster: true,
    },
  }),
}));

vi.mock("../../notify", () => ({
  html: vi.fn((s: TemplateStringsArray) => String(s[0])),
  notifyTeam: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../otp", () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("../../audit", () => ({ audit: vi.fn() }));
vi.mock("../../alerts", () => ({ alertTech: vi.fn() }));
vi.mock("@/lib/emailToken", () => ({ verifyUnsubscribeToken: vi.fn() }));
vi.mock("@/lib/email", () => ({ normalizeEmail: vi.fn((v: string) => v) }));

vi.mock("../../services/teamNotify", () => ({
  notifyCancelOrderTeam: vi.fn().mockResolvedValue(undefined),
  notifyCancelVisitTeam: vi.fn().mockResolvedValue(undefined),
  notifyRescheduleVisitTeam: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/workerNotify", () => ({
  notifyMasterAssigned: vi.fn().mockResolvedValue(undefined),
  notifyMasterRescheduled: vi.fn().mockResolvedValue(undefined),
  notifyMasterCancelled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/bookingNotify", () => ({
  notifyClientCancelled: vi.fn().mockResolvedValue(undefined),
  notifyClientRescheduled: vi.fn().mockResolvedValue(undefined),
  notifyClientOrderCreated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/reviews", () => ({
  consumeReviewToken: vi.fn(),
}));

vi.mock("../../services/booking", () => ({
  BookingError: class BookingError extends Error {},
  scheduleVisit: mocks.scheduleVisit,
  BUSY_STATUSES: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"],
}));

vi.mock("../../services/catalog", () => ({
  getMastersForService: mocks.getMastersForService,
}));

import { db } from "../../db";
import { getCurrentUser } from "../../auth";
import { getSettings } from "../../settings";
import { rescheduleVisitAction, rescheduleInfoAction } from "../account";

const FUTURE = new Date(Date.now() + 48 * 3600_000);
const DATE = "2099-01-15";
const TIME = "10:00";

function makeUser(id = "user-1") {
  return { id, phone: "+37400000001", name: "Тест", role: "CLIENT", locale: "ru", blocked: false, email: null, emailVerifiedAt: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), telegramId: null, telegramUsername: null, privacyConsentAt: null, adsConsentAt: null, adminNotes: null, emailUnsubscribedAt: null };
}

function makeVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: "visit-1",
    status: "SCHEDULED",
    scheduledAt: FUTURE,
    durationMin: 120,
    masterId: "master-old",
    orderId: "order-1",
    order: {
      id: "order-1",
      userId: "user-1",
      kind: "ONE_TIME",
      status: "ACTIVE",
      preferredMasterId: "master-old",
      serviceId: "service-1",
      expiresAt: null,
      locale: "ru",
    },
    ...overrides,
  };
}

describe("rescheduleVisitAction — передача masterId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser() as never);
    vi.mocked(db.visit.findFirst).mockResolvedValue(makeVisit() as never);
    mocks.scheduleVisit.mockResolvedValue({ id: "visit-1" });
  });

  it("передаёт выбранного мастера в scheduleVisit", async () => {
    const r = await rescheduleVisitAction("visit-1", DATE, TIME, "master-new");
    expect(r.ok).toBe(true);
    expect(mocks.scheduleVisit).toHaveBeenCalledWith("visit-1", DATE, TIME, "master-new");
  });

  it("передаёт null, если мастер не выбран", async () => {
    const r = await rescheduleVisitAction("visit-1", DATE, TIME, null);
    expect(r.ok).toBe(true);
    expect(mocks.scheduleVisit).toHaveBeenCalledWith("visit-1", DATE, TIME, null);
  });

  it("по умолчанию передаёт null при вызове без четвёртого аргумента", async () => {
    const r = await rescheduleVisitAction("visit-1", DATE, TIME);
    expect(r.ok).toBe(true);
    expect(mocks.scheduleVisit).toHaveBeenCalledWith("visit-1", DATE, TIME, null);
  });

  it("возвращает ошибку, если слот занят", async () => {
    const { BookingError } = await import("../../services/booking");
    mocks.scheduleVisit.mockRejectedValueOnce(new BookingError("slot_taken"));
    const r = await rescheduleVisitAction("visit-1", DATE, TIME, "master-new");
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toBe("slot_taken");
  });
});

describe("rescheduleInfoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser() as never);
    vi.mocked(db.visit.findFirst).mockResolvedValue(makeVisit() as never);
    vi.mocked(getSettings).mockResolvedValue({
      booking: { freeCancelHours: 24, leadHours: 4, horizonDays: 36500, bufferMin: 15, allowChooseMaster: true },
    } as never);
  });

  it("возвращает текущего мастера визита", async () => {
    mocks.getMastersForService.mockResolvedValueOnce([]);
    const r = await rescheduleInfoAction("visit-1");
    expect(r.currentMasterId).toBe("master-old");
  });

  it("возвращает список мастеров из getMastersForService", async () => {
    mocks.getMastersForService.mockResolvedValueOnce([
      { id: "master-1", name: { ru: "Анна" }, photo: null, rating: 4.8, reviewsCount: 12, experienceYears: 3, languages: [], active: true, sort: 0 },
    ]);
    const r = await rescheduleInfoAction("visit-1");
    expect(r.allowChooseMaster).toBe(true);
    expect(r.masters).toHaveLength(1);
    expect(r.masters[0].id).toBe("master-1");
    expect(r.masters[0].name).toBe("Анна");
  });

  it("возвращает пустой список при allowChooseMaster=false", async () => {
    vi.mocked(getSettings).mockResolvedValueOnce({ booking: { freeCancelHours: 24, leadHours: 4, horizonDays: 36500, bufferMin: 15, allowChooseMaster: false } } as never);
    const r = await rescheduleInfoAction("visit-1");
    expect(r.allowChooseMaster).toBe(false);
    expect(r.masters).toHaveLength(0);
  });
});
