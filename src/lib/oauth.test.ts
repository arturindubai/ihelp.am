import { describe, expect, it } from "vitest";
import { parseIdToken, signState, verifyState } from "@/lib/oauth";
import { mailTemplate } from "@/lib/mail-template";

const SECRET = "test-secret";
const idToken = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

describe("вход через Google", () => {
  it("состояние подписывается и проверяется", () => {
    const state = signState("abc|/admin", SECRET);
    expect(verifyState(state, SECRET)).toBe("abc|/admin");
  });

  it("подделанное или чужое состояние отклоняется", () => {
    const state = signState("abc", SECRET);
    expect(verifyState(state, "другой-секрет")).toBeNull();
    expect(verifyState(state.replace("abc", "xyz"), SECRET)).toBeNull();
    expect(verifyState("мусор", SECRET)).toBeNull();
  });

  it("просроченное состояние отклоняется", () => {
    const payload = "abc.1000";
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const expired = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("hex")}`;
    expect(verifyState(expired, SECRET)).toBeNull();
  });

  it("email из id_token приводится к нижнему регистру", () => {
    expect(parseIdToken(idToken({ email: "Owner@Example.COM", email_verified: true, name: "Артур" }))).toEqual({
      email: "owner@example.com",
      emailVerified: true,
      name: "Артур",
    });
  });

  it("непроверенная почта видна как непроверенная, мусор отклоняется", () => {
    expect(parseIdToken(idToken({ email: "a@b.am", email_verified: false }))?.emailVerified).toBe(false);
    expect(parseIdToken(idToken({ sub: "123" }))).toBeNull();
    expect(parseIdToken("мусор")).toBeNull();
  });
});

describe("письма", () => {
  it("подставленные значения экранируются", () => {
    const html = mailTemplate({ brand: "Home & Care", title: "<script>alert(1)</script>", lines: ["a < b"], button: { text: "Открыть", url: "https://x.am?a=1&b=2" } });
    expect(html).toContain("Home &amp; Care");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://x.am?a=1&amp;b=2");
  });
});
