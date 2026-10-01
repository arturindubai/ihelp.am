import { describe, it, expect, vi, type Mock } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    service: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { db } from "../db";
import { searchServices } from "./search";

const makeService = (overrides: Record<string, unknown> = {}) => ({
  id: "svc1",
  slug: "cleaning",
  title: { ru: "Уборка", en: "Cleaning" },
  subtitle: { ru: "Быстрая уборка квартиры", en: "Quick apartment cleaning" },
  description: { ru: "Профессиональная уборка", en: "Professional cleaning" },
  comingSoon: false,
  sort: 0,
  active: true,
  category: { slug: "home", title: { ru: "Дом", en: "Home" } },
  groups: [{ options: [{ price: 5000 }, { price: 8000 }] }],
  ...overrides,
});

describe("searchServices", () => {
  it("возвращает [] при запросе короче двух символов", async () => {
    expect(await searchServices("", "ru")).toEqual([]);
    expect(await searchServices("у", "ru")).toEqual([]);
    const call = (db.service.findMany as Mock).mock.calls.length;
    expect(call).toBe(0);
  });

  it("ищет по названию услуги", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("уборк", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("cleaning");
  });

  it("ищет по описанию (description)", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("профессиональная", "ru");
    expect(results).toHaveLength(1);
  });

  it("ищет по названию категории", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("дом", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].categorySlug).toBe("home");
  });

  it("ищет по английскому тексту при locale=en", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("cleaning", "en");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Cleaning");
  });

  it("не находит по другому запросу", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("ремонт", "ru");
    expect(results).toEqual([]);
  });

  it("возвращает минимальную цену из опций", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    const results = await searchServices("уборк", "ru");
    expect(results[0].price).toBe(5000);
  });

  it("возвращает price=null если нет опций с ценой", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ groups: [{ options: [{ price: 0 }] }] }),
    ]);
    const results = await searchServices("уборк", "ru");
    expect(results[0].price).toBeNull();
  });

  it("comingSoon-услуга включена в результат с флагом и href=/s/<slug>", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ comingSoon: true }),
    ]);
    const results = await searchServices("уборк", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].comingSoon).toBe(true);
    expect(results[0].href).toBe("/s/cleaning");
  });

  it("ограничивает результаты до 8", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeService({ id: `s${i}`, slug: `svc-${i}`, title: { ru: `Услуга ${i}`, en: `Service ${i}` } })
    );
    (db.service.findMany as Mock).mockResolvedValueOnce(many);
    const results = await searchServices("услуга", "ru");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("передаёт фильтр active:true и category.archived:false в запрос к DB", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([]);
    await searchServices("тест", "ru");
    const call = (db.service.findMany as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where?.active).toBe(true);
    expect(call?.where?.category).toMatchObject({ archived: false });
  });
});
