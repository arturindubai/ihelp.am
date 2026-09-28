import { describe, it, expect } from "vitest";
import { isAgentAuthor } from "./cc-owner-question";
import { parseVariants } from "./cc-owner-q";

describe("isAgentAuthor", () => {
  it("возвращает false только для владельца", () => {
    expect(isAgentAuthor("owner")).toBe(false);
  });

  it("возвращает true для всех агентских ролей", () => {
    expect(isAgentAuthor("triage")).toBe(true);
    expect(isAgentAuthor("product")).toBe(true);
    expect(isAgentAuthor("designer")).toBe(true);
    expect(isAgentAuthor("cto")).toBe(true);
    expect(isAgentAuthor("dev")).toBe(true);
    expect(isAgentAuthor("nocode")).toBe(true);
    expect(isAgentAuthor("tester")).toBe(true);
    expect(isAgentAuthor("deployer")).toBe(true);
    expect(isAgentAuthor("watchdog")).toBe(true);
  });

  it("возвращает true для агентов с суффиксом (dev-1, dev-2, triage-1)", () => {
    expect(isAgentAuthor("dev-1")).toBe(true);
    expect(isAgentAuthor("dev-2")).toBe(true);
    expect(isAgentAuthor("triage-1")).toBe(true);
    expect(isAgentAuthor("nocode-3")).toBe(true);
  });

  it("возвращает true для системных записей", () => {
    expect(isAgentAuthor("system")).toBe(true);
    expect(isAgentAuthor("dispatcher")).toBe(true);
  });

  it("возвращает true для неизвестных имён (приравниваются к dev)", () => {
    expect(isAgentAuthor("unknown-bot")).toBe(true);
  });
});

describe("parseVariants — длинный текст (>200 символов)", () => {
  it("корректно разбирает варианты из вопроса длиннее 200 символов", () => {
    const longQuestion =
      "Нужно выбрать подход к реализации SMS-отправки для армянских номеров с учётом ограничений Twilio по KYC и регистрации Sender ID. " +
      "Это влияет на сроки запуска функции входа через SMS. A) Использовать Twilio с ожиданием KYC до 10.10 " +
      "B) Подключить местного оператора Unibell C) Временно использовать Telegram OTP";
    const r = parseVariants(longQuestion);
    expect(r).not.toBeNull();
    expect(r!.variants).toHaveLength(3);
    expect(r!.variants[0].id).toBe("A");
    expect(r!.variants[1].id).toBe("B");
    expect(r!.variants[2].id).toBe("C");
    expect(r!.question.length).toBeGreaterThan(100);
  });

  it("варианты разбираются из текста с точным вопросом в 200+ символов", () => {
    const text = "А".repeat(201) + " A) Да B) Нет";
    const r = parseVariants(text);
    expect(r).not.toBeNull();
    expect(r!.variants).toHaveLength(2);
  });
});
