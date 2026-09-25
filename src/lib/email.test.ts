import { describe, expect, it } from "vitest";
import { maskEmail, normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("приводит к нижнему регистру и обрезает пробелы", () => {
    expect(normalizeEmail("  Anna.Petrosyan@Gmail.COM ")).toBe("anna.petrosyan@gmail.com");
  });
  it("отклоняет то, что на email не похоже", () => {
    for (const bad of ["", "   ", "anna", "anna@", "@gmail.com", "anna@gmail", "an na@gmail.com", "a@b@c.com", null, undefined]) {
      expect(normalizeEmail(bad as string | null | undefined)).toBeNull();
    }
  });
  it("отклоняет слишком длинный адрес", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@x.am`)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("прячет всё, кроме первой буквы имени", () => {
    expect(maskEmail("anna@gmail.com")).toBe("a***@gmail.com");
  });
  it("строка без @ возвращается как есть", () => {
    expect(maskEmail("anna")).toBe("anna");
  });
});
