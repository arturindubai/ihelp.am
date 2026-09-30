import { describe, it, expect } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./emailToken";

describe("emailToken", () => {
  it("создаёт и проверяет токен отписки", () => {
    const userId = "user_abc123";
    const token = createUnsubscribeToken(userId);
    expect(verifyUnsubscribeToken(token)).toBe(userId);
  });

  it("возвращает null для случайной строки", () => {
    expect(verifyUnsubscribeToken("invalid")).toBeNull();
  });

  it("возвращает null для токена без точки", () => {
    expect(verifyUnsubscribeToken("nodot")).toBeNull();
  });

  it("возвращает null для токена с подменённым userId", () => {
    const token = createUnsubscribeToken("user1");
    const tampered = "user2" + token.slice(token.indexOf("."));
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("возвращает null для токена с подменённым HMAC", () => {
    const token = createUnsubscribeToken("user1");
    const [userId] = token.split(".");
    const tampered = `${userId}.aGVsbG8=`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });
});
