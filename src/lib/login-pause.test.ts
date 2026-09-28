import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { describe, it, expect } from "vitest";
import { needsLoginPause, LOGIN_PAUSE_STATUSES } from "./login-pause";

const dir = dirname(fileURLToPath(import.meta.url));

describe("пауза «не вошли в Claude»", () => {
  it("успешный запуск со словами про вход паузу не вызывает", () => {
    // Случай 28.09 14:32: отчёт тестировщика по входу через Google
    expect(needsLoginPause("done", "AUTH-8 — pass. OAuth-клиент задокументирован, вход владельца проверен")).toBe(false);
    // Случай 28.09 11:15: отчёт разработчика о задаче про сами ложные паузы
    expect(needsLoginPause("done", "успешный запуск с OAuth/401 в отчёте паузу не вызывает, /login")).toBe(false);
  });

  it("запуск, сорванный правами или остановленный человеком, паузу не вызывает", () => {
    expect(needsLoginPause("permission_blocked", "OAuth 401")).toBe(false);
    expect(needsLoginPause("stopped", "not logged in")).toBe(false);
    expect(needsLoginPause("limit", "authentication_error")).toBe(false);
  });

  it("ошибочный запуск со словами про вход вызывает паузу", () => {
    expect(needsLoginPause("failed", "Error: not logged in. Run /login")).toBe(true);
    expect(needsLoginPause("failed", "API Error: 401 authentication_error")).toBe(true);
    expect(needsLoginPause("timeout", "failed to authenticate")).toBe(true);
  });

  it("ошибочный запуск без слов про вход паузу не вызывает", () => {
    expect(needsLoginPause("failed", "vitest: 3 теста упали")).toBe(false);
    // 401 внутри другого числа — не признак
    expect(needsLoginPause("failed", "обработано 14012 строк")).toBe(false);
  });

  it("диспетчер проверяет статус запуска перед поиском слов про вход", () => {
    const p = resolve(dir, "../../scripts/dispatcher.mjs");
    if (!existsSync(p)) return; // scripts/ не смонтирован — пропускаем
    const src = readFileSync(p, "utf-8");
    const line = src.split("\n").find((l) => l.includes("not logged in"));
    expect(line, "в диспетчере есть условие паузы по входу").toBeTruthy();
    for (const s of LOGIN_PAUSE_STATUSES) expect(line, `условие проверяет статус ${s}`).toContain(`"${s}"`);
  });
});
