import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}));

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockCount = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    pushSubscription: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
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
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockUpsert.mockReset().mockResolvedValue({});
  mockDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mockCount.mockReset().mockResolvedValue(0);
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

  it("возвращает 400 для непрошедшего хоста push-сервиса", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const res = await POST(makeRequest({ ...validSub, endpoint: "https://attacker.example.com/push" }));
    expect(res.status).toBe(400);
  });

  it("сохраняет подписку через upsert по endpoint и возвращает ok", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser("user-42"));
    const res = await POST(makeRequest(validSub));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledOnce();
    // upsert по endpoint (а не по userId_endpoint): подписка переходит к вошедшему
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      where: { endpoint: validSub.endpoint },
      create: { userId: "user-42", endpoint: validSub.endpoint, p256dh: validSub.keys.p256dh, auth: validSub.keys.auth },
      update: { userId: "user-42", p256dh: validSub.keys.p256dh, auth: validSub.keys.auth },
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

  it("возвращает 429 при превышении лимита подписок на пользователя", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser("user-99"));
    mockCount.mockResolvedValue(10); // уже 10 подписок
    const res = await POST(makeRequest(validSub));
    expect(res.status).toBe(429);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/push/subscribe — отзыв подписки", () => {
  it("возвращает 401 для анонимного пользователя", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ endpoint: validSub.endpoint }, "DELETE"));
    expect(res.status).toBe(401);
  });

  it("возвращает 400 если endpoint не передан или не является URL", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const res = await DELETE(makeRequest({}, "DELETE"));
    expect(res.status).toBe(400);
  });

  it("возвращает 400 для невалидного endpoint в DELETE", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const res = await DELETE(makeRequest({ endpoint: "not-a-url" }, "DELETE"));
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
