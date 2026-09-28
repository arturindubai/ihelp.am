import { describe, it, expect } from "vitest";
import { calcOutcome, needsLoginPause } from "./dispatch-pause";

describe("calcOutcome", () => {
  it("done — успешный запуск без ошибок", () => {
    expect(calcOutcome({ result: "Задача выполнена, DEV-72 сдана.", is_error: false }, false)).toBe("done");
  });

  it("done — успешный запуск с OAuth, /login, 401 в тексте отчёта", () => {
    // критерий 2: слова в тексте успешного запуска не дают «failed»
    expect(
      calcOutcome(
        { result: "Добавил OAuth-вход, /login endpoint, 401 обрабатывается правильно.", is_error: false },
        false,
      ),
    ).toBe("done");
  });

  it("permission_blocked — команда cc.mjs review отклонена правами (en)", () => {
    expect(
      calcOutcome(
        { result: "scripts/cc.mjs review DEV-72 '...'\nTool use denied by permission rule", is_error: false },
        false,
      ),
    ).toBe("permission_blocked");
  });

  it("permission_blocked — команда cc.mjs note отклонена, слово «заблокирован»", () => {
    // критерий 3: слово «заблокирован» должно распознаваться
    expect(
      calcOutcome(
        { result: "cc.mjs note DEV-72 'итог'\nОперация заблокирован правами хука", is_error: false },
        false,
      ),
    ).toBe("permission_blocked");
  });

  it("permission_blocked — команда cc.mjs done отклонена", () => {
    expect(
      calcOutcome(
        { result: "scripts/cc.mjs done DEV-72\nPermission denied", is_error: false },
        false,
      ),
    ).toBe("permission_blocked");
  });

  it("failed — is_error=true", () => {
    expect(calcOutcome({ result: "", is_error: true }, false)).toBe("failed");
  });

  it("failed — нет результата, время не превышено", () => {
    // критерий 6: запись закрывается даже без итога
    expect(calcOutcome(null, false)).toBe("failed");
  });

  it("timeout — нет результата, время превышено (killed=true)", () => {
    expect(calcOutcome(null, true)).toBe("timeout");
  });

  it("limit — сообщение о лимите подписки", () => {
    expect(calcOutcome({ result: "usage limit reached|1759000000", is_error: true }, false)).toBe("limit");
  });

  it("limit — weekly limit", () => {
    expect(calcOutcome({ result: "weekly limit exceeded", is_error: true }, false)).toBe("limit");
  });

  it("failed — error_max_turns", () => {
    expect(calcOutcome({ result: "", subtype: "error_max_turns", is_error: false }, false)).toBe("failed");
  });
});

describe("needsLoginPause", () => {
  it("не ставит паузу при done со словами login/oauth/401 в тексте", () => {
    // критерий 1 и 2: успешный запуск не вызывает паузу
    expect(needsLoginPause("done", "Сделал /login, OAuth интеграция, 401 теперь возвращает JSON")).toBe(false);
  });

  it("ставит паузу при failed + not logged in", () => {
    expect(needsLoginPause("failed", "not logged in: нет подписки Claude")).toBe(true);
  });

  it("ставит паузу при failed + authentication_error", () => {
    expect(needsLoginPause("failed", "authentication_error: invalid session")).toBe(true);
  });

  it("ставит паузу при failed + /login", () => {
    expect(needsLoginPause("failed", "/login required to continue")).toBe(true);
  });

  it("ставит паузу при failed + oauth", () => {
    expect(needsLoginPause("failed", "oauth token expired")).toBe(true);
  });

  it("ставит паузу при failed + 401", () => {
    expect(needsLoginPause("failed", "error 401 unauthorized")).toBe(true);
  });

  it("ставит паузу при timeout + ошибка входа", () => {
    expect(needsLoginPause("timeout", "failed to authenticate")).toBe(true);
  });

  it("не ставит паузу при permission_blocked", () => {
    // права — другая причина, не ошибка входа
    expect(needsLoginPause("permission_blocked", "oauth /login 401")).toBe(false);
  });

  it("не ставит паузу при limit", () => {
    expect(needsLoginPause("limit", "usage limit")).toBe(false);
  });

  it("не ставит паузу при failed без ошибки входа", () => {
    expect(needsLoginPause("failed", "задача не завершена, тип не проверить")).toBe(false);
  });
});
