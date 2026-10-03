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
    locale: string;
    cancelPenalty: number;
    preferredMasterId: string | null;
    preferredMaster: { name: string } | null;
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
    status: string;
    order: { id: string; number: number; userId: string; config: unknown; addressSnapshot: unknown; locale: string };
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
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { clientNotifiedEvents?: { push: string }; remindedAt?: Date | null; reviewRequestedAt?: Date | null };
        }) => {
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
  // Реальное экранирование: позволяет обнаружить двойное экранирование (html`${fill(...)}` вместо `${fill(...)}`)
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return strings.reduce((out, s, i) => out + s + (i < values.length ? esc(String(values[i] ?? "")) : ""), "");
  },
}));

vi.mock("../settings", () => ({
  getSettings: vi.fn().mockResolvedValue({
    notify: { telegramBotToken: "tg-token-client", quietHourStart: 21, quietHourEnd: 9 },
    brand: { name: "iHelp", phone: "", whatsapp: "", telegram: "@ihelp_support", email: "", instagram: "" },
    mail: { enabled: true, apiKey: "test-key", from: "noreply@ihelp.am" },
  }),
  getUiOverrides: vi.fn().mockResolvedValue([]),
}));

// Импорты мокированных модулей — получаем ссылки на vi.fn()
import { sendTelegramDirect } from "./notifyQueue";
import { sendMail } from "./mail";
import { notifyTech } from "../notify";
import { db } from "../db";

import {
  notifyClientOrderCreated,
  notifyClientMasterAssigned,
  notifyClientMasterOnWay,
  notifyClientRescheduled,
  notifyClientCancelled,
  notifyClientVisitCompleted,
  notifyClientVisitCancelled,
  sendVisitReminders,
  sendReviewRequests,
  sendVisit2hReminders,
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
    locale: "ru",
    cancelPenalty: 0,
    preferredMasterId: null,
    preferredMaster: null,
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
    status: "SCHEDULED",
    order: {
      id: "order-id-1",
      number: 42,
      userId: "u1",
      config: { service: { title: "Уборка" } },
      addressSnapshot: { street: "Пушкина", building: "10" },
      locale: "ru",
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
  vi.mocked(db.visit.findMany).mockClear();
  vi.mocked(db.visit.update).mockClear();
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
  it("created — текст содержит название услуги, время, номер заказа и цену в драмах", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientOrderCreated("o1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Уборка");
    expect(text).toContain("10:00");
    expect(text).toContain("42");
    expect(text).toContain("֏");
  });

  it("masterAssigned — текст содержит имя мастера", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientMasterAssigned("v1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Иван Петров");
  });

  it("cancelled — текст содержит время отменённого визита и номер заказа", async () => {
    makeOrder("o1");
    makeUser("u1", "telegram");
    await notifyClientCancelled("o1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("10:00");
    expect(text).toContain("42");
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

// ────────────────────────────────────────────────────────────────────────────
// BUG-17: окно 18 часов — вечерние визиты получают просьбу об отзыве утром

describe("BUG-17: окно 18 часов для sendReviewRequests", () => {
  it("findMany вызывается с окном 18 часов назад", async () => {
    // 09:00 Ереван = 05:00 UTC
    const morning = new Date("2026-09-29T05:00:00Z");
    makeReviewVisit("v-window");
    await sendReviewRequests(morning);
    const arg = vi.mocked(db.visit.findMany).mock.calls[0][0] as {
      where: { finishedAt: { gte: Date; lte: Date } };
    };
    expect(arg.where.finishedAt.gte.getTime()).toEqual(morning.getTime() - 18 * 3600_000);
    expect(arg.where.finishedAt.lte.getTime()).toEqual(morning.getTime() - 2 * 3600_000);
  });

  it("визит завершён в 19:30 — в 09:00 следующего дня функция не заблокирована и отправляет", async () => {
    // 09:00 Ереван = 05:00 UTC; визит 13.5 ч назад входит в окно 2–18 ч
    const morning = new Date("2026-09-29T05:00:00Z");
    makeReviewVisit("v-evening");
    const count = await sendReviewRequests(morning);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("визит завершён в 12:00 — в 14:00 уже в окне и просьба уходит", async () => {
    // 14:00 Ереван = 10:00 UTC; 2 часа после визита — нижняя граница окна
    const twoHoursLater = new Date("2026-09-28T10:00:00Z");
    makeReviewVisit("v-noon");
    const count = await sendReviewRequests(twoHoursLater);
    expect(count).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-17: перенос визита сбрасывает remindedAt

describe("BUG-17: перенос визита сбрасывает remindedAt", () => {
  it("notifyClientRescheduled вызывает update с remindedAt: null", async () => {
    makeVisit("v-reschedule");
    makeUser("u1", "telegram");
    await notifyClientRescheduled("v-reschedule");
    const calls = vi.mocked(db.visit.update).mock.calls;
    const resetCall = calls.find(
      (c) => (c[0] as { data: { remindedAt?: unknown } }).data.remindedAt === null,
    );
    expect(resetCall).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-17: отписка от писем

describe("BUG-17: отписка от писем блокирует отправку", () => {
  it("sendReviewRequests: отписавшемуся клиенту письмо не уходит", async () => {
    const v = {
      id: "v-unsub",
      order: {
        id: "order-unsub",
        locale: "ru",
        userId: "u-unsub",
        user: { id: "u-unsub", telegramId: null, email: "unsub@example.com", emailUnsubscribedAt: new Date() },
      },
    };
    visitFindManyResult = [v];
    const count = await sendReviewRequests(ACTIVE_TIME);
    expect(count).toBe(0);
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-17: символ & в Telegram-напоминании не экранируется дважды

describe("BUG-17: одинарное экранирование & в Telegram-напоминании", () => {
  it("услуга с & приходит как &amp; а не &amp;amp;", async () => {
    const v = {
      id: "v-amp",
      scheduledAt: new Date(ACTIVE_TIME.getTime() + 24 * 3600_000),
      order: {
        number: 200,
        config: { service: { title: "Уборка & мойка" } },
        addressSnapshot: { street: "Ленина", building: "5" },
        locale: "ru",
        userId: "u1",
        user: { id: "u1", telegramId: "tg-123", email: null, emailUnsubscribedAt: null },
      },
      master: { name: "Мастер Тест" },
    };
    makeVisit("v-amp", { id: "v-amp" });
    visitFindManyResult = [v];
    userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
    await sendVisitReminders(ACTIVE_TIME);
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Уборка &amp; мойка");
    expect(text).not.toContain("&amp;amp;");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// sendVisit2hReminders

describe("sendVisit2hReminders", () => {
  function make2hVisit(id: string, scheduledAt: Date) {
    visitStore.set(id, {
      id,
      scheduledAt,
      masterId: "master-1",
      master: { name: "Мастер Тест" },
      clientNotifiedEvents: [],
      status: "SCHEDULED",
      order: {
        id: "order-id-1",
        number: 100,
        userId: "u1",
        config: { service: { title: "Уборка" } },
        addressSnapshot: { street: "Пушкина", building: "10" },
        locale: "ru",
      },
    });
    userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
    const v = {
      id,
      scheduledAt,
      clientNotifiedEvents: [] as string[],
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

  it("отправляет напоминание за 2 часа", async () => {
    const now = ACTIVE_TIME;
    const scheduledAt = new Date(now.getTime() + 2 * 3600_000);
    make2hVisit("v2h1", scheduledAt);

    const count = await sendVisit2hReminders(now);

    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("2 час");
  });

  it("не отправляет в тихое время", async () => {
    const scheduledAt = new Date(QUIET_TIME.getTime() + 2 * 3600_000);
    make2hVisit("v2h2", scheduledAt);

    const count = await sendVisit2hReminders(QUIET_TIME);

    expect(count).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("идемпотентность — повторный вызов не дублирует", async () => {
    const now = ACTIVE_TIME;
    const scheduledAt = new Date(now.getTime() + 2 * 3600_000);
    make2hVisit("v2h3", scheduledAt);

    await sendVisit2hReminders(now);
    await sendVisit2hReminders(now);

    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("не отправляет отменённому визиту", async () => {
    const now = ACTIVE_TIME;
    const scheduledAt = new Date(now.getTime() + 2 * 3600_000);
    const v = make2hVisit("v2h4", scheduledAt);
    visitStore.set("v2h4", { ...visitStore.get("v2h4")!, status: "CANCELLED" });
    visitFindManyResult = [{ ...v, status: "CANCELLED" }];

    const count = await sendVisit2hReminders(now);

    expect(count).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// notifyClientMasterOnWay

describe("notifyClientMasterOnWay", () => {
  it("отправляет уведомление с именем мастера и временем", async () => {
    makeVisit("v-onway");
    makeUser("u1", "telegram");
    await notifyClientMasterOnWay("v-onway", 30);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Иван Петров");
    expect(text).toContain("30");
  });

  it("идемпотентность — повторный вызов не дублирует уведомление", async () => {
    makeVisit("v-onway2");
    makeUser("u1", "telegram");
    await notifyClientMasterOnWay("v-onway2", 30);
    await notifyClientMasterOnWay("v-onway2", 30);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("fallback на email если нет Telegram", async () => {
    makeVisit("v-onway3");
    makeUser("u1", "email");
    await notifyClientMasterOnWay("v-onway3", 45);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail)).toHaveBeenCalledOnce();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-45: напоминание за 2 часа — утренние визиты после тихого периода

describe("BUG-45: sendVisit2hReminders — утренние визиты после тихого периода", () => {
  // 09:00 Ереван = 05:00 UTC — первая минута вне тихого периода
  const NOW_0900 = new Date("2026-09-29T05:00:00Z");

  function make2hMorningVisit(id: string, minutesAhead: number) {
    const scheduledAt = new Date(NOW_0900.getTime() + minutesAhead * 60_000);
    visitStore.set(id, {
      id,
      scheduledAt,
      masterId: "master-1",
      master: { name: "Мастер Тест" },
      clientNotifiedEvents: [],
      status: "SCHEDULED",
      order: {
        id: "order-id-1",
        number: 100,
        userId: "u1",
        config: { service: { title: "Уборка" } },
        addressSnapshot: { street: "Пушкина", building: "10" },
        locale: "ru",
      },
    });
    userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
    visitFindManyResult = [
      {
        id,
        scheduledAt,
        clientNotifiedEvents: [] as string[],
        order: {
          number: 100,
          config: { service: { title: "Уборка" } },
          addressSnapshot: { street: "Пушкина", building: "10" },
          locale: "ru",
          userId: "u1",
          user: { id: "u1", telegramId: "tg-123", email: null, emailUnsubscribedAt: null },
        },
        master: { name: "Мастер Тест" },
      },
    ];
    return scheduledAt;
  }

  it("окно запроса начинается с now+20 мин, а не с now+90 мин", async () => {
    make2hMorningVisit("v-window-check", 30);
    await sendVisit2hReminders(NOW_0900);
    const arg = vi.mocked(db.visit.findMany).mock.calls[0][0] as {
      where: { scheduledAt: { gte: Date; lte: Date } };
    };
    expect(arg.where.scheduledAt.gte.getTime()).toBe(NOW_0900.getTime() + 20 * 60_000);
    expect(arg.where.scheduledAt.lte.getTime()).toBe(NOW_0900.getTime() + 150 * 60_000);
  });

  it("визит в 09:30 — напоминание отправляется сразу после тихого периода", async () => {
    make2hMorningVisit("v-0930", 30);
    const count = await sendVisit2hReminders(NOW_0900);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("визит в 10:00 — напоминание отправляется сразу после тихого периода", async () => {
    make2hMorningVisit("v-1000", 60);
    const count = await sendVisit2hReminders(NOW_0900);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("визит в 10:30 — напоминание отправляется (граница старого окна)", async () => {
    make2hMorningVisit("v-1030", 90);
    const count = await sendVisit2hReminders(NOW_0900);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("визит в 11:00 — напоминание отправляется (стандартное окно ~2 часа)", async () => {
    make2hMorningVisit("v-1100", 120);
    const count = await sendVisit2hReminders(NOW_0900);
    expect(count).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-45: просьба об отзыве не уходит, если отзыв уже оставлен

describe("BUG-45: sendReviewRequests — не отправлять при наличии отзыва", () => {
  it("запрос к базе включает фильтр review: null", async () => {
    makeReviewVisit("v-review-filter");
    await sendReviewRequests(ACTIVE_TIME);
    const arg = vi.mocked(db.visit.findMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where.review).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BUG-45: двойное экранирование & в sendVisit2hReminders

describe("BUG-45: sendVisit2hReminders — & не экранируется дважды", () => {
  it("услуга с & приходит как &amp; а не &amp;amp;", async () => {
    const now = new Date("2026-09-29T05:00:00Z"); // 09:00 Ереван
    const scheduledAt = new Date(now.getTime() + 120 * 60_000); // 11:00 — стандартное окно
    visitStore.set("v-amp-2h", {
      id: "v-amp-2h",
      scheduledAt,
      masterId: "master-1",
      master: { name: "Мастер Тест" },
      clientNotifiedEvents: [],
      status: "SCHEDULED",
      order: {
        id: "order-id-1",
        number: 200,
        userId: "u1",
        config: { service: { title: "Кухня & ванная" } },
        addressSnapshot: { street: "Пушкина", building: "10" },
        locale: "ru",
      },
    });
    userStore.set("u1", { telegramId: "tg-123", email: null, name: "Тест" });
    visitFindManyResult = [
      {
        id: "v-amp-2h",
        scheduledAt,
        clientNotifiedEvents: [] as string[],
        order: {
          number: 200,
          config: { service: { title: "Кухня & ванная" } },
          addressSnapshot: { street: "Пушкина", building: "10" },
          locale: "ru",
          userId: "u1",
          user: { id: "u1", telegramId: "tg-123", email: null, emailUnsubscribedAt: null },
        },
        master: { name: "Мастер Тест" },
      },
    ];

    await sendVisit2hReminders(now);

    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Кухня &amp; ванная");
    expect(text).not.toContain("&amp;amp;");
  });
});
