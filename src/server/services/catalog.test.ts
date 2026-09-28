import { describe, it, expect, vi } from "vitest";

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    category: { findMany: vi.fn().mockResolvedValue([]), findFirst: mockFindFirst },
    banner: { findMany: vi.fn().mockResolvedValue([]) },
    service: { findMany: vi.fn().mockResolvedValue([]) },
    siteFeature: { findMany: vi.fn().mockResolvedValue([]) },
    siteFaq: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { getHome, getCategory } from "./catalog";

describe("getHome", () => {
  it("при отсутствии одобренных отзывов возвращает пустой список reviews", async () => {
    const result = await getHome("ru");
    expect(result.reviews).toEqual([]);
  });
});

function makeService(slug: string, planKinds: string[]) {
  return {
    slug,
    title: { ru: slug },
    subtitle: null,
    image: null,
    rating: 0,
    reviewsCount: 0,
    groups: [],
    plans: planKinds.map((kind) => ({ kind, discountPercent: 0 })),
  };
}

describe("getCategory — formats", () => {
  it("возвращает showFormats=false и пустые formats при отсутствии планов", async () => {
    mockFindFirst.mockResolvedValue({
      slug: "cleaning",
      title: { ru: "Уборка" },
      description: null,
      comingSoon: false,
      showFormats: false,
      services: [makeService("s1", [])],
    });
    const c = await getCategory("cleaning", "ru");
    expect(c?.showFormats).toBe(false);
    expect(c?.formats).toEqual([]);
  });

  it("собирает форматы по plan.kind и берёт slug первой услуги", async () => {
    mockFindFirst.mockResolvedValue({
      slug: "cleaning",
      title: { ru: "Уборка" },
      description: null,
      comingSoon: false,
      showFormats: true,
      services: [
        makeService("svc-once", ["ONE_TIME"]),
        makeService("svc-sub", ["SUBSCRIPTION", "ONE_TIME"]),
        makeService("svc-pack", ["PACKAGE"]),
      ],
    });
    const c = await getCategory("cleaning", "ru");
    expect(c?.showFormats).toBe(true);
    const kinds = c?.formats.map((f) => f.kind).sort();
    expect(kinds).toEqual(["ONE_TIME", "PACKAGE", "SUBSCRIPTION"]);
    const once = c?.formats.find((f) => f.kind === "ONE_TIME");
    // первая услуга с ONE_TIME — svc-once
    expect(once?.serviceSlug).toBe("svc-once");
    const sub = c?.formats.find((f) => f.kind === "SUBSCRIPTION");
    // первая услуга с SUBSCRIPTION — svc-sub
    expect(sub?.serviceSlug).toBe("svc-sub");
  });

  it("возвращает null при несуществующей категории", async () => {
    mockFindFirst.mockResolvedValue(null);
    const c = await getCategory("nonexistent", "ru");
    expect(c).toBeNull();
  });
});
