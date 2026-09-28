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
    status: string;
    order: { id: string; number: number; userId: string; config: unknown; addressSnapshot: unknown };
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
      findMany: vi.fn().mockImplementation(
        ({ where }: { where: { status?: { in?: string[] }; scheduledAt?: { gte?: Date; lte?: Date } } }) => {
          const statusFilter = where?.status?.in ?? null;
          const gte = where?.scheduledAt?.gte ?? null;
          const lte = where?.scheduledAt?.lte ?? null;
          const results = [...visitStore.values()].filter((v) => {
            if (statusFilter && !statusFilter.includes(v.status)) return false;
            if (gte && v.scheduledAt && v.scheduledAt < gte) return false;
            if (lte && v.scheduledAt && v.scheduledAt > lte) return false;
            return true;
          });
          return Promise.resolve(results);
        },
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
    notify: { telegramBotToken: "tg-token-client" },
    brand: { name: "iHelp" },
    mail: { enabled: true },
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
    status: "SCHEDULED",
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

  it("completed — текст содержит имя мастера и ссылку на заказ по id", async () => {
    makeVisit("v1");
    makeUser("u1", "telegram");
    await notifyClientVisitCompleted("v1");
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Иван Петров");
    expect(text).toContain("/account/orders/order-id-1");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// sendVisitReminders

describe("sendVisitReminders", () => {
  const now = new Date("2026-09-28T10:00:00Z");

  it("отправляет reminder24h визиту через 24 часа", async () => {
    const scheduledAt = new Date(now.getTime() + 24 * 3_600_000); // ровно +24ч — в окне 22–26ч
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(now);

    expect(result.sent).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("завтра");
  });

  it("отправляет reminder2h визиту через 2 часа", async () => {
    const scheduledAt = new Date(now.getTime() + 2 * 3_600_000); // +2ч — в окне 1.5–2.5ч
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(now);

    expect(result.sent).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("2 час");
  });

  it("не отправляет повторное напоминание (идемпотентность)", async () => {
    const scheduledAt = new Date(now.getTime() + 24 * 3_600_000);
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    await sendVisitReminders(now);
    await sendVisitReminders(now);

    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  it("не отправляет напоминание отменённому визиту", async () => {
    const scheduledAt = new Date(now.getTime() + 24 * 3_600_000);
    makeVisit("v1", { scheduledAt, status: "CANCELLED" });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(now);

    expect(result.sent).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("не отправляет напоминание визиту вне окна (через 30 часов)", async () => {
    const scheduledAt = new Date(now.getTime() + 30 * 3_600_000); // +30ч — вне любых окон
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(now);

    expect(result.sent).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("текст reminder24h содержит название услуги, дату и адрес", async () => {
    const scheduledAt = new Date(now.getTime() + 24 * 3_600_000);
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    await sendVisitReminders(now);

    const text = vi.mocked(sendTelegramDirect).mock.calls[0][2];
    expect(text).toContain("Уборка");
    expect(text).toContain("Пушкина");
    expect(text).toContain("Иван Петров");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Тихий период

describe("тихий период (QUIET_HOURS_START/QUIET_HOURS_END)", () => {
  // Ереван UTC+4: тихое время 21:00–09:00
  // Чтобы получить ереванский час H: now = UTC (H-4)
  // Тихо: UTC 17:00 = Ереван 21:00
  // Активно: UTC 05:00 = Ереван 09:00 (граница — уже не тихо)

  it("в тихое время (Ереван 22:00) ничего не отправляет", async () => {
    const quietNow = new Date("2026-09-28T18:00:00Z"); // Ереван 22:00
    const scheduledAt = new Date(quietNow.getTime() + 24 * 3_600_000);
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(quietNow);

    expect(result.sent).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("в тихое время (Ереван 01:00) ничего не отправляет", async () => {
    const quietNow = new Date("2026-09-28T21:00:00Z"); // Ереван 01:00 (следующие сутки)
    const scheduledAt = new Date(quietNow.getTime() + 2 * 3_600_000);
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(quietNow);

    expect(result.sent).toBe(0);
    expect(vi.mocked(sendTelegramDirect)).not.toHaveBeenCalled();
  });

  it("ровно в 09:00 по Еревану (граница) — уже активное время, отправляет", async () => {
    const activeNow = new Date("2026-09-28T05:00:00Z"); // Ереван 09:00
    // Визит через 26ч = Ереван 11:00 следующего дня: 2h-окно (08:30–09:30) не целиком тихое
    const scheduledAt = new Date(activeNow.getTime() + 26 * 3_600_000);
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(activeNow);

    expect(result.sent).toBe(1);
    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledOnce();
  });

  // Визит в Ереване 10:00 (UTC 06:00 следующего дня):
  // — now = UTC 06:00 (Ереван 10:00) — активное время
  // — визит ровно через 24ч → в окне 22–26ч
  // — 2h-окно визита: 07:30–08:30 Ереван → целиком тихое
  // → 2h-напоминание должно уйти вместе с 24h
  it("визит в 10:00 по Еревану: reminder2h отправляется вместе с reminder24h", async () => {
    const activeNow = new Date("2026-09-28T06:00:00Z"); // Ереван 10:00
    const scheduledAt = new Date("2026-09-29T06:00:00Z"); // Ереван 10:00 следующего дня
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(activeNow);

    expect(result.sent).toBe(2);
    const calls = vi.mocked(sendTelegramDirect).mock.calls;
    expect(calls).toHaveLength(2);
    const texts = calls.map((c) => c[2] as string);
    expect(texts.some((t) => t.includes("завтра"))).toBe(true);
    expect(texts.some((t) => t.includes("2 час"))).toBe(true);
  });

  // Визит в Ереване 11:00 (UTC 07:00 следующего дня):
  // — 2h-окно: 08:30–09:30 Ереван, граница 09:00 уже активна
  // → в 09:00 нормальный крон поймает 2h-окно; специальной ранней отправки не нужно
  it("визит в 11:00 по Еревану: reminder2h НЕ отправляется вместе с reminder24h", async () => {
    const activeNow = new Date("2026-09-28T06:00:00Z"); // Ереван 10:00
    const scheduledAt = new Date("2026-09-29T07:00:00Z"); // Ереван 11:00 следующего дня, 25ч вперёд
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    const result = await sendVisitReminders(activeNow);

    expect(result.sent).toBe(1); // только 24h
    const texts = vi.mocked(sendTelegramDirect).mock.calls.map((c) => c[2] as string);
    expect(texts.some((t) => t.includes("завтра"))).toBe(true);
    expect(texts.some((t) => t.includes("2 час"))).toBe(false);
  });

  it("повторный вызов не дублирует 2h-напоминание для утреннего визита", async () => {
    const activeNow = new Date("2026-09-28T06:00:00Z");
    const scheduledAt = new Date("2026-09-29T06:00:00Z");
    makeVisit("v1", { scheduledAt });
    makeUser("u1", "telegram");

    await sendVisitReminders(activeNow);
    await sendVisitReminders(activeNow);

    expect(vi.mocked(sendTelegramDirect)).toHaveBeenCalledTimes(2); // 24h + 2h, не 4
  });
});
