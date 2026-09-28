import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// VAPID ключи для тестов устанавливаем до импорта модуля
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

// Хранилище подписок в памяти
const subStore = new Map<
  string,
  { id: string; userId: string; endpoint: string; p256dh: string; auth: string }
>();

vi.mock("../db", () => ({
  db: {
    pushSubscription: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve([...subStore.values()].filter((s) => s.userId === where.userId)),
      ),
      deleteMany: vi.fn().mockImplementation(({ where }: { where: { userId: string; endpoint: string } }) => {
        for (const [k, v] of subStore.entries()) {
          if (v.userId === where.userId && v.endpoint === where.endpoint) subStore.delete(k);
        }
        return Promise.resolve({ count: 1 });
      }),
    },
  },
}));

const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import { pushNotify, vapidEnabled } from "./pushNotify";
import { db } from "../db";

beforeEach(() => {
  subStore.clear();
  mockSendNotification.mockReset().mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  mockSetVapidDetails.mockReset();
  vi.mocked(db.pushSubscription.findMany).mockClear();
  vi.mocked(db.pushSubscription.deleteMany).mockClear();
});

function makeSub(userId: string, endpoint: string) {
  const id = `sub-${endpoint}`;
  subStore.set(id, { id, userId, endpoint, p256dh: "p256dh-val", auth: "auth-val" });
}

describe("vapidEnabled", () => {
  it("возвращает true когда ключи заданы через env", () => {
    expect(vapidEnabled()).toBe(true);
  });
});

describe("pushNotify — отправка уведомлений", () => {
  it("отправляет push всем подпискам пользователя", async () => {
    makeSub("u1", "https://push.example.com/1");
    makeSub("u1", "https://push.example.com/2");
    await pushNotify("u1", { title: "Тест", body: "Тело" });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("ничего не делает если у пользователя нет подписок", async () => {
    await pushNotify("u1", { title: "Тест", body: "Тело" });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("передаёт правильный JSON-payload", async () => {
    makeSub("u1", "https://push.example.com/1");
    await pushNotify("u1", { title: "Визит завтра", body: "В 10:00", url: "/account/orders/123" });
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.title).toBe("Визит завтра");
    expect(payload.body).toBe("В 10:00");
    expect(payload.url).toBe("/account/orders/123");
  });

  it("удаляет устаревшую подписку при ошибке 410", async () => {
    makeSub("u1", "https://push.example.com/gone");
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    mockSendNotification.mockRejectedValueOnce(err);
    await pushNotify("u1", { title: "Тест", body: "" });
    expect(vi.mocked(db.pushSubscription.deleteMany)).toHaveBeenCalledOnce();
  });

  it("удаляет устаревшую подписку при ошибке 404", async () => {
    makeSub("u1", "https://push.example.com/notfound");
    const err = Object.assign(new Error("not found"), { statusCode: 404 });
    mockSendNotification.mockRejectedValueOnce(err);
    await pushNotify("u1", { title: "Тест", body: "" });
    expect(vi.mocked(db.pushSubscription.deleteMany)).toHaveBeenCalledOnce();
  });

  it("не удаляет подписку при прочих ошибках", async () => {
    makeSub("u1", "https://push.example.com/tmp-error");
    const err = Object.assign(new Error("server error"), { statusCode: 500 });
    mockSendNotification.mockRejectedValueOnce(err);
    await pushNotify("u1", { title: "Тест", body: "" });
    expect(vi.mocked(db.pushSubscription.deleteMany)).not.toHaveBeenCalled();
  });
});
