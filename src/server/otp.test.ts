import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  count: vi.fn().mockResolvedValue(0),
  aggregate: vi.fn().mockResolvedValue({ _count: 0, _sum: { attempts: 0 } }),
  create: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  alertTech: vi.fn().mockResolvedValue(undefined),
  deliver: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("./db", () => ({
  db: {
    otpCode: {
      findFirst: mocks.findFirst,
      count: mocks.count,
      aggregate: mocks.aggregate,
      create: mocks.create,
      updateMany: mocks.updateMany,
    },
    user: { findUnique: mocks.findUnique },
  },
}));

vi.mock("./alerts", () => ({ alertTech: mocks.alertTech }));
vi.mock("./settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    otp: {
      resendSec: 60,
      ttlMin: 5,
      codeLength: 4,
      maxAttempts: 5,
      telegram: { enabled: false, gatewayToken: "" },
      whatsapp: { enabled: false },
      sms: { enabled: false },
    },
    mail: { enabled: false, apiKey: "", from: "" },
  }),
}));
vi.mock("./auth", () => ({ hash: (s: string) => `hash:${s}` }));
vi.mock("./notify", () => ({ html: vi.fn((s: TemplateStringsArray) => String(s[0])) }));
vi.mock("./services/mail", () => ({ sendMail: vi.fn(), mailTemplate: vi.fn() }));
vi.mock("@/i18n/messages", () => ({ loadMessages: vi.fn().mockResolvedValue({}) }));
vi.mock("next-intl", () => ({ createTranslator: vi.fn().mockReturnValue(() => "") }));

import { verifyOtp, availableChannels } from "./otp";

describe("verifyOtp — атомарный лимит попыток", () => {
  const phone = "+37491000001";
  const goodCode = "1234";
  const badCode = "0000";
  const rec = {
    id: "otp1",
    phone,
    codeHash: `hash:${phone}:${goodCode}`,
    expiresAt: new Date(Date.now() + 300_000),
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
    channel: "WHATSAPP" as const,
    ip: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(rec);
    mocks.aggregate.mockResolvedValue({ _count: 0, _sum: { attempts: 0 } });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("верный код → атомарная пометка consumedAt, возвращает true", async () => {
    const ok = await verifyOtp(phone, goodCode);
    expect(ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "otp1", consumedAt: null }) }),
    );
  });

  it("неверный код → атомарный инкремент только если attempts < maxAttempts", async () => {
    const ok = await verifyOtp(phone, badCode);
    expect(ok).toBe(false);
    const call = mocks.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "otp1", consumedAt: null, attempts: { lt: 5 } });
    expect(call.data).toMatchObject({ attempts: { increment: 1 } });
  });

  it("updateMany вернул count=0 (лимит уже достигнут гонкой) → false без повторного инкремента", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const ok = await verifyOtp(phone, badCode);
    expect(ok).toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("повторное использование уже consumed кода → false (updateMany count=0)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const ok = await verifyOtp(phone, goodCode);
    expect(ok).toBe(false);
  });

  it("код уже на лимите attempts (read) → false без обращения к updateMany", async () => {
    mocks.findFirst.mockResolvedValue({ ...rec, attempts: 5 });
    const ok = await verifyOtp(phone, badCode);
    expect(ok).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("availableChannels — OTP_DEV_MODE gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("без OTP_DEV_MODE возвращает пустой список когда все каналы выключены", async () => {
    const old = process.env.OTP_DEV_MODE;
    delete process.env.OTP_DEV_MODE;
    const list = await availableChannels();
    expect(list).toEqual([]);
    process.env.OTP_DEV_MODE = old;
  });

  it("OTP_DEV_MODE=true возвращает все три канала как fallback", async () => {
    const old = process.env.OTP_DEV_MODE;
    process.env.OTP_DEV_MODE = "true";
    const list = await availableChannels();
    expect(list).toEqual(["WHATSAPP", "TELEGRAM", "SMS"]);
    process.env.OTP_DEV_MODE = old;
  });
});
