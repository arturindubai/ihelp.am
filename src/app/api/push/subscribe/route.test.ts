import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}));

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

const mockGetCurrentUser = vi.fn();
vi.mock("@/server/auth", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

import { POST, DELETE } from "./route";

function makeUser(id = "user-1") {
  return { id, role: "CLIENT" as const };
}

function makeRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validSub = {
  endpoint: "https://push.example.com/sub/123",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockUpsert.mockReset().mockResolvedValue({});
  mockDeleteMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("POST /api/push/subscribe — сохранение подписки", () => {
  it("возвращает 401 для анонимного пользователя", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest(validSub));
    expect(res.status).toBe(401);
  });

  it("возвращает 400 при невалидном теле запроса", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ endpoint: "not-a-url", keys: {} }));
    expect(res.status).toBe(400);
  });

  it("сохраняет подписку через upsert и возвращает ok", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser("user-42"));
    const res = await POST(makeRequest(validSub));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      where: { userId_endpoint: { userId: "user-42", endpoint: validSub.endpoint } },
      create: { userId: "user-42", endpoint: validSub.endpoint, p256dh: validSub.keys.p256dh, auth: validSub.keys.auth },
      update: { p256dh: validSub.keys.p256dh, auth: validSub.keys.auth },
    });
  });

  it("повторный POST с тем же endpoint обновляет запись, не создаёт дубль", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser("user-42"));
    await POST(makeRequest(validSub));
    await POST(makeRequest(validSub));
    // upsert вызван дважды с одинаковым where — защита от дублей на уровне БД
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const [first, second] = mockUpsert.mock.calls;
    expect(first[0].where).toEqual(second[0].where);
  });
});

describe("DELETE /api/push/subscribe — отзыв подписки", () => {
  it("возвращает 401 для анонимного пользователя", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ endpoint: validSub.endpoint }, "DELETE"));
    expect(res.status).toBe(401);
  });

  it("возвращает 400 если endpoint не передан", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const res = await DELETE(makeRequest({}, "DELETE"));
    expect(res.status).toBe(400);
  });

  it("удаляет подписку и возвращает ok", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser("user-42"));
    const res = await DELETE(makeRequest({ endpoint: validSub.endpoint }, "DELETE"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockDeleteMany).toHaveBeenCalledOnce();
    expect(mockDeleteMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "user-42", endpoint: validSub.endpoint },
    });
  });
});
