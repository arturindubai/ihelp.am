import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safeRedirect";

describe("safeReturnPath", () => {
  it("возвращает null для пустых значений", () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath("")).toBeNull();
  });

  it("пропускает корректные локальные пути", () => {
    expect(safeReturnPath("/account")).toBe("/account");
    expect(safeReturnPath("/services")).toBe("/services");
    expect(safeReturnPath("/book/cleaning?o=1,2")).toBe("/book/cleaning?o=1,2");
    expect(safeReturnPath("/ru/account/orders")).toBe("/ru/account/orders");
  });

  it("блокирует протоколо-относительные URL (open redirect)", () => {
    expect(safeReturnPath("//evil.com")).toBeNull();
    expect(safeReturnPath("//evil.com/path")).toBeNull();
  });

  it("блокирует абсолютные URL", () => {
    expect(safeReturnPath("https://evil.com")).toBeNull();
    expect(safeReturnPath("http://evil.com/path")).toBeNull();
  });

  it("блокирует строки без ведущего слэша", () => {
    expect(safeReturnPath("evil.com")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  });
});
