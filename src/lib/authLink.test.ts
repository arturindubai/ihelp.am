import { describe, expect, it } from "vitest";
import { linkLoginDecision } from "./authLink";

describe("linkLoginDecision", () => {
  it("возвращает 410, если ADMIN_LOGIN_TOKEN не задан", () => {
    expect(linkLoginDecision("any-token", undefined)).toBe(410);
  });

  it("возвращает 410, если ADMIN_LOGIN_TOKEN пустая строка", () => {
    expect(linkLoginDecision("any-token", "")).toBe(410);
  });

  it("возвращает 410, если токен пустой и ADMIN_LOGIN_TOKEN тоже пустой", () => {
    expect(linkLoginDecision("", undefined)).toBe(410);
  });

  it("возвращает 403, если ADMIN_LOGIN_TOKEN задан, но токен пустой", () => {
    expect(linkLoginDecision("", "secret-token")).toBe(403);
  });

  it("возвращает 403, если токен неверный", () => {
    expect(linkLoginDecision("wrong-token", "secret-token")).toBe(403);
  });

  it("возвращает 403, если токен похожий, но другой длины", () => {
    expect(linkLoginDecision("secret-token-extra", "secret-token")).toBe(403);
  });

  it("возвращает ok, если токен совпадает", () => {
    expect(linkLoginDecision("correct-secret", "correct-secret")).toBe("ok");
  });
});
