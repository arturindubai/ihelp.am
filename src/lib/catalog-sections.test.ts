import { describe, it, expect } from "vitest";
import { groupBySection } from "./catalog-sections";

const sections = [
  { id: "s1", title: "Глубокая уборка", sort: 0 },
  { id: "s2", title: "Дезинфекция", sort: 1 },
];

describe("groupBySection", () => {
  it("возвращает один группу без заголовка, если разделов нет", () => {
    const items = [{ sectionId: null }, { sectionId: undefined }];
    const result = groupBySection(items, []);
    expect(result).toHaveLength(1);
    expect(result[0].sectionId).toBeNull();
    expect(result[0].sectionTitle).toBeNull();
    expect(result[0].items).toHaveLength(2);
  });

  it("группирует по разделам в порядке sort", () => {
    const items = [
      { sectionId: "s2", name: "B" },
      { sectionId: "s1", name: "A" },
      { sectionId: "s1", name: "C" },
    ];
    const result = groupBySection(items, sections);
    expect(result).toHaveLength(2);
    expect(result[0].sectionId).toBe("s1");
    expect(result[0].items).toHaveLength(2);
    expect(result[1].sectionId).toBe("s2");
    expect(result[1].items).toHaveLength(1);
  });

  it("услуги без раздела идут последними", () => {
    const items = [
      { sectionId: "s1", name: "A" },
      { sectionId: null, name: "Z" },
    ];
    const result = groupBySection(items, sections);
    expect(result).toHaveLength(2);
    expect(result[0].sectionId).toBe("s1");
    expect(result[1].sectionId).toBeNull();
  });

  it("пустые разделы пропускаются по умолчанию", () => {
    const items = [{ sectionId: "s1", name: "A" }];
    const result = groupBySection(items, sections);
    expect(result).toHaveLength(1);
    expect(result[0].sectionId).toBe("s1");
  });

  it("includeEmpty: true — пустые разделы сохраняются", () => {
    const items = [{ sectionId: "s1", name: "A" }];
    const result = groupBySection(items, sections, { includeEmpty: true });
    expect(result).toHaveLength(3); // s1, s2, null
    expect(result[1].sectionId).toBe("s2");
    expect(result[1].items).toHaveLength(0);
  });

  it("сервис с неизвестным sectionId попадает в группу без раздела", () => {
    const items = [{ sectionId: "unknown-id" }];
    const result = groupBySection(items, sections);
    expect(result).toHaveLength(1);
    expect(result[0].sectionId).toBeNull();
  });
});
