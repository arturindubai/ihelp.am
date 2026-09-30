import { describe, expect, it } from "vitest";
import { packGoogleSignupTicket, unpackGoogleSignupTicket } from "./googleSignupTicket";
import { signState } from "./oauth";

const secret = "test-secret";

describe("тикет регистрации через Google", () => {
  it("упаковывается и распаковывается", () => {
    const ticket = packGoogleSignupTicket({ email: "user@example.com", name: "Иван Иванов", locale: "ru" }, secret);
    expect(unpackGoogleSignupTicket(ticket, secret)).toEqual({ email: "user@example.com", name: "Иван Иванов", locale: "ru" });
  });

  it("имя может быть пустой строкой", () => {
    const ticket = packGoogleSignupTicket({ email: "user@example.com", name: "", locale: "en" }, secret);
    expect(unpackGoogleSignupTicket(ticket, secret)).toEqual({ email: "user@example.com", name: "", locale: "en" });
  });

  it("чужая подпись и другой секрет — отказ", () => {
    const ticket = packGoogleSignupTicket({ email: "user@example.com", name: "Test", locale: "ru" }, secret);
    expect(unpackGoogleSignupTicket(ticket, "другой-секрет")).toBeNull();
    const lastChar = ticket.slice(-1);
    const tampered = ticket.slice(0, -1) + (lastChar === "a" ? "b" : "a");
    expect(unpackGoogleSignupTicket(tampered, secret)).toBeNull();
    expect(unpackGoogleSignupTicket("", secret)).toBeNull();
  });

  it("подписанная строка не из этого формата не принимается", () => {
    expect(unpackGoogleSignupTicket(signState("без-собачки", secret), secret)).toBeNull();
    expect(unpackGoogleSignupTicket(signState(Buffer.from("не json").toString("base64url"), secret), secret)).toBeNull();
  });
});
