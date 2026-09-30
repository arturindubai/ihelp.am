import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookiesGet = vi.fn();
const mockCookiesDelete = vi.fn();
const mockDeleteManySub = vi.fn();
const mockDeleteManySession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (...args: unknown[]) => mockCookiesGet(...args),
    delete: (...args: unknown[]) => mockCookiesDelete(...args),
  }),
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}));

vi.mock("./db", () => ({
  db: {
    pushSubscription: {
      deleteMany: (...args: unknown[]) => mockDeleteManySub(...args),
    },
    session: {
      deleteMany: (...args: unknown[]) => mockDeleteManySession(...args),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
    user: { update: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("./settings", () => ({
  getSettings: vi.fn().mockResolvedValue({ auth: { staffSessionDays: 7, clientSessionDays: 60 } }),
}));

import { logout } from "./auth";

beforeEach(() => {
  mockCookiesGet.mockReset();
  mockCookiesDelete.mockReset();
  mockDeleteManySub.mockReset().mockResolvedValue({ count: 0 });
  mockDeleteManySession.mockReset().mockResolvedValue({ count: 1 });
  mockCookiesGet.mockReturnValue({ value: "test-token" });
});

describe("logout — п.2 CTO: удаление только подписки этого браузера", () => {
  it("удаляет только подписку переданного endpoint", async () => {
    await logout("https://fcm.googleapis.com/ep/abc");
    expect(mockDeleteManySub).toHaveBeenCalledOnce();
    expect(mockDeleteManySub.mock.calls[0][0]).toMatchObject({
      where: { endpoint: "https://fcm.googleapis.com/ep/abc" },
    });
  });

  it("не удаляет подписки если endpoint не передан", async () => {
    await logout();
    expect(mockDeleteManySub).not.toHaveBeenCalled();
  });

  it("удаляет сессию в обоих случаях", async () => {
    await logout("https://fcm.googleapis.com/ep/abc");
    expect(mockDeleteManySession).toHaveBeenCalledOnce();
    await logout();
    expect(mockDeleteManySession).toHaveBeenCalledTimes(2);
  });

  it("очищает cookie в обоих случаях", async () => {
    await logout("https://fcm.googleapis.com/ep/abc");
    expect(mockCookiesDelete).toHaveBeenCalledOnce();
    await logout();
    expect(mockCookiesDelete).toHaveBeenCalledTimes(2);
  });
});
