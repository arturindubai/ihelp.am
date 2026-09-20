import { describe, expect, it } from "vitest";
import { AREAS, BACKLOG, EPICS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "./backlog";

describe("бэклог", () => {
  const keys = BACKLOG.map((t) => t.key);

  it("ключи уникальны и в верхнем регистре", () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => !/^[A-Z][A-Z0-9-]+$/.test(k))).toEqual([]);
  });

  it("зависимости указывают на существующие задачи", () => {
    const missing = BACKLOG.flatMap((t) => (t.depends ?? []).filter((d) => !keys.includes(d)).map((d) => `${t.key} → ${d}`));
    expect(missing).toEqual([]);
  });

  it("нет циклов в зависимостях", () => {
    const byKey = new Map(BACKLOG.map((t) => [t.key, t.depends ?? []]));
    const state = new Map<string, "visiting" | "done">();
    const cycles: string[] = [];
    const walk = (k: string, path: string[]) => {
      if (state.get(k) === "done") return;
      if (state.get(k) === "visiting") return void cycles.push([...path, k].join(" → "));
      state.set(k, "visiting");
      for (const d of byKey.get(k) ?? []) walk(d, [...path, k]);
      state.set(k, "done");
    };
    keys.forEach((k) => walk(k, []));
    expect(cycles).toEqual([]);
  });

  it("поля заполнены допустимыми значениями", () => {
    for (const t of BACKLOG) {
      expect(t.title.length, t.key).toBeGreaterThan(5);
      expect(t.summary.length, t.key).toBeGreaterThan(20);
      expect(t.requirements.length, t.key).toBeGreaterThan(0);
      expect(EPICS, t.key).toContain(t.epic);
      expect(Object.keys(AREAS), t.key).toContain(t.area);
      expect(Object.keys(LAYERS), t.key).toContain(t.layer);
      expect(Object.keys(PRIORITIES), t.key).toContain(t.priority);
      expect(Object.keys(STAGES), t.key).toContain(t.stage);
      expect(Object.keys(OWNERS), t.key).toContain(t.owner);
      if (t.status) expect(Object.keys(STATUSES), t.key).toContain(t.status);
    }
  });

  it("этап и приоритет согласованы", () => {
    const rule: Record<string, string[]> = { launch: ["p0"], public: ["p1"], growth: ["p2", "p3"], later: ["p2"], baseline: ["p3"] };
    const wrong = BACKLOG.filter((t) => !rule[t.stage].includes(t.priority)).map((t) => `${t.key}: ${t.stage}/${t.priority}`);
    expect(wrong).toEqual([]);
  });

  it("задачи, требующие участия продукта, помечены владельцем", () => {
    const wrong = BACKLOG.filter((t) => (t.needs?.length ?? 0) > 0 && t.owner === "tech").map((t) => t.key);
    expect(wrong).toEqual([]);
  });

  it("покрывает все области и этапы", () => {
    expect(new Set(BACKLOG.map((t) => t.area)).size).toBe(Object.keys(AREAS).length);
    expect(new Set(BACKLOG.map((t) => t.stage)).size).toBe(Object.keys(STAGES).length);
    expect(BACKLOG.length).toBeGreaterThan(80);
  });
});
