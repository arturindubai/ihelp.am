import { describe, it, expect, vi, type Mock } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    service: { findMany: vi.fn().mockResolvedValue([]) },
    category: { findMany: vi.fn().mockResolvedValue([]) },
    searchQuery: { upsert: vi.fn().mockResolvedValue(null) },
  },
}));

import { db } from "../db";
import { searchServices, logEmptySearch } from "./search";

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
  // isDuration: true — только такие группы должны влиять на цену
  groups: [{ options: [{ price: 5000 }, { price: 8000 }] }],
  ...overrides,
});

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  slug: "massage",
  title: { ru: "Массаж на дом", en: "Home massage" },
  description: { ru: "Профессиональный массаж", en: "Professional massage" },
  comingSoon: true,
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
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("уборк", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("cleaning");
  });

  it("ищет по описанию (description)", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("профессиональная", "ru");
    expect(results).toHaveLength(1);
  });

  it("ищет по названию категории", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("дом", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].categorySlug).toBe("home");
  });

  it("ищет по английскому тексту при locale=en", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("cleaning", "en");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Cleaning");
  });

  it("не находит по другому запросу (нет ни услуги, ни категории)", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("ремонт", "ru");
    expect(results).toEqual([]);
  });

  it("возвращает минимальную цену из опций (только isDuration-группы)", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([makeService()]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("уборк", "ru");
    expect(results[0].price).toBe(5000);
  });

  it("возвращает price=null если нет опций с ценой", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ groups: [{ options: [{ price: 0 }] }] }),
    ]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("уборк", "ru");
    expect(results[0].price).toBeNull();
  });

  it("цена берётся только из isDuration-групп (доплаты не влияют на min)", async () => {
    // Имитируем: isDuration-группа (price: 9000) и addon-группа (price: 1000)
    // Поскольку запрос к DB фильтрует isDuration:true, нам в тест прилетит только isDuration-группа
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ groups: [{ options: [{ price: 9000 }, { price: 12000 }] }] }),
    ]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("уборк", "ru");
    expect(results[0].price).toBe(9000);
  });

  it("comingSoon-услуга включена в результат с флагом и href=/s/<slug>", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ comingSoon: true }),
    ]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("уборк", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].comingSoon).toBe(true);
    expect(results[0].href).toBe("/s/cleaning");
  });

  it("находит категорию comingSoon если нет услуги по запросу", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([]);
    (db.category.findMany as Mock).mockResolvedValueOnce([makeCategory()]);
    const results = await searchServices("массаж", "ru");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("massage");
    expect(results[0].comingSoon).toBe(true);
    expect(results[0].href).toBe("/c/massage");
    expect(results[0].price).toBeNull();
  });

  it("не дублирует категорию если услуга из той же категории уже найдена", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      makeService({ category: { slug: "home", title: { ru: "Дом", en: "Home" } } }),
    ]);
    // Категория с тем же slug что и в услуге — не должна дублироваться
    (db.category.findMany as Mock).mockResolvedValueOnce([
      makeCategory({ slug: "home", title: { ru: "Дом", en: "Home" }, comingSoon: false }),
    ]);
    const results = await searchServices("дом", "ru");
    // Только услуга, категория не добавляется (slug "home" уже покрыт)
    expect(results.filter((r) => r.slug === "home")).toHaveLength(0);
    expect(results.filter((r) => r.slug === "cleaning")).toHaveLength(1);
  });

  it("ограничивает суммарные результаты до 8", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeService({ id: `s${i}`, slug: `svc-${i}`, title: { ru: `Услуга ${i}`, en: `Service ${i}` } })
    );
    (db.service.findMany as Mock).mockResolvedValueOnce(many);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    const results = await searchServices("услуга", "ru");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("передаёт фильтр active:true, category.archived:false и isDuration:true в запрос к DB", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([]);
    (db.category.findMany as Mock).mockResolvedValueOnce([]);
    await searchServices("тест", "ru");
    const call = (db.service.findMany as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where?.active).toBe(true);
    expect(call?.where?.category).toMatchObject({ archived: false });
    expect(call?.include?.groups?.where).toMatchObject({ isDuration: true });
  });
});

describe("logEmptySearch", () => {
  it("вызывает upsert для запроса длиной >= 2", async () => {
    (db.searchQuery.upsert as Mock).mockClear();
    await logEmptySearch("массаж", "ru");
    expect(db.searchQuery.upsert as Mock).toHaveBeenCalledOnce();
    const call = (db.searchQuery.upsert as Mock).mock.calls[0][0];
    expect(call.where.query_locale).toEqual({ query: "массаж", locale: "ru" });
  });

  it("не вызывает upsert для запроса короче 2 символов", async () => {
    (db.searchQuery.upsert as Mock).mockClear();
    await logEmptySearch("м", "ru");
    expect(db.searchQuery.upsert as Mock).not.toHaveBeenCalled();
  });
});
