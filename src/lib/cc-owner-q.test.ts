import { describe, it, expect } from "vitest";
import { parseVariants } from "./cc-owner-q";

describe("parseVariants", () => {
  it("возвращает null если вариантов меньше двух", () => {
    expect(parseVariants("Просто текст")).toBeNull();
    expect(parseVariants("Вопрос? A) Только один вариант")).toBeNull();
  });

  it("парсит два варианта на одной строке", () => {
    const r = parseVariants("Выбрать подход? A) Быстрый B) Качественный");
    expect(r).not.toBeNull();
    expect(r!.question).toBe("Выбрать подход?");
    expect(r!.variants).toHaveLength(2);
    expect(r!.variants[0]).toEqual({ id: "A", text: "Быстрый" });
    expect(r!.variants[1]).toEqual({ id: "B", text: "Качественный" });
  });

  it("парсит три варианта", () => {
    const r = parseVariants("Канал входа? A) Telegram B) Email C) Оба");
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[2]).toEqual({ id: "C", text: "Оба" });
  });

  it("парсит варианты на разных строках", () => {
    const text = "Когда делать?\nA) Срочно сейчас\nB) В следующем спринте\nC) Отложить";
    const r = parseVariants(text);
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[0].text).toBe("Срочно сейчас");
  });

  it("убирает завершающий слэш между вариантами", () => {
    const r = parseVariants("Выбор? A) Первый / B) Второй");
    expect(r!.variants[0].text).toBe("Первый");
    expect(r!.variants[1].text).toBe("Второй");
  });

  it("возвращает пустой вопрос если текст начинается сразу с варианта", () => {
    const r = parseVariants("A) Вариант один B) Вариант два");
    expect(r!.question).toBe("");
    expect(r!.variants).toHaveLength(2);
  });

  it("возвращает null для текста без формата вариантов", () => {
    expect(parseVariants("Нужно уточнить детали реализации")).toBeNull();
    expect(parseVariants("1) Первое 2) Второе")).toBeNull();
  });
});
