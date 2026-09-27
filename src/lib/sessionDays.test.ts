import { describe, it, expect } from "vitest";
import { sessionDays } from "./sessionDays";

describe("sessionDays", () => {
  it("персонал получает staffDays", () => {
    expect(sessionDays("ADMIN", 7, 60)).toBe(7);
    expect(sessionDays("OWNER", 7, 60)).toBe(7);
    expect(sessionDays("OPERATOR", 7, 60)).toBe(7);
  });

  it("клиент и мастер получают clientDays", () => {
    expect(sessionDays("CLIENT", 7, 60)).toBe(60);
    expect(sessionDays("MASTER", 7, 60)).toBe(60);
  });

  it("undefined роль → clientDays", () => {
    expect(sessionDays(undefined, 7, 60)).toBe(60);
  });
});
