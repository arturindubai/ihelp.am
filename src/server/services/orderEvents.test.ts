import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type EventRow = { id: string; visitId: string; orderId: string; status: string; actor: string; createdAt: Date };

const eventStore: EventRow[] = [];

vi.mock("../db", () => ({
  db: {
    visitEvent: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { orderId?: string; visitId?: string } }) => {
        const filtered = eventStore.filter((e) => {
          if (where.orderId && e.orderId !== where.orderId) return false;
          if (where.visitId && e.visitId !== where.visitId) return false;
          return true;
        });
        return Promise.resolve([...filtered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
      }),
    },
  },
}));

import { getOrderEventFeed, getVisitEventFeed } from "./orderEvents";

const T0 = new Date("2026-09-30T10:00:00+04:00");
const T1 = new Date("2026-09-30T10:30:00+04:00");
const T2 = new Date("2026-09-30T11:00:00+04:00");

function seed() {
  eventStore.length = 0;
  eventStore.push(
    { id: "e1", visitId: "v1", orderId: "o1", status: "SCHEDULED", actor: "система", createdAt: T0 },
    { id: "e2", visitId: "v1", orderId: "o1", status: "ON_WAY", actor: "мастер Иван", createdAt: T1 },
    { id: "e3", visitId: "v1", orderId: "o1", status: "DONE", actor: "мастер Иван", createdAt: T2 },
    { id: "e4", visitId: "v2", orderId: "o1", status: "SCHEDULED", actor: "система", createdAt: T0 },
    { id: "e5", visitId: "v3", orderId: "o2", status: "SCHEDULED", actor: "система", createdAt: T0 },
  );
}

beforeEach(() => {
  seed();
});

describe("getOrderEventFeed", () => {
  it("возвращает все события заказа в хронологическом порядке", async () => {
    const feed = await getOrderEventFeed("o1");
    expect(feed).toHaveLength(4);
    expect(feed[0].id).toBe("e1");
  });

  it("не возвращает события чужого заказа", async () => {
    const feed = await getOrderEventFeed("o1");
    expect(feed.every((e) => e.orderId !== "o2")).toBe(true);
  });

  it("возвращает пустой массив если событий нет", async () => {
    const feed = await getOrderEventFeed("o-missing");
    expect(feed).toHaveLength(0);
  });
});

describe("getVisitEventFeed", () => {
  it("возвращает только события нужного визита", async () => {
    const feed = await getVisitEventFeed("v1");
    expect(feed).toHaveLength(3);
    expect(feed.every((e) => e.visitId === "v1")).toBe(true);
  });

  it("события отсортированы по времени: SCHEDULED → ON_WAY → DONE", async () => {
    const feed = await getVisitEventFeed("v1");
    expect(feed[0].status).toBe("SCHEDULED");
    expect(feed[1].status).toBe("ON_WAY");
    expect(feed[2].status).toBe("DONE");
  });
});
