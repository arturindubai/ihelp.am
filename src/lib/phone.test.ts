import { describe, expect, it } from "vitest";
import { composePhone, normalizePhone, splitPhone } from "./phone";

describe("normalizePhone: армянские сокращения остаются как раньше", () => {
  it("местные форматы дополняются кодом 374", () => {
    expect(normalizePhone("091 123456")).toBe("+37491123456");
    expect(normalizePhone("91123456")).toBe("+37491123456");
    expect(normalizePhone("+374 91-123456")).toBe("+37491123456");
    expect(normalizePhone("0037491123456")).toBe("+37491123456");
  });
  it("слишком короткий или длинный — null", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("composePhone: код страны из селектора + введённый номер", () => {
  it("обычный ввод", () => {
    expect(composePhone("374", "91 123456")).toBe("+37491123456");
    expect(composePhone("995", "555 12 34 56")).toBe("+995555123456");
  });
  it("ведущий 0 — внутристрановой префикс, отбрасывается", () => {
    expect(composePhone("374", "091123456")).toBe("+37491123456");
    expect(composePhone("44", "07123 456789")).toBe("+447123456789");
  });
  it("Россия: ведущая 8 при 11 цифрах — префикс, а не часть номера", () => {
    expect(composePhone("7", "8 912 345-67-89")).toBe("+79123456789");
    expect(composePhone("7", "912 345-67-89")).toBe("+79123456789");
  });
  it("Казахстан (+7, мобильные начинаются с 7) не портится", () => {
    expect(composePhone("7", "701 234 5678")).toBe("+77012345678");
  });
  it("номер, вставленный целиком с + или 00, берётся как есть независимо от выбранной страны", () => {
    expect(composePhone("374", "+995 555 123456")).toBe("+995555123456");
    expect(composePhone("374", "0049 151 2345678")).toBe("+491512345678");
  });
  it("пусто или слишком коротко — null", () => {
    expect(composePhone("374", "")).toBeNull();
    expect(composePhone("374", "   ")).toBeNull();
    expect(composePhone("374", "12")).toBeNull();
  });
});

describe("splitPhone: E.164 → страна и остаток", () => {
  it("делит по коду страны", () => {
    expect(splitPhone("+37441055509")).toEqual({ iso: "AM", national: "41055509" });
    expect(splitPhone("+79123456789")).toEqual({ iso: "RU", national: "9123456789" });
  });
  it("неизвестный код — null", () => {
    expect(splitPhone("+0000000000")).toBeNull();
  });
});
