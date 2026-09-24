import { describe, expect, it } from "vitest";
import { scrub } from "./logbuffer";

describe("журнал для страницы «Логи»", () => {
  it("скрывает коды входа, токены и пароли в адресах", () => {
    expect(scrub("[otp:dev] SMS +37499000000 → 482913")).toBe("[otp:dev] SMS +37499000000 → ***");
    expect(scrub('verify code: 123456')).toBe("verify code: ***");
    expect(scrub("token=abcdef123456 ok")).toBe("token=*** ok");
    expect(scrub("postgres://app:s3cretpass@db:5432/x")).toBe("postgres://app:***@db:5432/x");
    expect(scrub("https://api.telegram.org/bot123456789:AAAbbbCCCdddEEEfffGGGhhh/sendMessage")).toContain("bot***");
  });
  it("обычные строки не трогает", () => {
    expect(scrub("[cc] задача AUTH-1 → Готова")).toBe("[cc] задача AUTH-1 → Готова");
  });
});
