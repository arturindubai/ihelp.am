import { describe, expect, it } from "vitest";
import { mergeTranslations } from "./merge-translations";

describe("mergeTranslations", () => {
  it("добавляет ключ из other, которого нет в current и предке", () => {
    const { merged, conflicts } = mergeTranslations({ a: "A" }, { a: "A" }, { a: "A", b: "B" });
    expect(merged).toEqual({ a: "A", b: "B" });
    expect(conflicts).toEqual([]);
  });

  it("сохраняет ключ из current, которого нет в other", () => {
    const { merged, conflicts } = mergeTranslations({ a: "A" }, { a: "A", b: "B" }, { a: "A" });
    expect(merged).toEqual({ a: "A", b: "B" });
    expect(conflicts).toEqual([]);
  });

  it("сливает разные новые ключи из обеих веток — главный сценарий задачи", () => {
    const ancestor = { common: { ok: "OK" }, nav: { home: "Home" } };
    const current = { common: { ok: "OK" }, nav: { home: "Home" }, cc: { title: "CC" } };
    const other = { common: { ok: "OK" }, nav: { home: "Home" }, workers: { title: "W" } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(merged).toHaveProperty("cc");
    expect(merged).toHaveProperty("workers");
    expect(conflicts).toEqual([]);
  });

  it("конфликт: обе ветки добавили один ключ с разными значениями", () => {
    const { conflicts } = mergeTranslations(
      { a: "A" },
      { a: "A", b: "from_current" },
      { a: "A", b: "from_other" },
    );
    expect(conflicts).toContain("b");
  });

  it("нет конфликта: обе ветки добавили один ключ с одинаковым значением", () => {
    const { merged, conflicts } = mergeTranslations(
      { a: "A" },
      { a: "A", b: "same" },
      { a: "A", b: "same" },
    );
    expect(merged.b).toBe("same");
    expect(conflicts).toEqual([]);
  });

  it("конфликт: обе ветки изменили один существующий ключ по-разному", () => {
    const { conflicts } = mergeTranslations({ a: "old" }, { a: "new_current" }, { a: "new_other" });
    expect(conflicts).toContain("a");
  });

  it("нет конфликта: только other изменил ключ — берём из other", () => {
    const { merged, conflicts } = mergeTranslations({ a: "old" }, { a: "old" }, { a: "new" });
    expect(merged.a).toBe("new");
    expect(conflicts).toEqual([]);
  });

  it("нет конфликта: только current изменил ключ — сохраняем current", () => {
    const { merged, conflicts } = mergeTranslations({ a: "old" }, { a: "new" }, { a: "old" });
    expect(merged.a).toBe("new");
    expect(conflicts).toEqual([]);
  });

  it("нет конфликта: оба изменили ключ одинаково", () => {
    const { merged, conflicts } = mergeTranslations({ a: "old" }, { a: "same" }, { a: "same" });
    expect(merged.a).toBe("same");
    expect(conflicts).toEqual([]);
  });

  it("несколько конфликтов — все перечислены", () => {
    const { conflicts } = mergeTranslations(
      { a: "A", b: "B" },
      { a: "A_curr", b: "B_curr" },
      { a: "A_other", b: "B_other" },
    );
    expect(conflicts).toContain("a");
    expect(conflicts).toContain("b");
  });
});
