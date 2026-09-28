import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  db: {
    category: { findMany: vi.fn().mockResolvedValue([]) },
    banner: { findMany: vi.fn().mockResolvedValue([]) },
    service: { findMany: vi.fn().mockResolvedValue([]) },
    siteFeature: { findMany: vi.fn().mockResolvedValue([]) },
    siteFaq: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { getHome } from "./catalog";

describe("getHome", () => {
  it("при отсутствии одобренных отзывов возвращает пустой список reviews", async () => {
    const result = await getHome("ru");
    expect(result.reviews).toEqual([]);
  });
});
