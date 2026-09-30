import { describe, it, expect } from "vitest";
import { merge3, sortRecursive, isSorted } from "./merge-messages";

describe("sortRecursive — рекурсивная сортировка ключей", () => {
  it("сортирует ключи верхнего уровня", () => {
    const result = sortRecursive({ b: 1, a: 2 }) as Record<string, number>;
    expect(Object.keys(result)).toEqual(["a", "b"]);
  });

  it("сортирует вложенные объекты", () => {
    const result = sortRecursive({ z: { d: 1, c: 2 }, a: 3 }) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(["a", "z"]);
    expect(Object.keys(result.z as object)).toEqual(["c", "d"]);
  });
});

describe("merge3 — 3-стороннее слияние", () => {
  it("две ветки добавляют разные ключи в один раздел: слияние чистое, оба ключа на месте", () => {
    // base: пустой раздел
    const base = { section: { existing: "value" } };
    // ours (main): добавил ключ keyA
    const ours = { section: { existing: "value", keyA: "from main" } };
    // theirs (branch): добавил ключ keyB
    const theirs = { section: { existing: "value", keyB: "from branch" } };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    const section = (merged as Record<string, Record<string, string>>).section;
    expect(section.existing).toBe("value");
    expect(section.keyA).toBe("from main");
    expect(section.keyB).toBe("from branch");
  });

  it("обе стороны добавили одинаковый ключ с одним значением: конфликта нет", () => {
    const base = { section: {} };
    const ours = { section: { key: "same" } };
    const theirs = { section: { key: "same" } };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    expect((merged as Record<string, Record<string, string>>).section.key).toBe("same");
  });

  it("обе стороны изменили одно значение на разные: конфликт", () => {
    const base = { key: "original" };
    const ours = { key: "changed by main" };
    const theirs = { key: "changed by branch" };

    const { conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(true);
  });

  it("только одна сторона изменила значение: берётся изменённое, конфликта нет", () => {
    const base = { key: "original" };
    const ours = { key: "changed" };
    const theirs = { key: "original" };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    expect((merged as Record<string, string>).key).toBe("changed");
  });

  it("ветка добавила новый раздел, main не трогал: раздел сохраняется", () => {
    const base = { existing: "value" };
    const ours = { existing: "value" };
    const theirs = { existing: "value", newSection: { key: "translation" } };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    expect((merged as Record<string, unknown>).newSection).toEqual({ key: "translation" });
  });

  it("main добавил новый раздел, ветка не трогала: раздел сохраняется", () => {
    const base = { existing: "value" };
    const ours = { existing: "value", newSection: { key: "translation" } };
    const theirs = { existing: "value" };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    expect((merged as Record<string, unknown>).newSection).toEqual({ key: "translation" });
  });

  it("реальный сценарий: две ветки добавляют ключи в messages раздел", () => {
    const base = { admin: { cc: { healthPage: { subtitle: "текст" } } } };
    const ours = {
      admin: { cc: { healthPage: { subtitle: "текст", mergeConflicts: "Конфликты" } } },
    };
    const theirs = {
      admin: { cc: { healthPage: { subtitle: "текст", newFeature: "Новая функция" } } },
    };

    const { merged, conflicts } = merge3(base, ours, theirs);
    expect(conflicts).toBe(false);
    type HP = Record<string, Record<string, Record<string, Record<string, string>>>>;
    const hp = (merged as HP).admin.cc.healthPage;
    expect(hp.subtitle).toBe("текст");
    expect(hp.mergeConflicts).toBe("Конфликты");
    expect(hp.newFeature).toBe("Новая функция");
  });
});

describe("isSorted — проверка порядка ключей", () => {
  it("возвращает true для отсортированного объекта", () => {
    expect(isSorted({ a: 1, b: 2, c: 3 })).toBe(true);
  });

  it("возвращает false для несортированного объекта", () => {
    expect(isSorted({ b: 1, a: 2 })).toBe(false);
  });

  it("проверяет вложенные объекты", () => {
    expect(isSorted({ a: { z: 1, y: 2 } })).toBe(false);
  });
});
