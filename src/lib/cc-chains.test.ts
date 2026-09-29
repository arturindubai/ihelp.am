import { describe, it, expect } from "vitest";
import { waitingDeps, depChains, type DepInfo } from "./cc-chains";

function makeMap(deps: (Partial<DepInfo> & { key: string })[]): Map<string, DepInfo> {
  const map = new Map<string, DepInfo>();
  for (const d of deps) {
    map.set(d.key, {
      key: d.key,
      title: d.title ?? "Заголовок",
      status: d.status ?? "blocked",
      blockedOn: d.blockedOn ?? null,
      blockedUntil: d.blockedUntil ?? null,
      updatedAt: d.updatedAt ?? new Date(),
    });
  }
  return map;
}

const NOW = new Date("2026-09-29T12:00:00Z");

describe("waitingDeps", () => {
  it("включает задачу, ждущую заблокированную на owner зависимость", () => {
    const deps = makeMap([{ key: "A-1", status: "blocked", blockedOn: "owner", updatedAt: new Date(NOW.getTime() - 1000) }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("B-1");
    expect(result[0].openDeps[0].key).toBe("A-1");
  });

  it("включает задачу в статусе backlog, ждущую заблокированную зависимость", () => {
    const deps = makeMap([{ key: "A-1", status: "blocked", blockedOn: "product" }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "backlog", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(1);
  });

  it("не включает задачу, ждущую зависимость на проверке", () => {
    const deps = makeMap([{ key: "A-1", status: "review" }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("не включает задачу, ждущую закрытую зависимость (done)", () => {
    const deps = makeMap([{ key: "A-1", status: "done" }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("не включает задачу, ждущую закрытую зависимость (cancelled)", () => {
    const deps = makeMap([{ key: "A-1", status: "cancelled" }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("включает задачу, ждущую залежавшуюся бэклог-зависимость (> 3 суток)", () => {
    const old = new Date(NOW.getTime() - 4 * 24 * 3600_000);
    const deps = makeMap([{ key: "A-1", status: "backlog", updatedAt: old }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "backlog", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(1);
  });

  it("не включает задачу, ждущую свежую бэклог-зависимость (< 3 суток)", () => {
    const fresh = new Date(NOW.getTime() - 2 * 24 * 3600_000);
    const deps = makeMap([{ key: "A-1", status: "backlog", updatedAt: fresh }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("не включает задачу in_progress", () => {
    const deps = makeMap([{ key: "A-1", status: "blocked", blockedOn: "owner" }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "in_progress", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("не включает заблокированную зависимость с датой разблокировки", () => {
    const future = new Date(NOW.getTime() + 24 * 3600_000);
    const deps = makeMap([{ key: "A-1", status: "blocked", blockedOn: "owner", blockedUntil: future }]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1"] }], deps, NOW);
    expect(result).toHaveLength(0);
  });

  it("включает только незакрытые зависимости в openDeps", () => {
    const deps = makeMap([
      { key: "A-1", status: "blocked", blockedOn: "owner" },
      { key: "A-2", status: "done" },
    ]);
    const result = waitingDeps([{ key: "B-1", title: "Задача", status: "ready", depends: ["A-1", "A-2"] }], deps, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].openDeps).toHaveLength(1);
    expect(result[0].openDeps[0].key).toBe("A-1");
  });
});

describe("depChains", () => {
  it("строит цепочку из одного корня и нескольких ожидающих", () => {
    const deps = makeMap([{ key: "A-1", status: "blocked", blockedOn: "owner", updatedAt: NOW }]);
    const entries = [
      { key: "B-1", title: "Задача 1", openDeps: [{ key: "A-1", title: "Корень", status: "blocked", blockedOn: "owner" }] },
      { key: "B-2", title: "Задача 2", openDeps: [{ key: "A-1", title: "Корень", status: "blocked", blockedOn: "owner" }] },
    ];
    const chains = depChains(entries, deps);
    expect(chains).toHaveLength(1);
    expect(chains[0].rootKey).toBe("A-1");
    expect(chains[0].waitingKeys).toHaveLength(2);
    expect(chains[0].blockedOn).toBe("owner");
  });

  it("строит несколько цепочек для разных корней", () => {
    const deps = makeMap([
      { key: "A-1", status: "blocked", blockedOn: "owner", updatedAt: NOW },
      { key: "A-2", status: "backlog", updatedAt: new Date(NOW.getTime() - 4 * 24 * 3600_000) },
    ]);
    const entries = [
      { key: "B-1", title: "Задача 1", openDeps: [{ key: "A-1", title: "Корень 1", status: "blocked", blockedOn: "owner" }] },
      { key: "B-2", title: "Задача 2", openDeps: [{ key: "A-2", title: "Корень 2", status: "backlog", blockedOn: null }] },
    ];
    const chains = depChains(entries, deps);
    expect(chains).toHaveLength(2);
  });
});
