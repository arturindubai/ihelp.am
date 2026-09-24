import { describe, expect, it } from "vitest";
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso, countryByPhone, flagEmoji } from "./countries";

describe("страны для селектора кода телефона", () => {
  it("Армения первой, коды уникальны по ISO, код — только цифры", () => {
    expect(COUNTRIES[0].iso).toBe(DEFAULT_COUNTRY);
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.iso) && /^\d{1,3}$/.test(c.dial) && c.name.length > 1)).toBe(true);
  });

  it("порядок детерминирован и не зависит от локали окружения (одинаков на сервере и в браузере)", () => {
    const names = COUNTRIES.slice(1).map((c) => c.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sorted);
  });

  it("флаг собирается из ISO-кода", () => {
    expect(flagEmoji("AM")).toBe("🇦🇲");
    expect(flagEmoji("us")).toBe("🇺🇸");
  });

  it("поиск по ISO без учёта регистра, неизвестное и пустое — undefined", () => {
    expect(countryByIso("am")?.dial).toBe("374");
    expect(countryByIso("ZZ")).toBeUndefined();
    expect(countryByIso(null)).toBeUndefined();
  });

  it("страна по номеру: самый длинный код, общие коды +1/+7 — США и Россия", () => {
    expect(countryByPhone("+37491123456")?.iso).toBe("AM");
    expect(countryByPhone("+995555123456")?.iso).toBe("GE");
    expect(countryByPhone("+79123456789")?.iso).toBe("RU");
    expect(countryByPhone("+12025550123")?.iso).toBe("US");
    expect(countryByPhone("+0000000000")).toBeUndefined();
  });
});
