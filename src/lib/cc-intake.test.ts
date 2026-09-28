import { describe, expect, it } from "vitest";
import { intakeClosingMapValid, parseClosingMapKeys, parseClosingMapLines, parseDuplicateOriginalKey } from "./cc-intake";

describe("parseClosingMapKeys", () => {
  it("извлекает ключи задач из текста", () => {
    const map = "AUTH-16: текст согласия\nIN-9: отклонено — дубль DEV-5";
    expect(parseClosingMapKeys(map)).toEqual(expect.arrayContaining(["AUTH-16", "IN-9", "DEV-5"]));
  });

  it("убирает дубликаты ключей", () => {
    const map = "AUTH-1: первое упоминание\nAUTH-1: второе упоминание";
    expect(parseClosingMapKeys(map)).toHaveLength(1);
    expect(parseClosingMapKeys(map)).toContain("AUTH-1");
  });

  it("возвращает пустой массив при отсутствии ключей", () => {
    expect(parseClosingMapKeys("отклонено — нет аналогов")).toEqual([]);
  });

  it("не путает слова без дефиса с ключами", () => {
    const map = "отклонено по причине устаревания";
    expect(parseClosingMapKeys(map)).toEqual([]);
  });
});

describe("parseDuplicateOriginalKey", () => {
  it("находит ключ после «дубль»", () => {
    expect(parseDuplicateOriginalKey("IN-9: отклонено — дубль DEV-5")).toBe("DEV-5");
  });

  it("находит ключ после «уже есть»", () => {
    expect(parseDuplicateOriginalKey("уже есть AUTH-3")).toBe("AUTH-3");
  });

  it("регистр не важен", () => {
    expect(parseDuplicateOriginalKey("Дубль AUTH-5")).toBe("AUTH-5");
    expect(parseDuplicateOriginalKey("Уже Есть COMP-12")).toBe("COMP-12");
  });

  it("возвращает null если дубля нет", () => {
    expect(parseDuplicateOriginalKey("AUTH-16: текст согласия")).toBeNull();
    expect(parseDuplicateOriginalKey("")).toBeNull();
  });

  it("берёт первое совпадение при нескольких дублях", () => {
    expect(parseDuplicateOriginalKey("дубль DEV-5; также схоже с дубль DEV-7")).toBe("DEV-5");
  });
});

describe("intakeClosingMapValid", () => {
  it("непустая строка — валидна", () => {
    expect(intakeClosingMapValid("AUTH-16: согласие")).toBe(true);
    expect(intakeClosingMapValid("отклонено — нет ресурсов")).toBe(true);
  });

  it("пустая строка и пробелы — невалидны", () => {
    expect(intakeClosingMapValid("")).toBe(false);
    expect(intakeClosingMapValid("   ")).toBe(false);
    expect(intakeClosingMapValid("\n\n")).toBe(false);
  });
});

describe("parseClosingMapLines", () => {
  it("разбивает по переносам и убирает пустые строки", () => {
    const map = "AUTH-16: текст согласия\n\nIN-9: отклонено — дубль DEV-5\n";
    expect(parseClosingMapLines(map)).toEqual(["AUTH-16: текст согласия", "IN-9: отклонено — дубль DEV-5"]);
  });

  it("возвращает пустой массив для пустого текста", () => {
    expect(parseClosingMapLines("")).toEqual([]);
    expect(parseClosingMapLines("   \n  \n")).toEqual([]);
  });
});
