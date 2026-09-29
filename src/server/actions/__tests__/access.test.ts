import { beforeEach, describe, expect, it, vi } from "vitest";

// Моки серверных/Next.js модулей — до импортов тестируемых файлов
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null), set: vi.fn(), delete: vi.fn() }),
}));

vi.mock("../../db", () => ({
  db: {
    visit: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    order: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    master: { findUnique: vi.fn() },
    address: { count: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    user: { update: vi.fn() },
    review: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../auth", () => ({
  getCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  requireUser: vi.fn(),
  AuthError: class AuthError extends Error {},
  STAFF_ROLES: ["OPERATOR", "ADMIN", "OWNER"],
  ADMIN_ROLES: ["ADMIN", "OWNER"],
  hash: vi.fn(),
}));

vi.mock("../../admin", () => ({
  requireSection: vi.fn(),
  sectionsFor: vi.fn(),
}));

vi.mock("../../settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    booking: { freeCancelHours: 24, leadHours: 4, horizonDays: 60, subscriptionHorizonDays: 30, bufferMin: 15 },
    auth: { staffSessionDays: 7, clientSessionDays: 60 },
    pricing: {},
  }),
}));

vi.mock("../../notify", () => ({
  html: vi.fn((s: TemplateStringsArray, ...v: unknown[]) => s.join("")),
  notifyTeam: vi.fn().mockResolvedValue(undefined),
  notifyTech: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../otp", () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("../../audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../alerts", () => ({ alertTech: vi.fn().mockResolvedValue(undefined) }));

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

vi.mock("../../services/visits", () => ({
  setVisitStatus: vi.fn().mockResolvedValue(undefined),
  setCashCollected: vi.fn().mockResolvedValue(undefined),
  refreshOrderState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/operatorService", () => ({
  assignMasterToVisit: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../services/booking", () => ({
  BookingError: class BookingError extends Error {},
  createOrder: vi.fn(),
  getSlots: vi.fn(),
  isFirstOrder: vi.fn(),
  scheduleVisit: vi.fn(),
  BUSY_STATUSES: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"],
  generateSubscriptionVisits: vi.fn().mockResolvedValue(0),
  loadAvailability: vi.fn().mockResolvedValue([]),
  resumeSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/catalog", () => ({
  loadServiceRaw: vi.fn(),
  localizeService: vi.fn(),
  resolveSelection: vi.fn(),
}));

vi.mock("../../services/promo", () => ({ checkPromo: vi.fn() }));

import { db } from "../../db";
import { getCurrentUser, requireRole } from "../../auth";
import { requireSection } from "../../admin";
import { operatorAssignMasterAction } from "../operator";
import { proStatusAction } from "../pro";
import { cancelOrderAction, cancelVisitAction } from "../account";
import { adminOrderAction } from "../admin/orders";

function makeUser(role: "CLIENT" | "MASTER" | "OPERATOR" | "ADMIN" | "OWNER", id = "user-1") {
  return {
    id,
    phone: "+37400000001",
    name: "Тест",
    role,
    locale: "ru",
    blocked: false,
    email: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    telegramId: null,
    telegramUsername: null,
    privacyConsentAt: null,
    adsConsentAt: null,
    adminNotes: null,
  };
}

describe("доступ по ролям: операторские действия", () => {
  beforeEach(() => vi.clearAllMocks());

  it("блокирует анонимного пользователя", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("unauthorized"));
    await expect(operatorAssignMasterAction("visit-1", "master-1")).rejects.toThrow();
  });

  it("блокирует клиента (role=CLIENT)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("forbidden"));
    await expect(operatorAssignMasterAction("visit-1", "master-1")).rejects.toThrow();
  });

  it("пускает оператора", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeUser("OPERATOR") as never);
    vi.mocked(db.visit.findUniqueOrThrow).mockResolvedValue({ masterId: null } as never);
    const result = await operatorAssignMasterAction("visit-1", "master-1");
    expect(result.ok).toBe(true);
  });

  it("пускает администратора", async () => {
    vi.mocked(requireRole).mockResolvedValue(makeUser("ADMIN") as never);
    vi.mocked(db.visit.findUniqueOrThrow).mockResolvedValue({ masterId: null } as never);
    const result = await operatorAssignMasterAction("visit-1", "master-1");
    expect(result.ok).toBe(true);
  });
});

describe("доступ по ролям: действия мастера (pro)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("блокирует анонимного пользователя", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(proStatusAction("visit-1", "ON_WAY")).rejects.toThrow("auth");
  });

  it("блокирует клиента без записи мастера", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("CLIENT") as never);
    vi.mocked(db.master.findUnique).mockResolvedValue(null);
    await expect(proStatusAction("visit-1", "ON_WAY")).rejects.toThrow("forbidden");
  });

  it("блокирует мастера, которому не назначен этот визит", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("MASTER", "user-2") as never);
    vi.mocked(db.master.findUnique).mockResolvedValue({ id: "master-2", userId: "user-2" } as never);
    vi.mocked(db.visit.findFirst).mockResolvedValue(null); // визит не принадлежит этому мастеру
    await expect(proStatusAction("visit-1", "ON_WAY")).rejects.toThrow("not_found");
  });

  it("пускает мастера к своему визиту", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("MASTER", "user-2") as never);
    vi.mocked(db.master.findUnique).mockResolvedValue({ id: "master-2", userId: "user-2", name: { ru: "Иван" } } as never);
    vi.mocked(db.visit.findFirst).mockResolvedValue({ id: "visit-1", masterId: "master-2", status: "SCHEDULED" } as never);
    const result = await proStatusAction("visit-1", "ON_WAY");
    expect(result.ok).toBe(true);
  });
});

describe("доступ по ролям: административные действия", () => {
  beforeEach(() => vi.clearAllMocks());

  it("блокирует клиента", async () => {
    vi.mocked(requireSection).mockRejectedValue(new Error("forbidden"));
    await expect(adminOrderAction("order-1", {})).rejects.toThrow();
  });

  it("пускает администратора", async () => {
    vi.mocked(requireSection).mockResolvedValue(makeUser("ADMIN") as never);
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ id: "order-1", status: "ACTIVE", kind: "ONE_TIME" } as never);
    vi.mocked(db.order.update).mockResolvedValue({} as never);
    const result = await adminOrderAction("order-1", { comment: "тест" });
    expect(result.ok).toBe(true);
  });
});

describe("запрет доступа к чужим заказам и визитам", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancelOrderAction не отменяет чужой заказ", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("CLIENT", "user-a") as never);
    // findFirst с { userId: 'user-a' } возвращает null — заказ принадлежит другому пользователю
    vi.mocked(db.order.findFirst).mockResolvedValue(null);
    const result = await cancelOrderAction("order-of-user-b");
    expect(result.ok).toBe(false);
  });

  it("cancelOrderAction успешно отменяет собственный заказ", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("CLIENT", "user-a") as never);
    vi.mocked(db.order.findFirst).mockResolvedValue({
      id: "order-1",
      userId: "user-a",
      number: 42,
      status: "ACTIVE",
      kind: "ONE_TIME",
      visits: [],
    } as never);
    const result = await cancelOrderAction("order-1");
    expect(result.ok).toBe(true);
  });

  it("cancelVisitAction отклоняет запрос на чужой визит", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("CLIENT", "user-a") as never);
    // findFirst с { order: { userId: 'user-a' } } возвращает null — визит чужой
    vi.mocked(db.visit.findFirst).mockResolvedValue(null);
    await expect(cancelVisitAction("visit-of-user-b")).rejects.toThrow("not_found");
  });

  it("cancelVisitAction успешно отменяет собственный визит", async () => {
    const futureDate = new Date(Date.now() + 48 * 3600_000);
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser("CLIENT", "user-a") as never);
    vi.mocked(db.visit.findFirst).mockResolvedValue({
      id: "visit-1",
      orderId: "order-1",
      masterId: null,
      status: "SCHEDULED",
      scheduledAt: futureDate,
      order: { id: "order-1", userId: "user-a", kind: "ONE_TIME", number: 42 },
    } as never);
    vi.mocked(db.visit.update).mockResolvedValue({} as never);
    vi.mocked(db.order.update).mockResolvedValue({} as never);
    const result = await cancelVisitAction("visit-1");
    expect(result.ok).toBe(true);
  });
});
