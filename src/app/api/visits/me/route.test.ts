import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}));

const mockFindMany = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    visit: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/server/auth", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

import { GET } from "./route";

function makeVisit(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "v1",
    scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
    durationMin: 120,
    status: "SCHEDULED",
    price: 8000,
    order: {
      service: { title: { ru: "Уборка", en: "Cleaning", am: "Մաքրություն" } },
    },
    master: { name: { ru: "Анна" }, photo: null },
    ...overrides,
  };
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockFindMany.mockReset().mockResolvedValue([]);
});

describe("GET /api/visits/me", () => {
  it("возвращает 401 для анонима", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("возвращает 200 с пустым массивом визитов для авторизованного клиента", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", role: "CLIENT" });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.visits).toEqual([]);
    expect(data.cachedAt).toBeTruthy();
  });

  it("возвращает список визитов с нужными полями", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", role: "CLIENT" });
    mockFindMany.mockResolvedValue([makeVisit()]);
    const res = await GET();
    const data = await res.json();
    expect(data.visits).toHaveLength(1);
    const v = data.visits[0];
    expect(v.id).toBe("v1");
    expect(v.status).toBe("SCHEDULED");
    expect(v.price).toBe(8000);
    expect(v.scheduledAt).toBe("2026-10-01T08:00:00.000Z");
    expect(v.serviceTitle).toEqual({ ru: "Уборка", en: "Cleaning", am: "Մաքրություն" });
  });

  it("фильтрует нужные поля и не включает лишних", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", role: "CLIENT" });
    mockFindMany.mockResolvedValue([makeVisit()]);
    const res = await GET();
    const data = await res.json();
    const v = data.visits[0];
    // нет лишних данных клиента (это кэш клиента, не мастера)
    expect("clientPhone" in v).toBe(false);
    expect("address" in v).toBe(false);
  });
});
