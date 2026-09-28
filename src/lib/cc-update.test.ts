import { describe, it, expect } from "vitest";
import { buildUpdatePatch, formatChangedFields } from "./cc-update";

describe("buildUpdatePatch", () => {
  it("текст из textFiles.design попадает в поле design", () => {
    const r = buildUpdatePatch({ textFiles: { design: "Описание дизайна из файла" } });
    expect(r.error).toBeUndefined();
    expect(r.patch.design).toBe("Описание дизайна из файла");
  });

  it("текст из textFiles.details попадает в поле details", () => {
    const r = buildUpdatePatch({ textFiles: { details: "Детали задачи из файла" } });
    expect(r.error).toBeUndefined();
    expect(r.patch.details).toBe("Детали задачи из файла");
  });

  it("текст из textFiles.summary попадает в поле summary", () => {
    const r = buildUpdatePatch({ textFiles: { summary: "Краткое описание из файла" } });
    expect(r.error).toBeUndefined();
    expect(r.patch.summary).toBe("Краткое описание из файла");
  });

  it("jsonPatch и textFiles объединяются", () => {
    const r = buildUpdatePatch({
      jsonPatch: { title: "Заголовок", requirements: ["Критерий 1"] },
      textFiles: { design: "Дизайн из файла" },
    });
    expect(r.error).toBeUndefined();
    expect(r.patch.title).toBe("Заголовок");
    expect(r.patch.requirements).toEqual(["Критерий 1"]);
    expect(r.patch.design).toBe("Дизайн из файла");
  });

  it("textFiles перекрывает одноимённое поле из jsonPatch", () => {
    const r = buildUpdatePatch({
      jsonPatch: { design: "старый дизайн" },
      textFiles: { design: "новый дизайн из файла" },
    });
    expect(r.error).toBeUndefined();
    expect(r.patch.design).toBe("новый дизайн из файла");
  });

  it("пустой патч (без аргументов) возвращает ошибку с перечнем полей", () => {
    const r = buildUpdatePatch({});
    expect(r.error).toMatch(/нет полей для обновления/);
    expect(r.error).toContain("design");
    expect(r.error).toContain("summary");
    expect(r.error).toContain("details");
  });

  it("патч только из неизвестных полей возвращает ошибку", () => {
    const r = buildUpdatePatch({ jsonPatch: { unknownField: "значение", _internal: 1 } });
    expect(r.error).toMatch(/нет полей для обновления/);
  });

  it("пустая строка в design считается допустимым полем (очищает поле)", () => {
    const r = buildUpdatePatch({ textFiles: { design: "" } });
    expect(r.error).toBeUndefined();
    expect(r.patch.design).toBe("");
  });

  it("jsonPatch с допустимым полем проходит без textFiles", () => {
    const r = buildUpdatePatch({ jsonPatch: { title: "Новое название" } });
    expect(r.error).toBeUndefined();
    expect(r.patch.title).toBe("Новое название");
  });
});

describe("formatChangedFields", () => {
  it("для строкового поля показывает количество символов", () => {
    const result = formatChangedFields({ design: "Текст дизайна" });
    expect(result).toContain("design");
    expect(result).toContain("13 симв.");
  });

  it("для массива показывает количество элементов", () => {
    const result = formatChangedFields({ requirements: ["Пункт 1", "Пункт 2"] });
    expect(result).toContain("requirements");
    expect(result).toContain("2 эл.");
  });

  it("несколько полей перечисляются через запятую", () => {
    const result = formatChangedFields({ design: "abc", summary: "def" });
    expect(result).toContain("design");
    expect(result).toContain("summary");
    expect(result).toContain(",");
  });

  it("булево поле выводится без длины", () => {
    const result = formatChangedFields({ mockupRequired: true });
    expect(result).toContain("mockupRequired");
    expect(result).not.toContain("симв.");
    expect(result).not.toContain("эл.");
  });

  it("неизвестные поля не включаются в вывод", () => {
    const result = formatChangedFields({ unknownField: "значение" });
    expect(result).toBe("(нет полей)");
  });

  it("смесь допустимых и неизвестных полей — только допустимые", () => {
    const result = formatChangedFields({ design: "текст", _internal: "мусор" });
    expect(result).toContain("design");
    expect(result).not.toContain("_internal");
  });
});
