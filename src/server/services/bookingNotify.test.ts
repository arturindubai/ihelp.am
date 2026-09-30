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
    masterId: string | null;
    master: { name: string } | null;
    clientNotifiedEvents: string[];
    order: { id: string; number: number; userId: string; config: unknown; addressSnapshot: unknown };
  }
>();

vi.mock("./reviews", () => ({
  createReviewToken: vi.fn().mockResolvedValue("test-review-token"),
}));

const userStore = new Map<
  string,
  { telegramId: string | null; email: string | null; name: string | null; emailUnsubscribedAt?: Date | null }
>();

// Контролируемый результат db.visit.findMany для тестов cron-функций
let visitFindManyResult: unknown[] = [];

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
      findMany: vi.fn().mockImplementation(() => Promise.resolve(visitFindManyResult)),
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
    clientMessage: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("./notifyQueue", () => ({
  sendTelegramDirect: vi.fn().mockResolvedValue(undefined),
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
    notify: { telegramBotToken: "tg-token-client", quietHourStart: 21, quietHourEnd: 9 },
    brand: { name: "iHelp" },
    mail: { enabled: true, apiKey: "test-key", from: "noreply@ihelp.am" },
  }),
  getUiOverrides: vi.fn().mockResolvedValue([]),
}));

// Импорты мокированных модулей — получаем ссылки на vi.fn()
import { sendTelegramDirect } from "./notifyQueue";
import { sendMail } from "./mail";
import { notifyTech } from "../notify";

import {
  notifyClientOrderCreated,
  notifyClientMasterAssigned,
  notifyClientRescheduled,
  notifyClientCancelled,
  notifyClientVisitCompleted,
  notifyClientVisitCancelled,
  sendVisitReminders,
  sendReviewRequests,
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
    masterId: "master-1",
    master: { name: "Иван Петров" },
    clientNotifiedEvents: [],
    order: {
      id: "order-id-1",
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
  visitFindManyResult = [];
  vi.mocked(sendTelegramDirect).mockClear().mockResolvedValue(undefined);
  vi.mocked(sendMail).mockClear().mockResolvedValue({ ok: true });
  vi.mocked(notifyTech).mockClear();
});

// ────────────────────────────────────────────────────────────────────────────
// Выбор канала

describe("выбор канала доставки", () => {
  it("Telegram — если у клиента есть telegramId", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
  });

  it("email — если нет Telegram, но есть email", async () => {
    makeOrder("o1");
    makeUser("u1", "email");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
  });

  it("алерт оператору — если нет ни Telegram ни email", async () => {
    makeOrder("o1");
    makeUser("u1", "none");
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTech)).toHaveBeenCalledOnce();
  });

  it("fallback на email если Telegram выбросил ошибку", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    // Сначала добавляем email чтобы проверить fallback
    userStore.set("u1", { telegramId: "tg-123", email: "user@example.com", name: "Тест" });
    vi.mocked(sendTelegramDirect).mockRejectedValueOnce(new Error("telegram down"));
    await notifyClientOrderCreated("o1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
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
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("masterAssigned: повторный вызов с тем же мастером не отправляет второе сообщение", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    await notifyClientMasterAssigned("v1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("masterAssigned: смена мастера на другого — второе уведомление отправляется", async () => {
    makeVisit("v1", { masterId: "master-A", master: { name: "Мастер А" } });
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    // Меняем мастера на другого
    visitStore.get("v1")!.masterId = "master-B";
    visitStore.get("v1")!.master = { name: "Мастер Б" };
    await notifyClientMasterAssigned("v1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledTimes(2);
  });

  it("cancelled: повторный вызов не отправляет второе сообщение", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientCancelled("o1");
    await notifyClientCancelled("o1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("visitCancelled: повторный вызов не отправляет второе сообщение", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCancelled("v1");
    await notifyClientVisitCancelled("v1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("completed: повторный вызов не отправляет второе сообщение", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCompleted("v1");
    await notifyClientVisitCompleted("v1");
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("rescheduled: одна дата — одно сообщение; другая дата — ещё одно", async () => {
    makeVisit("v1", { scheduledAt: NOW });
    makeUser("u1", "telegram");
    await notifyClientRescheduled("v1");
    await notifyClientRescheduled("v1"); // повтор той же даты — пропуск

    const laterDate = new Date(NOW.getTime() + 86400_000);
    visitStore.get("v1")!.scheduledAt = laterDate;

    await notifyClientRescheduled("v1"); // другая дата — отправить
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Подстановка переменных в шаблоны

describe("подстановка переменных", () => {
  it("created — текст содержит название услуги, дату и цену в драмах", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Уборка");
    expect(text).toContain("2026-09-28");
    expect(text).toContain("֏");
  });

  it("masterAssigned — текст содержит имя мастера", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Иван Петров");
  });

  it("cancelled — текст содержит дату визита", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientCancelled("o1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("2026-09-28");
  });

  it("completed — текст содержит имя мастера (ссылка на отзыв — отдельно через sendReviewRequests)", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCompleted("v1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Иван Петров");
    expect(text).not.toContain("/account/orders");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Отписка от необязательных писем

describe("отписка от необязательных писем", () => {
  it("отписавшемуся клиенту подтверждение заказа по email всё равно уходит", async () => {
    makeOrder("o-unsub");
    userStore.set("u1", { telegramId: null, email: "user@example.com", name: "Тест", emailUnsubscribedAt: new Date() });
    await notifyClientOrderCreated("o-unsub");
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTech)).not.toHaveBeenCalled();
  });

  it("отписавшемуся клиенту напоминание о визите по email не уходит", async () => {
    const remindTime = new Date(ACTIVE_TIME.getTime() + 24 * 3600_000);
    makeVisit("v-unsub-remind", { id: "v-unsub-remind" });
    userStore.set("u1", { telegramId: null, email: "user@example.com", name: "Тест", emailUnsubscribedAt: new Date() });
    const v = {
      id: "v-unsub-remind",
      scheduledAt: remindTime,
      order: {
        number: 100,
        config: { service: { title: "Уборка" } },
        addressSnapshot: { street: "Пушкина", building: "10" },
        locale: "ru",
        userId: "u1",
        user: { id: "u1", telegramId: null, email: "user@example.com", emailUnsubscribedAt: new Date() },
      },
      master: { name: "Мастер Тест" },
    };
    visitFindManyResult = [v];
    const count = await sendVisitReminders(ACTIVE_TIME);
    expect(count).toBe(0);
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Тихий период (21:00–09:00 Ереван)

// 23:00 Ереван = 19:00 UTC
const QUIET_TIME = new Date("2026-09-28T19:00:00Z");
// 12:00 Ереван = 08:00 UTC
const ACTIVE_TIME = new Date("2026-09-28T08:00:00Z");

function makeReminderVisit(id: string) {
  makeVisit(id, { id });
  userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
  const v = {
    id,
    scheduledAt: new Date(ACTIVE_TIME.getTime() + 24 * 3600_000),
    order: {
      number: 100,
      config: { service: { title: "Уборка" } },
      addressSnapshot: { street: "Пушкина", building: "10" },
      locale: "ru",
      userId: "u1",
      user: { id: "u1", telegramId: "tg-123", email: null, emailUnsubscribedAt: null },
    },
    master: { name: "Мастер Тест" },
  };
  visitFindManyResult = [v];
  return v;
}

function makeReviewVisit(id: string) {
  makeVisit(id, { id });
  userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
  const v = {
    id,
    order: {
      id: "order-id-1",
      locale: "ru",
      userId: "u1",
      user: { id: "u1", telegramId: "tg-123", email: null, emailUnsubscribedAt: null },
    },
  };
  visitFindManyResult = [v];
  return v;
}

describe("тихий период", () => {
  it("sendVisitReminders: в тихий период не отправляет, возвращает 0", async () => {
    makeReminderVisit("v-remind");
    const count = await sendVisitReminders(QUIET_TIME);
    expect(count).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("sendVisitReminders: вне тихого периода отправляет напоминание", async () => {
    makeReminderVisit("v-remind2");
    const count = await sendVisitReminders(ACTIVE_TIME);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("sendReviewRequests: в тихий период не отправляет, возвращает 0", async () => {
    makeReviewVisit("v-review");
    const count = await sendReviewRequests(QUIET_TIME);
    expect(count).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("sendReviewRequests: вне тихого периода отправляет запрос отзыва", async () => {
    makeReviewVisit("v-review2");
    const count = await sendReviewRequests(ACTIVE_TIME);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });
});
