import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Хранилище AI-запросов в памяти для тестов
const aiStore = new Map<
  string,
  {
    id: string;
    kind: string;
    input: unknown;
    output: unknown;
    status: string;
    error: string | null;
    tokens: number;
    requestedBy: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }
>();

let nextId = 1;
function makeId() {
  return `req-${nextId++}`;
}

vi.mock("../db", () => ({
  db: {
    aiRequest: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const id = makeId();
        const rec = {
          id,
          kind: data.kind as string,
          input: data.input,
          output: null,
          status: (data.status as string) ?? "queued",
          error: null,
          tokens: 0,
          requestedBy: (data.requestedBy as string) ?? null,
          createdAt: new Date(),
          startedAt: null,
          finishedAt: null,
        };
        aiStore.set(id, rec);
        return Promise.resolve(rec);
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(aiStore.get(where.id) ?? null),
      ),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { status: string } }) => {
        const found = [...aiStore.values()].find((r) => r.status === where.status);
        return Promise.resolve(found ?? null);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const rec = aiStore.get(where.id);
        if (!rec) throw new Error("not found");
        const updated = { ...rec, ...data };
        aiStore.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      aggregate: vi.fn().mockImplementation(({ where }: { where?: { createdAt?: { gte?: Date } } }) => {
        const items = [...aiStore.values()].filter((r) => {
          if (where?.createdAt?.gte) return r.createdAt >= where.createdAt.gte;
          return true;
        });
        const sum = items.reduce((acc, r) => acc + r.tokens, 0);
        return Promise.resolve({ _sum: { tokens: sum } });
      }),
    },
  },
}));

vi.mock("../admin", () => ({
  requireSection: vi.fn().mockResolvedValue({ id: "user-1", role: "ADMIN" }),
}));

vi.mock("../alerts", () => ({
  alertTech: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../notify", () => ({
  html: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ""), ""),
  ),
}));

import { enqueue, get, cancel, getMonthTokens, popQueued, markRunning, markDone, markFailed, sumMonthTokens } from "./aiQueue";

beforeEach(() => {
  aiStore.clear();
  nextId = 1;
});

describe("enqueue", () => {
  it("создаёт запрос со статусом queued", async () => {
    const req = await enqueue("echo", { text: "hello" });
    expect(req.status).toBe("queued");
    expect(req.kind).toBe("echo");
    expect(req.requestedBy).toBe("user-1");
  });

  it("сохраняет input", async () => {
    const req = await enqueue("echo", { text: "test", extra: 42 });
    expect(req.input).toEqual({ text: "test", extra: 42 });
  });
});

describe("get", () => {
  it("возвращает существующий запрос", async () => {
    const created = await enqueue("echo", { text: "hi" });
    const found = await get(created.id);
    expect(found?.id).toBe(created.id);
  });

  it("возвращает null для несуществующего id", async () => {
    const found = await get("nonexistent-id");
    expect(found).toBeNull();
  });
});

describe("cancel", () => {
  it("отменяет queued-запрос", async () => {
    const req = await enqueue("echo", { text: "cancel me" });
    const cancelled = await cancel(req.id);
    expect(cancelled.status).toBe("failed");
    expect(cancelled.error).toContain("Отменено");
  });

  it("выбрасывает not_queued при отмене running-запроса", async () => {
    const req = await enqueue("echo", { text: "running" });
    await markRunning(req.id);
    await expect(cancel(req.id)).rejects.toThrow("not_queued");
  });

  it("выбрасывает not_found для несуществующего запроса", async () => {
    await expect(cancel("no-such-id")).rejects.toThrow("not_found");
  });
});

describe("popQueued", () => {
  it("возвращает null при пустой очереди", async () => {
    const req = await popQueued();
    expect(req).toBeNull();
  });

  it("возвращает первый queued-запрос", async () => {
    await enqueue("echo", { text: "first" });
    await enqueue("echo", { text: "second" });
    const req = await popQueued();
    expect(req?.kind).toBe("echo");
  });
});

describe("markRunning / markDone / markFailed", () => {
  it("markRunning переводит статус в running", async () => {
    const req = await enqueue("echo", { text: "go" });
    const updated = await markRunning(req.id);
    expect(updated.status).toBe("running");
    expect(updated.startedAt).toBeInstanceOf(Date);
  });

  it("markDone записывает output и tokens", async () => {
    const req = await enqueue("echo", { text: "go" });
    await markRunning(req.id);
    const done = await markDone(req.id, { output: "go" }, 150);
    expect(done.status).toBe("done");
    expect(done.tokens).toBe(150);
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it("markFailed записывает ошибку", async () => {
    const req = await enqueue("echo", { text: "boom" });
    const failed = await markFailed(req.id, "Ошибка выполнения");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Ошибка выполнения");
  });
});

describe("sumMonthTokens / getMonthTokens", () => {
  it("возвращает 0 при пустой очереди", async () => {
    const sum = await sumMonthTokens();
    expect(sum).toBe(0);
  });

  it("суммирует tokens выполненных запросов", async () => {
    const r1 = await enqueue("echo", { text: "a" });
    const r2 = await enqueue("echo", { text: "b" });
    await markDone(r1.id, { output: "a" }, 100);
    await markDone(r2.id, { output: "b" }, 250);
    const sum = await sumMonthTokens();
    expect(sum).toBe(350);
  });

  it("getMonthTokens проверяет права и возвращает ту же сумму", async () => {
    const r = await enqueue("echo", { text: "x" });
    await markDone(r.id, { output: "x" }, 77);
    const sum = await getMonthTokens();
    expect(sum).toBe(77);
  });
});
