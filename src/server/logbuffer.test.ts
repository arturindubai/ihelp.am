import { describe, expect, it } from "vitest";
import { scrub, makeFingerprint, isPageBuildError } from "./logbuffer";

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

describe("отпечаток ошибки", () => {
  it("одинаковые ошибки дают одинаковый отпечаток", () => {
    const e1 = "Error: User not found\n    at getUser (src/server/services/users.ts:42:7)";
    const e2 = "Error: User not found\n    at getUser (src/server/services/users.ts:99:3)";
    expect(makeFingerprint(e1)).toBe(makeFingerprint(e2));
  });

  it("разные ошибки дают разный отпечаток", () => {
    const e1 = "Error: User not found\n    at getUser (src/server/services/users.ts:42:7)";
    const e2 = "Error: Order not found\n    at getOrder (src/server/services/orders.ts:10:3)";
    expect(makeFingerprint(e1)).not.toBe(makeFingerprint(e2));
  });

  it("убирает числа, UUID и пути", () => {
    const fp = makeFingerprint("TypeError: timeout after 5000ms, id=cm9abc1234567890123456789");
    expect(fp).not.toContain("5000");
    expect(fp).not.toContain("cm9abc1234567890123456789");
  });

  it("возвращает пустую строку для слишком короткого текста", () => {
    expect(makeFingerprint("err")).toBe("");
  });
});

describe("обнаружение ошибок рендера страницы", () => {
  it("обнаруживает RSC-ошибки", () => {
    expect(isPageBuildError("Error\n    at webpack-internal:///(rsc)/./src/app/page.tsx:25:7")).toBe(true);
  });

  it("обнаруживает ошибки пре-рендера", () => {
    expect(isPageBuildError("Error occurred prerendering page")).toBe(true);
  });

  it("не считает обычные ошибки ошибками рендера", () => {
    expect(isPageBuildError("Error: connection refused\n    at src/server/db.ts:10:5")).toBe(false);
  });
});
