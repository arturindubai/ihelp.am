import { describe, it, expect } from "vitest";
import { buildPostponeReason, parseMultiQuestion, parseVariants } from "./cc-owner-q";

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

  it("парсит кириллические варианты А/Б/В", () => {
    const r = parseVariants("Какой подход? А) Быстрый Б) Надёжный В) Оба");
    expect(r).not.toBeNull();
    expect(r!.question).toBe("Какой подход?");
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[0]).toEqual({ id: "А", text: "Быстрый" });
    expect(r!.variants[1]).toEqual({ id: "Б", text: "Надёжный" });
    expect(r!.variants[2]).toEqual({ id: "В", text: "Оба" });
  });

  it("парсит строчные кириллические варианты и нормализует к верхнему регистру", () => {
    const r = parseVariants("Выбрать? а) вариант 1 б) вариант 2");
    expect(r).not.toBeNull();
    expect(r!.variants[0]).toEqual({ id: "А", text: "вариант 1" });
    expect(r!.variants[1]).toEqual({ id: "Б", text: "вариант 2" });
  });

  it("парсит строчные латинские варианты и нормализует к верхнему регистру", () => {
    const r = parseVariants("Делаем? a) да b) нет");
    expect(r).not.toBeNull();
    expect(r!.variants[0]).toEqual({ id: "A", text: "да" });
    expect(r!.variants[1]).toEqual({ id: "B", text: "нет" });
  });
});

describe("parseMultiQuestion", () => {
  it("одиночный вопрос без вариантов — один блок", () => {
    const r = parseMultiQuestion("Прислать логотип");
    expect(r).toHaveLength(1);
    expect(r[0].question).toBe("Прислать логотип");
    expect(r[0].variants).toBeNull();
  });

  it("одиночный вопрос с вариантами — один блок с вариантами", () => {
    const r = parseMultiQuestion("Выбрать канал? А) Telegram Б) Email");
    expect(r).toHaveLength(1);
    expect(r[0].variants).toHaveLength(2);
  });

  it("два вопроса разделены пустой строкой", () => {
    const text = "Какой цвет? А) Синий Б) Красный\n\nКакой шрифт? А) Bold Б) Regular";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(2);
    expect(r[0].variants).toHaveLength(2);
    expect(r[1].variants).toHaveLength(2);
    expect(r[0].question).toBe("Какой цвет?");
    expect(r[1].question).toBe("Какой шрифт?");
  });

  it("два вопроса разделены нумерацией", () => {
    const text = "1. Войти в сервис\n2. Прислать логотип";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(2);
    expect(r[0].variants).toBeNull();
    expect(r[1].variants).toBeNull();
  });

  it("один из блоков без вариантов, другой с вариантами", () => {
    const text = "Прислать логотип\n\nКакой срок? А) Неделя Б) Месяц";
    const r = parseMultiQuestion(text);
    expect(r).toHaveLength(2);
    expect(r[0].variants).toBeNull();
    expect(r[1].variants).toHaveLength(2);
  });
});

describe("buildPostponeReason", () => {
  it("включает исходный вопрос после даты", () => {
    const result = buildPostponeReason("1 октября", "Выбрать вариант? А) Да Б) Нет");
    expect(result).toBe("Отложено до 1 октября. Выбрать вариант? А) Да Б) Нет");
  });

  it("возвращает только дату если вопрос пустой", () => {
    const result = buildPostponeReason("1 октября", "");
    expect(result).toBe("Отложено до 1 октября");
  });

  it("обрезает пробелы исходного вопроса", () => {
    const result = buildPostponeReason("5 ноября", "  Прислать логотип  ");
    expect(result).toBe("Отложено до 5 ноября. Прислать логотип");
  });
});
