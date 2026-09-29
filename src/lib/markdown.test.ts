import { describe, it, expect } from "vitest";
import { stripMd } from "./markdown";

describe("stripMd", () => {
  it("убирает заголовки", () => {
    expect(stripMd("## Заголовок раздела")).toBe("Заголовок раздела");
    expect(stripMd("### Подзаголовок")).toBe("Подзаголовок");
    expect(stripMd("# H1")).toBe("H1");
  });

  it("убирает жирный и курсив", () => {
    expect(stripMd("**Жирный текст**")).toBe("Жирный текст");
    expect(stripMd("*Курсив*")).toBe("Курсив");
    expect(stripMd("**Сделано:** описание")).toBe("Сделано: описание");
  });

  it("убирает inline-код", () => {
    expect(stripMd("`npm install`")).toBe("npm install");
    expect(stripMd("запусти `check.sh` и жди")).toBe("запусти check.sh и жди");
  });

  it("убирает маркеры списка", () => {
    expect(stripMd("- пункт списка")).toBe("пункт списка");
    expect(stripMd("* ещё пункт")).toBe("ещё пункт");
  });

  it("объединяет строки пробелом", () => {
    expect(stripMd("## Заголовок\nТекст следует")).toBe("Заголовок Текст следует");
  });

  it("не трогает чистый текст", () => {
    expect(stripMd("Обычный текст без разметки")).toBe("Обычный текст без разметки");
    expect(stripMd("AUTH-1: исправить кнопку")).toBe("AUTH-1: исправить кнопку");
  });
});
