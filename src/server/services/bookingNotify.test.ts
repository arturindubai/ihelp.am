import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Хранилища данных в памяти; обращаются из замыканий — не hoisting-проблема
const orderStore = new Map<
  string,
  {
    id: string;
    number: number;
    userId: string;
    firstVisitPrice: number;
    config: unknown;
    addressSnapshot: unknown;
    clientNotifiedEvents: string[];
    visits: Array<{ scheduledAt: Date }>;
  }
>();

const visitStore = new Map<
  string,
  {
    id: string;
    scheduledAt: Date | null;
    master: { name: string } | null;
    clientNotifiedEvents: string[];
    order: { number: number; userId: string; config: unknown; addressSnapshot: unknown };
  }
>();

const userStore = new Map<
  string,
  { telegramId: string | null; email: string | null; name: string | null }
>();

vi.mock("../db", () => ({
  db: {
    order: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(orderStore.get(where.id) ?? null),
      ),
      update: vi.fn().mockImplementation(
        ({ where, data }: { where: { id: string }; data: { clientNotifiedEvents?: { push: string } } }) => {
          const o = orderStore.get(where.id);
          if (o && data.clientNotifiedEvents?.push) o.clientNotifiedEvents.push(data.clientNotifiedEvents.push);
          return Promise.resolve(o);
        },
      ),
    },
    visit: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(visitStore.get(where.id) ?? null),
      ),
      update: vi.fn().mockImplementation(
        ({ where, data }: { where: { id: string }; data: { clientNotifiedEvents?: { push: string } } }) => {
          const v = visitStore.get(where.id);
          if (v && data.clientNotifiedEvents?.push) v.clientNotifiedEvents.push(data.clientNotifiedEvents.push);
          return Promise.resolve(v);
        },
      ),
    },
    user: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(userStore.get(where.id) ?? null),
      ),
    },
  },
}));

vi.mock("./notifyQueue", () => ({
  enqueueAndSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./mail", () => ({
  sendMail: vi.fn().mockResolvedValue({ ok: true }),
  mailTemplate: (_opts: unknown) => "<html>тест</html>",
}));

vi.mock("../notify", () => ({
  notifyTech: vi.fn().mockResolvedValue(undefined),
  html: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i] ?? "") : ""), ""),
}));

vi.mock("../settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    notify: { telegramBotToken: "tg-token-client" },
    brand: { name: "iHelp" },
  }),
}));

// Импорты мокированных модулей — получаем ссылки на vi.fn()
import { enqueueAndSend } from "./notifyQueue";
import { sendMail } from "./mail";
import { notifyTech } from "../notify";

import {
  notifyClientOrderCreated,
  notifyClientMasterAssigned,
  notifyClientRescheduled,
  notifyClientCancelled,
  notifyClientVisitCompleted,
} from "./bookingNotify";

// ────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-28T10:00:00+04:00");

type OrderData = typeof orderStore extends Map<string, infer V> ? V : never;
type VisitData = typeof visitStore extends Map<string, infer V> ? V : never;

function makeOrder(id: string, overrides: Partial<OrderData> = {}) {
  const o: OrderData = {
    id,
    number: 42,
    userId: "u1",
    firstVisitPrice: 15000,
    config: { service: { title: "Уборка" } },
    addressSnapshot: { street: "Пушкина", building: "10", apartment: "5" },
    clientNotifiedEvents: [],
    visits: [{ scheduledAt: NOW }],
    ...overrides,
  };
  orderStore.set(id, o);
  return o;
}

function makeVisit(id: string, overrides: Partial<VisitData> = {}) {
  const v: VisitData = {
    id,
    scheduledAt: NOW,
    master: { name: "Иван Петров" },
    clientNotifiedEvents: [],
    order: {
      number: 42,
      userId: "u1",
      config: { service: { title: "Уборка" } },
      addressSnapshot: { street: "Пушкина", building: "10" },
    },
    ...overrides,
  };
  visitStore.set(id, v);
  return v;
}

function makeUser(id: string, channel: "telegram" | "email" | "none") {
  const u = {
    telegramId: channel === "telegram" ? "tg-123" : null,
    email: channel === "email" ? "user@example.com" : null,
    name: "Тест Тестов",
  };
  userStore.set(id, u);
  return u;
}

beforeEach(() => {
  orderStore.clear();
  visitStore.clear();
  userStore.clear();
  vi.mocked(enqueueAndSend).mockClear();
  vi.mocked(sendMail).mockClear();
  vi.mocked(notifyTech).mockClear();
});

// ────────────────────────────────────────────────────────────────────────────
// Выбор канала

describe("выбор канала доставки", () => {
  it("Telegram — если у клиента есть telegramId", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledOnce();
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
  });

  it("email — если нет Telegram, но есть email", async () => {
    makeOrder("o1");
    makeUser("u1", "email");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(enqueueAndSend)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
  });

  it("алерт оператору — если нет ни Telegram ни email", async () => {
    makeOrder("o1");
    makeUser("u1", "none");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(enqueueAndSend)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTech)).toHaveBeenCalledOnce();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Защита от повторов (идемпотентность)

describe("защита от повторных уведомлений", () => {
  it("created: повторный вызов не отправляет второе сообщение", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledOnce();
  });

  it("masterAssigned: повторный вызов не отправляет второе сообщение", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    await notifyClientMasterAssigned("v1");
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledOnce();
  });

  it("cancelled: повторный вызов не отправляет второе сообщение", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientCancelled("o1");
    await notifyClientCancelled("o1");
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledOnce();
  });

  it("completed: повторный вызов не отправляет второе сообщение", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCompleted("v1");
    await notifyClientVisitCompleted("v1");
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledOnce();
  });

  it("rescheduled: одна дата — одно сообщение; другая дата — ещё одно", async () => {
    makeVisit("v1", { scheduledAt: NOW });
    makeUser("u1", "telegram");
    await notifyClientRescheduled("v1");
    await notifyClientRescheduled("v1"); // повтор той же даты — пропуск

    const laterDate = new Date(NOW.getTime() + 86400_000);
    visitStore.get("v1")!.scheduledAt = laterDate;

    await notifyClientRescheduled("v1"); // другая дата — отправить
    expect(vi.mocked(enqueueAndSend)).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Подстановка переменных в шаблоны

describe("подстановка переменных", () => {
  it("created — текст содержит название услуги, дату и цену в драмах", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    const text = vi.mocked(enqueueAndSend).mock.calls[0][1];
    expect(text).toContain("Уборка");
    expect(text).toContain("2026-09-28");
    expect(text).toContain("֏");
  });

  it("masterAssigned — текст содержит имя мастера", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    const text = vi.mocked(enqueueAndSend).mock.calls[0][1];
    expect(text).toContain("Иван Петров");
  });

  it("cancelled — текст содержит дату визита", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientCancelled("o1");
    const text = vi.mocked(enqueueAndSend).mock.calls[0][1];
    expect(text).toContain("2026-09-28");
  });

  it("completed — текст содержит имя мастера и ссылку", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCompleted("v1");
    const text = vi.mocked(enqueueAndSend).mock.calls[0][1];
    expect(text).toContain("Иван Петров");
    expect(text).toContain("/account/orders/");
  });
});
