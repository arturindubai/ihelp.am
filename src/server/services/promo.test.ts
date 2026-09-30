import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    promoCode: { findUnique: vi.fn() },
    promoRedemption: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import { checkPromo } from "./promo";
import { db } from "../db";

const BASE_PROMO = {
  id: "p1",
  code: "TEST",
  active: true,
  validFrom: null,
  validTo: null,
  usageLimit: null,
  usedCount: 0,
  serviceIds: [],
  planKinds: [],
  firstOrderOnly: false,
  minOrder: null,
  forPhone: null,
  forEmail: null,
  perUserLimit: 3,
  type: "PERCENT",
  value: 10,
  maxDiscount: null,
  stackable: false,
};

const BASE_OPTS = {
  code: "TEST",
  userId: "u1",
  phone: "+37412345678",
  email: "user@example.com",
  serviceId: "s1",
  planKind: "ONE_TIME" as const,
  amount: 10000,
  isFirstOrder: false,
};

describe("checkPromo — персональные промокоды", () => {
  beforeEach(() => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue(BASE_PROMO as never);
    vi.mocked(db.promoRedemption.count).mockResolvedValue(0);
  });

  it("без привязки — промокод работает для любого клиента", async () => {
    const r = await checkPromo(BASE_OPTS);
    expect(r.ok).toBe(true);
  });

  it("forPhone совпадает — промокод работает", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37412345678" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r.ok).toBe(true);
  });

  it("forPhone не совпадает — not_found (чужой клиент)", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37499999999" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("forEmail совпадает — промокод работает", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forEmail: "user@example.com" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r.ok).toBe(true);
  });

  it("forEmail не совпадает — not_found (чужой клиент)", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forEmail: "other@example.com" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("forEmail задан, email не подтверждён (null передан caller-ом) — not_found", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forEmail: "user@example.com" } as never);
    const r = await checkPromo({ ...BASE_OPTS, email: null });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("forPhone задан, телефон не передан (null) — not_found", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37412345678" } as never);
    const r = await checkPromo({ ...BASE_OPTS, phone: null });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("forPhone и forEmail — оба совпадают — промокод работает (AND-логика)", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37412345678", forEmail: "user@example.com" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r.ok).toBe(true);
  });

  it("forPhone и forEmail — phone совпадает, email не совпадает — not_found (AND-логика)", async () => {
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37412345678", forEmail: "other@example.com" } as never);
    const r = await checkPromo(BASE_OPTS);
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("персональная проверка срабатывает до проверки срока действия — чужой клиент видит not_found, а не expired", async () => {
    const past = new Date(Date.now() - 86400_000);
    vi.mocked(db.promoCode.findUnique).mockResolvedValue({ ...BASE_PROMO, forPhone: "+37499999999", validTo: past } as never);
    const r = await checkPromo(BASE_OPTS);
    // Чужому клиенту возвращается not_found, а не expired — не раскрываем факт существования кода
    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});
