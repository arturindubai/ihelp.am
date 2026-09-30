import { describe, it, expect, vi, type Mock } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    category: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    banner: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn().mockResolvedValue({}) },
    service: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    siteFeature: { findMany: vi.fn().mockResolvedValue([]) },
    siteFaq: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { db } from "../db";
import { getHome, getCategories, getCategory, loadServiceRaw } from "./catalog";

describe("getHome", () => {
  it("при отсутствии одобренных отзывов возвращает пустой список reviews", async () => {
    const result = await getHome("ru");
    expect(result.reviews).toEqual([]);
  });

  it("запрашивает категории с archived:false", async () => {
    await getHome("ru");
    const call = (db.category.findMany as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where).toMatchObject({ archived: false });
  });

  it("запрашивает услуги с category.archived:false", async () => {
    await getHome("ru");
    const call = (db.service.findMany as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where?.category).toMatchObject({ archived: false });
  });
});

describe("getCategories", () => {
  it("запрашивает категории с archived:false", async () => {
    await getCategories("ru");
    const call = (db.category.findMany as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where).toMatchObject({ archived: false });
  });
});

describe("getCategory", () => {
  it("ищет категорию с archived:false — архивная не найдена", async () => {
    (db.category.findFirst as Mock).mockResolvedValueOnce(null);
    const result = await getCategory("cleaning", "ru");
    expect(result).toBeNull();
    const call = (db.category.findFirst as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where).toMatchObject({ archived: false });
  });
});

describe("getHome — href для comingSoon-категорий", () => {
  it("comingSoon-категория получает href=/c/<slug>", async () => {
    (db.category.findMany as Mock).mockResolvedValueOnce([
      { id: "1", slug: "chef", title: { ru: "Повар" }, image: null, sort: 1, active: true, comingSoon: true, archived: false, services: [] },
    ]);
    const result = await getHome("ru");
    expect(result.categories[0].href).toBe("/c/chef");
  });

  it("обычная категория с одной услугой → href=/s/<slug>", async () => {
    (db.category.findMany as Mock).mockResolvedValueOnce([
      { id: "2", slug: "cleaning", title: { ru: "Уборка" }, image: null, sort: 1, active: true, comingSoon: false, archived: false, services: [{ slug: "regular-clean", title: { ru: "Регулярная уборка" }, subtitle: null, image: null }] },
    ]);
    const result = await getHome("ru");
    expect(result.categories[0].href).toBe("/s/regular-clean");
  });

  it("comingSoon-услуги не попадают в popular-список", async () => {
    (db.service.findMany as Mock).mockResolvedValueOnce([
      { slug: "regular-clean", title: { ru: "Уборка" }, subtitle: null, image: null, rating: 0, reviewsCount: 0, comingSoon: false, groups: [], plans: [] },
      { slug: "chef-special", title: { ru: "Повар" }, subtitle: null, image: null, rating: 0, reviewsCount: 0, comingSoon: true, groups: [], plans: [] },
    ]);
    const result = await getHome("ru");
    expect(result.services.map((s) => s.slug)).not.toContain("chef-special");
    expect(result.services.map((s) => s.slug)).toContain("regular-clean");
  });
});

describe("loadServiceRaw", () => {
  it("запрашивает услугу с category.archived:false", async () => {
    await loadServiceRaw("deep-clean");
    const call = (db.service.findFirst as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where?.category).toMatchObject({ archived: false });
  });
});

describe("getHome — счётчики показов карусели", () => {
  const carouselBanner = {
    id: "b1",
    title: { ru: "Акция" },
    subtitle: null,
    image: null,
    link: null,
    bg: null,
    promoCode: null,
    placement: "CAROUSEL_HOME",
    active: true,
    startsAt: null,
    endsAt: null,
    audience: "ALL",
    segment: "ALL",
    sort: 0,
    views: 0,
    clicks: 0,
  };

  it("вызывает updateMany для показанных баннеров карусели", async () => {
    (db.banner.findMany as Mock).mockResolvedValueOnce([carouselBanner]);
    (db.banner.updateMany as Mock).mockClear();
    await getHome("ru");
    expect(db.banner.updateMany as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["b1"] } }, data: { views: { increment: 1 } } }),
    );
  });

  it("не вызывает updateMany если нет баннеров для карусели", async () => {
    (db.banner.findMany as Mock).mockResolvedValueOnce([]);
    (db.banner.updateMany as Mock).mockClear();
    await getHome("ru");
    expect(db.banner.updateMany as Mock).not.toHaveBeenCalled();
  });

  it("не считает показы для неактивного баннера карусели", async () => {
    (db.banner.findMany as Mock).mockResolvedValueOnce([{ ...carouselBanner, active: false }]);
    (db.banner.updateMany as Mock).mockClear();
    await getHome("ru");
    expect(db.banner.updateMany as Mock).not.toHaveBeenCalled();
  });
});
