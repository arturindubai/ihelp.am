import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  sendOtp: vi.fn().mockResolvedValue({ ok: true }),
  alertTech: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null), set: vi.fn(), delete: vi.fn() }),
}));

vi.mock("../../db", () => ({
  db: {
    user: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    master: { findFirst: vi.fn() },
  },
}));

vi.mock("../../otp", () => ({
  sendOtp: mocks.sendOtp,
  verifyOtp: vi.fn(),
}));

vi.mock("../../auth", () => ({
  createSession: vi.fn(),
  getCurrentUser: vi.fn(),
  hash: vi.fn((s: string) => s),
  logout: vi.fn(),
}));

vi.mock("../../audit", () => ({ audit: vi.fn() }));

vi.mock("../../alerts", () => ({ alertTech: mocks.alertTech }));

vi.mock("../../notify", () => ({
  html: vi.fn((s: TemplateStringsArray) => String(s[0])),
  notifyTech: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  normalizeEmail: vi.fn((e: string) => (e?.includes("@") ? e.toLowerCase() : null)),
}));

vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn() }));
vi.mock("@/lib/signupTicket", () => ({ packSignupTicket: vi.fn(), unpackSignupTicket: vi.fn() }));

import { sendEmailLoginCodeAction } from "../auth";

describe("sendEmailLoginCodeAction — alertTech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendOtp.mockResolvedValue({ ok: true });
    mocks.alertTech.mockResolvedValue(undefined);
  });

  it("вызывает email-login-unverified если адрес есть в базе, но не подтверждён", async () => {
    // verifiedUserByEmail: нет верифицированных пользователей
    mocks.findMany.mockResolvedValue([]);
    // первый findFirst — пользователь с emailVerifiedAt: null
    mocks.findFirst.mockResolvedValueOnce({ id: "u1", email: "test@example.com", emailVerifiedAt: null });

    await sendEmailLoginCodeAction("test@example.com");

    const calls = mocks.alertTech.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe("email-login-unverified");
  });

  it("вызывает email-login-unknown если адреса нет ни у одного аккаунта", async () => {
    // verifiedUserByEmail: нет верифицированных пользователей
    mocks.findMany.mockResolvedValue([]);
    // первый findFirst — нет неверифицированных
    mocks.findFirst.mockResolvedValueOnce(null);
    // второй findFirst — нет вообще никакого пользователя
    mocks.findFirst.mockResolvedValueOnce(null);

    await sendEmailLoginCodeAction("unknown@example.com");

    const calls = mocks.alertTech.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe("email-login-unknown");
  });

  it("не вызывает alertTech если пользователь верифицирован", async () => {
    // verifiedUserByEmail возвращает одного верифицированного пользователя
    mocks.findMany.mockResolvedValue([
      { id: "u1", email: "ok@example.com", emailVerifiedAt: new Date(), blocked: false, role: "CLIENT" },
    ]);

    await sendEmailLoginCodeAction("ok@example.com");

    expect(mocks.alertTech).not.toHaveBeenCalled();
  });
});
