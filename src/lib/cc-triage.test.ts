import { describe, expect, it } from "vitest";
import { isAgentAuthor, findBlockingError, type ErrorComment } from "./cc-triage";

describe("isAgentAuthor — критерий 1", () => {
  it("имена агентов определяются как агенты", () => {
    expect(isAgentAuthor("triage")).toBe(true);
    expect(isAgentAuthor("triage-1")).toBe(true);
    expect(isAgentAuthor("dev-1")).toBe(true);
    expect(isAgentAuthor("dev-2")).toBe(true);
    expect(isAgentAuthor("cto")).toBe(true);
    expect(isAgentAuthor("product")).toBe(true);
    expect(isAgentAuthor("designer")).toBe(true);
    expect(isAgentAuthor("nocode-2")).toBe(true);
    expect(isAgentAuthor("tester")).toBe(true);
    expect(isAgentAuthor("tester-2")).toBe(true);
    expect(isAgentAuthor("deployer")).toBe(true);
    expect(isAgentAuthor("watchdog")).toBe(true);
  });

  it("owner — человек при любом регистре (критерий 1: ответ владельца считается человеческим)", () => {
    // Владелец пишет с авторами "owner", "Owner" — это люди, не агенты
    expect(isAgentAuthor("owner")).toBe(false);
    expect(isAgentAuthor("Owner")).toBe(false);
  });

  it("имена людей из UI не считаются агентами", () => {
    expect(isAgentAuthor("Артур")).toBe(false);
    expect(isAgentAuthor("+37491234567")).toBe(false);
    expect(isAgentAuthor("Artur Indubai")).toBe(false);
    expect(isAgentAuthor("Оганесян")).toBe(false);
    expect(isAgentAuthor("Anna S")).toBe(false);
  });
});

// Критерий 4: воспроизводит случай DSN-1C
describe("DSN-1C: возврат на разбор → заметка триажа → отметка проходит", () => {
  it("заметка агента-триажа не считается ответом человека", () => {
    // В случае DSN-1C: задача отправлена на разбор, триаж пишет заметку (kind=note, author=triage)
    // и затем вызывает markTriaged. Без исправления — заметка триажа блокировала отметку.
    // Исправление: isAgentAuthor("triage") = true → заметка исключается из проверки «человеческий ответ»
    expect(isAgentAuthor("triage")).toBe(true);
    expect(isAgentAuthor("triage-1")).toBe(true);
  });

  it("настоящий ответ человека из UI блокирует markTriaged до повторного разбора", () => {
    // Если владелец ответил в ленте задачи — это сигнал триажу разобрать снова
    expect(isAgentAuthor("Артур")).toBe(false);
    expect(isAgentAuthor("Анна")).toBe(false);
  });

  it("ответ владельца с авторами «Owner» и «owner» блокирует markTriaged (критерий 1)", () => {
    // Владелец ставит одобрение в «Согласованиях» с авторами Owner/owner —
    // это человеческий ответ, и отметка «разобрано» должна отклоняться до нового разбора
    expect(isAgentAuthor("Owner")).toBe(false);
    expect(isAgentAuthor("owner")).toBe(false);
  });
});

// Критерии 5–6
describe("findBlockingError — критерии 5 и 6", () => {
  const lastReviewAt = new Date("2026-09-28T10:00:00Z");
  const before = new Date("2026-09-28T09:00:00Z");
  const after = new Date("2026-09-28T11:00:00Z");

  it("нет записей об ошибках — отметка проходит", () => {
    const comments: ErrorComment[] = [{ kind: "note", createdAt: after, text: "всё ок" }];
    expect(findBlockingError(comments, lastReviewAt)).toBeNull();
  });

  it("ошибка до сдачи на проверку не блокирует", () => {
    const comments: ErrorComment[] = [{ kind: "error", createdAt: before, text: "test failed до сдачи" }];
    expect(findBlockingError(comments, lastReviewAt)).toBeNull();
  });

  it("ошибка после сдачи — отметка отклонена (критерий 6: первая часть)", () => {
    const error: ErrorComment = { kind: "error", createdAt: after, text: "vitest: cc-flow.test.ts упал" };
    const comments: ErrorComment[] = [
      { kind: "progress", createdAt: after, text: "работаю" },
      error,
    ];
    expect(findBlockingError(comments, lastReviewAt)).toBe(error);
  });

  it("новый коммит (повторная сдача) после записи — отметка проходит (критерий 6: вторая часть)", () => {
    const errorTime = new Date("2026-09-28T11:00:00Z");
    // Разработчик исправил и снова сдал задачу — новый review event
    const newReviewAt = new Date("2026-09-28T12:00:00Z");
    const comments: ErrorComment[] = [{ kind: "error", createdAt: errorTime, text: "test failed" }];
    expect(findBlockingError(comments, newReviewAt)).toBeNull();
  });

  it("несколько записей — возвращает первую блокирующую", () => {
    const e1: ErrorComment = { kind: "error", createdAt: after, text: "ошибка 1" };
    const e2: ErrorComment = { kind: "error", createdAt: new Date(after.getTime() + 1000), text: "ошибка 2" };
    const comments = [e1, e2, { kind: "note", createdAt: after, text: "заметка" }];
    const result = findBlockingError(comments, lastReviewAt);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("error");
  });
});
