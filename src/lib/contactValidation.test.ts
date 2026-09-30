import { describe, it, expect } from "vitest";
import { isValidContact } from "./contactValidation";

describe("isValidContact", () => {
  it("принимает e-mail", () => {
    expect(isValidContact("user@example.com")).toBe(true);
    expect(isValidContact("name+tag@mail.ru")).toBe(true);
  });

  it("принимает телефоны в разных форматах", () => {
    expect(isValidContact("+37499123456")).toBe(true);
    expect(isValidContact("+374 99 12-34-56")).toBe(true);
    expect(isValidContact("099123456")).toBe(true);
  });

  it("отклоняет пустую строку и мусор", () => {
    expect(isValidContact("")).toBe(false);
    expect(isValidContact("abc")).toBe(false);
    expect(isValidContact("1234")).toBe(false);
    expect(isValidContact("no-at-sign")).toBe(false);
  });

  it("обрезает пробелы по краям", () => {
    expect(isValidContact("  user@example.com  ")).toBe(true);
    expect(isValidContact("  +37499123456  ")).toBe(true);
  });
});
