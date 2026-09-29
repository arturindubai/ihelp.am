import { describe, it, expect, vi, type Mock } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    category: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    banner: { findMany: vi.fn().mockResolvedValue([]) },
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

describe("loadServiceRaw", () => {
  it("запрашивает услугу с category.archived:false", async () => {
    await loadServiceRaw("deep-clean");
    const call = (db.service.findFirst as Mock).mock.calls.at(-1)?.[0];
    expect(call?.where?.category).toMatchObject({ archived: false });
  });
});
