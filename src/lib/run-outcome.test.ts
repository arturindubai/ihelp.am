import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { LIMIT_PATTERN, isLimitOutcome, runOutcome } from "./workers";

describe("исход запуска: лимит подписки (DEV-113)", () => {
  it("успешный отчёт со словами «rate limit» — «сделано», паузы нет (случай CONTENT-8, 29.09)", () => {
    const report = "Задача сдана на проверку. Безопасность action: rate limit 20 заявок/IP/час";
    expect(runOutcome({ is_error: false, result: report }, 0)).toBe("done");
    expect(isLimitOutcome({ is_error: false, result: report })).toBe(false);
  });

  it("успешный отчёт со словами «usage limit» и «limit reached» — «сделано»", () => {
    expect(runOutcome({ is_error: false, result: "Исправлена обработка usage limit reached в диспетчере" }, 0)).toBe("done");
  });

  it("ошибочный ответ Claude о лимите — «лимит»", () => {
    expect(runOutcome({ is_error: true, result: "Claude AI usage limit reached|1759000000" }, 1)).toBe("limit");
  });

  it("результата нет, сообщение о лимите в выводе ошибок — «лимит»", () => {
    expect(runOutcome(null, 1, "You have hit your 5-hour limit")).toBe("limit");
    expect(runOutcome(null, 1, "segfault")).toBe("failed");
    expect(runOutcome(null, null)).toBe("timeout");
  });

  it("ошибочный запуск без слов о лимите — «ошибка»", () => {
    expect(runOutcome({ is_error: true, result: "Request timed out" }, 1)).toBe("failed");
  });

  it("диспетчер применяет то же условие: только для ошибочного запуска и с тем же выражением", () => {
    const src = readFileSync(path.resolve(__dirname, "../../scripts/dispatcher.mjs"), "utf8");
    expect(src).toContain("(!result || result.is_error) && /" + LIMIT_PATTERN.source + "/i.test(text)");
  });
});
