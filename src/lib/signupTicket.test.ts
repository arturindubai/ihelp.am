import { describe, expect, it } from "vitest";
import { packSignupTicket, unpackSignupTicket } from "./signupTicket";
import { signState } from "./oauth";

const secret = "test-secret";

describe("тикет завершения регистрации", () => {
  it("упаковывается и распаковывается", () => {
    const ticket = packSignupTicket({ phone: "+37441000000", locale: "ru" }, secret);
    expect(unpackSignupTicket(ticket, secret)).toEqual({ phone: "+37441000000", locale: "ru" });
  });

  it("чужая подпись и другой секрет — отказ", () => {
    const ticket = packSignupTicket({ phone: "+37441000000", locale: "ru" }, secret);
    expect(unpackSignupTicket(ticket, "другой-секрет")).toBeNull();
    // Гарантированно портим последний символ HMAC (a↔b): не зависит от случайного значения подписи
    const lastChar = ticket.slice(-1);
    const tampered = ticket.slice(0, -1) + (lastChar === "a" ? "b" : "a");
    expect(unpackSignupTicket(tampered, secret)).toBeNull();
    expect(unpackSignupTicket("", secret)).toBeNull();
  });

  it("подписанная строка не из этого формата (id пользователя, мусор) не принимается", () => {
    expect(unpackSignupTicket(signState("ckabc123userid", secret), secret)).toBeNull();
    expect(unpackSignupTicket(signState(Buffer.from("не json").toString("base64url"), secret), secret)).toBeNull();
    expect(unpackSignupTicket(signState(Buffer.from(JSON.stringify({ phone: "без плюса", locale: "ru" })).toString("base64url"), secret), secret)).toBeNull();
  });
});
