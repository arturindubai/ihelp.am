import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Хранилище токенов в памяти
const tokenStore = new Map<
  string,
  {
    id: string;
    token: string;
    visitId: string;
    usedAt: Date | null;
    expiresAt: Date;
    visit: { id: string; order: { id: string; userId: string } };
  }
>();

const tokenByVisit = new Map<string, string>(); // visitId → token

vi.mock("../db", () => ({
  db: {
    reviewToken: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { token?: string; visitId?: string } }) => {
        if (where.token) return Promise.resolve(tokenStore.get(where.token) ?? null);
        if (where.visitId) {
          const token = tokenByVisit.get(where.visitId);
          return Promise.resolve(token ? tokenStore.get(token) ?? null : null);
        }
        return Promise.resolve(null);
      }),
      upsert: vi.fn().mockImplementation(
        ({ where, create }: { where: { visitId: string }; create: { token: string; visitId: string; expiresAt: Date } }) => {
          const old = tokenByVisit.get(where.visitId);
          if (old) tokenStore.delete(old);
          const rec = { id: `rt-${create.token}`, token: create.token, visitId: create.visitId, usedAt: null, expiresAt: create.expiresAt, visit: { id: create.visitId, order: { id: `order-${create.visitId}`, userId: `user-${create.visitId}` } } };
          tokenStore.set(create.token, rec);
          tokenByVisit.set(create.visitId, create.token);
          return Promise.resolve(rec);
        },
      ),
      update: vi.fn().mockImplementation(
        ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
          for (const [, rec] of tokenStore) {
            if (rec.id === where.id) {
              rec.usedAt = data.usedAt;
              break;
            }
          }
          return Promise.resolve(null);
        },
      ),
    },
    clientMessage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { createReviewToken, consumeReviewToken } from "./reviews";

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  tokenStore.clear();
  tokenByVisit.clear();
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────

describe("createReviewToken", () => {
  it("создаёт новый токен для визита", async () => {
    const token = await createReviewToken("visit-1");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("возвращает тот же токен при повторном вызове (идемпотентность)", async () => {
    const t1 = await createReviewToken("visit-2");
    const t2 = await createReviewToken("visit-2");
    expect(t1).toBe(t2);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("consumeReviewToken", () => {
  it("возвращает данные визита при первом использовании", async () => {
    const token = await createReviewToken("visit-3");
    const result = await consumeReviewToken(token);
    expect(result).not.toBeNull();
    expect(result!.visitId).toBe("visit-3");
  });

  it("повторное использование — null (ссылка одноразовая)", async () => {
    const token = await createReviewToken("visit-4");
    await consumeReviewToken(token);          // первый раз — ок
    const second = await consumeReviewToken(token); // второй раз — null
    expect(second).toBeNull();
  });

  it("чужой токен — null", async () => {
    const result = await consumeReviewToken("токен-которого-нет");
    expect(result).toBeNull();
  });

  it("истёкший токен — null", async () => {
    const token = await createReviewToken("visit-5");
    // Подменяем expiresAt в прошлое
    const rec = tokenStore.get(token)!;
    rec.expiresAt = PAST;
    const result = await consumeReviewToken(token);
    expect(result).toBeNull();
  });

  it("чужой визит: токен привязан к конкретному visitId", async () => {
    const tokenA = await createReviewToken("visit-A");
    const tokenB = await createReviewToken("visit-B");
    const resultA = await consumeReviewToken(tokenA);
    const resultB = await consumeReviewToken(tokenB);
    expect(resultA!.visitId).toBe("visit-A");
    expect(resultB!.visitId).toBe("visit-B");
    // Нельзя использовать токен A чтобы попасть на визит B
    expect(resultA!.visitId).not.toBe(resultB?.visitId);
  });
});
