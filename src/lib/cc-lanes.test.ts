import { describe, expect, it } from "vitest";
import { flowOf, intakeTitle, laneOf, nextIntakeKey, weekStart } from "./cc-lanes";

describe("дорожки бэклога", () => {
  it("по ключу и слою: входящие, дизайн, ошибки, продукт, инфраструктура, разработка", () => {
    expect(laneOf({ key: "IN-3", layer: "none" })).toBe("inbox");
    expect(laneOf({ key: "DSN-1", layer: "front" })).toBe("design");
    expect(laneOf({ key: "AUD-5", layer: "back" })).toBe("bugs");
    expect(laneOf({ key: "LEGAL-2", layer: "none" })).toBe("product");
    expect(laneOf({ key: "INFRA-1", layer: "infra" })).toBe("infra");
    expect(laneOf({ key: "AUTH-11", layer: "fullstack" })).toBe("dev");
  });
});

describe("этап потока", () => {
  it("бэклог без триажа ждёт триажа, после триажа — просто бэклог", () => {
    expect(flowOf({ status: "backlog", layer: "back" })).toBe("triage");
    expect(flowOf({ status: "backlog", layer: "back", triagedAt: new Date() })).toBe("backlog");
  });
  it("проверка: не-код — к владельцу, код без отметки — на тест, с отметкой — к деплоеру", () => {
    expect(flowOf({ status: "review", layer: "none" })).toBe("owner");
    expect(flowOf({ status: "review", layer: "back" })).toBe("testing");
    expect(flowOf({ status: "review", layer: "back", testedSha: "abc" })).toBe("deployer");
    // Отметка на старом коммите: диспетчер знает, что ветка ушла вперёд
    expect(flowOf({ status: "review", layer: "back", testedSha: "abc" }, false)).toBe("testing");
  });
  it("блокировка на владельце или продукте — «нужен владелец», прочие — «заблокирована»", () => {
    expect(flowOf({ status: "blocked", layer: "back", blockedOn: "owner" })).toBe("owner");
    expect(flowOf({ status: "blocked", layer: "back", blockedOn: "product" })).toBe("owner");
    expect(flowOf({ status: "blocked", layer: "back", blockedOn: "deps" })).toBe("blocked");
  });
});

describe("входящие", () => {
  it("следующий ключ IN-N и заголовок из первой строки", () => {
    expect(nextIntakeKey([])).toBe("IN-1");
    expect(nextIntakeKey(["IN-2", "IN-10", "AUTH-99"])).toBe("IN-11");
    expect(intakeTitle("  Сделать   кнопку\nподробности")).toBe("Сделать кнопку");
    expect(intakeTitle("баг")).toBe("Входящее: баг");
    expect(intakeTitle("а".repeat(200)).length).toBe(118);
  });
  it("неделя начинается в понедельник по Еревану", () => {
    // Воскресенье 23:30 по Еревану — ещё прошлая неделя
    expect(weekStart(new Date("2026-09-27T19:30:00Z")).toISOString()).toBe("2026-09-20T20:00:00.000Z");
    expect(weekStart(new Date("2026-09-27T20:30:00Z")).toISOString()).toBe("2026-09-27T20:00:00.000Z");
  });
});
