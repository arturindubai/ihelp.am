import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  userCreate: vi.fn(),
  sendOtp: vi.fn().mockResolvedValue({ ok: true }),
  verifyOtp: vi.fn(),
  alertTech: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  audit: vi.fn(),
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
      create: mocks.userCreate,
    },
    master: { findFirst: vi.fn() },
  },
}));

vi.mock("../../otp", () => ({
  sendOtp: mocks.sendOtp,
  verifyOtp: mocks.verifyOtp,
}));

vi.mock("../../auth", () => ({
  createSession: mocks.createSession,
  getCurrentUser: vi.fn(),
  hash: vi.fn((s: string) => s),
  logout: vi.fn(),
}));

vi.mock("../../audit", () => ({ audit: mocks.audit }));

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

import { sendEmailLoginCodeAction, verifyEmailLoginCodeAction } from "../auth";

describe("sendEmailLoginCodeAction — alertTech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendOtp.mockResolvedValue({ ok: true });
    mocks.alertTech.mockResolvedValue(undefined);
  });

  it("вызывает email-login-unverified если адрес есть в базе, но не подтверждён", async () => {
    mocks.findMany.mockResolvedValue([]);
    // findFirst — пользователь с emailVerifiedAt: null
    mocks.findFirst.mockResolvedValueOnce({ id: "u1", email: "test@example.com", emailVerifiedAt: null });

    await sendEmailLoginCodeAction("test@example.com");

    const calls = mocks.alertTech.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe("email-login-unverified");
  });

  it("вызывает email-new-registration если адреса нет ни у одного аккаунта", async () => {
    mocks.findMany.mockResolvedValue([]);
    // findFirst — нет никакого пользователя
    mocks.findFirst.mockResolvedValueOnce(null);

    await sendEmailLoginCodeAction("new@example.com");

    const calls = mocks.alertTech.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe("email-new-registration");
  });

  it("не вызывает alertTech если пользователь верифицирован", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "u1", email: "ok@example.com", emailVerifiedAt: new Date(), blocked: false, role: "CLIENT" },
    ]);

    await sendEmailLoginCodeAction("ok@example.com");

    expect(mocks.alertTech).not.toHaveBeenCalled();
  });

  it("skipDelivery для незнакомого адреса равен false — письмо уходит", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValueOnce(null);

    await sendEmailLoginCodeAction("brand-new@example.com");

    const call = mocks.sendOtp.mock.calls[0];
    expect(call[4]).toEqual(expect.objectContaining({ skipDelivery: false }));
  });

  it("skipDelivery для неподтверждённого адреса равен true — письмо не уходит", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValueOnce({ id: "u2", email: "unverified@example.com", emailVerifiedAt: null });

    await sendEmailLoginCodeAction("unverified@example.com");

    const call = mocks.sendOtp.mock.calls[0];
    expect(call[4]).toEqual(expect.objectContaining({ skipDelivery: true }));
  });
});

describe("verifyEmailLoginCodeAction — создание аккаунта", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue(true);
    mocks.createSession.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.alertTech.mockResolvedValue(undefined);
  });

  it("незнакомый адрес + верный код → создаётся аккаунт и сессия", async () => {
    // verifiedUserByEmail: нет верифицированных
    mocks.findMany.mockResolvedValue([]);
    // anyUser: нет вообще никакого пользователя
    mocks.findFirst.mockResolvedValueOnce(null);
    // db.user.create возвращает нового пользователя
    const newUser = { id: "new1", email: "brand@example.com", role: "CLIENT", phone: null };
    mocks.userCreate.mockResolvedValue(newUser);

    const r = await verifyEmailLoginCodeAction("brand@example.com", "1234");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.role).toBe("CLIENT");
    expect(mocks.userCreate).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledWith("new1", "CLIENT");
  });

  it("существующий верифицированный аккаунт → вход без создания нового", async () => {
    const existUser = { id: "ex1", email: "exist@example.com", emailVerifiedAt: new Date(), blocked: false, role: "CLIENT" };
    mocks.findMany.mockResolvedValue([existUser]);

    const r = await verifyEmailLoginCodeAction("exist@example.com", "1234");

    expect(r.ok).toBe(true);
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenCalledWith("ex1", "CLIENT");
  });

  it("заблокированный пользователь → ошибка, сессия не создаётся", async () => {
    const blockedUser = { id: "bl1", email: "blocked@example.com", emailVerifiedAt: new Date(), blocked: true, role: "CLIENT" };
    mocks.findMany.mockResolvedValue([blockedUser]);

    const r = await verifyEmailLoginCodeAction("blocked@example.com", "1234");

    expect(r.ok).toBe(false);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("неверный код → ошибка", async () => {
    mocks.verifyOtp.mockResolvedValue(false);
    mocks.findMany.mockResolvedValue([]);

    const r = await verifyEmailLoginCodeAction("any@example.com", "0000");

    expect(r.ok).toBe(false);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("адрес неподтверждён в базе → ошибка, дубликат не создаётся", async () => {
    // verifiedUserByEmail: нет верифицированных
    mocks.findMany.mockResolvedValue([]);
    // anyUser: есть неподтверждённый
    mocks.findFirst.mockResolvedValueOnce({ id: "unv1", email: "unv@example.com", emailVerifiedAt: null });

    const r = await verifyEmailLoginCodeAction("unv@example.com", "1234");

    expect(r.ok).toBe(false);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });
});
