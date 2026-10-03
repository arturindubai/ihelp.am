import { describe, expect, it } from "vitest";
import { flowOf, intakeTitle, laneOf, nextIntakeKey, trackDefault, weekStart } from "./cc-lanes";

describe("дорожки бэклога (trackDefault — правило умолчания)", () => {
  it("входящие: prefix IN и source=intake → inbox", () => {
    expect(trackDefault({ key: "IN-3", layer: "none" })).toBe("inbox");
    expect(trackDefault({ key: "IN-70", layer: "none", source: "intake" })).toBe("inbox");
    expect(trackDefault({ key: "AUTH-5", layer: "back", source: "intake" })).toBe("inbox");
  });
  it("ошибки и аудит: BUG/AUD/RISK → bugs", () => {
    expect(trackDefault({ key: "BUG-1", layer: "back" })).toBe("bugs");
    expect(trackDefault({ key: "AUD-5", layer: "back" })).toBe("bugs");
    expect(trackDefault({ key: "RISK-1", layer: "infra" })).toBe("bugs");
  });
  it("дизайн: prefix DSN → design", () => {
    expect(trackDefault({ key: "DSN-1", layer: "front" })).toBe("design");
    expect(trackDefault({ key: "DSN-15", layer: "none" })).toBe("design");
  });
  it("бизнес: area legal/pay/team/seo → business (независимо от слоя)", () => {
    expect(trackDefault({ key: "LEGAL-4", layer: "none", area: "legal" })).toBe("business");
    expect(trackDefault({ key: "PAY-3", layer: "none", area: "pay" })).toBe("business");
    expect(trackDefault({ key: "TEAM-2", layer: "none", area: "team" })).toBe("business");
    expect(trackDefault({ key: "SEO-2", layer: "back", area: "seo" })).toBe("business");
  });
  it("бизнес: layer=none, owner=product → business", () => {
    expect(trackDefault({ key: "CONTENT-1", layer: "none", area: "content", owner: "product" })).toBe("business");
    expect(trackDefault({ key: "COMP-35", layer: "none", area: "product", owner: "product" })).toBe("business");
  });
  it("продукт: layer=none, owner=tech → product", () => {
    expect(trackDefault({ key: "NOTIFY-11", layer: "none", area: "notify", owner: "tech" })).toBe("product");
    expect(trackDefault({ key: "FLOW-11", layer: "none", area: "product", owner: "tech" })).toBe("product");
  });
  it("разработка: код-задачи и инфра → dev", () => {
    expect(trackDefault({ key: "AUTH-11", layer: "fullstack" })).toBe("dev");
    expect(trackDefault({ key: "INFRA-1", layer: "infra" })).toBe("dev");
    expect(trackDefault({ key: "DB-4", layer: "back" })).toBe("dev");
    expect(trackDefault({ key: "AUTH-4", layer: "front" })).toBe("dev");
  });
});

describe("laneOf — явное значение из Task.track", () => {
  it("явный track из базы имеет приоритет над правилом умолчания", () => {
    // DSN-1 по умолчанию → design, но если вручную назначен dev — берём dev
    expect(laneOf({ key: "DSN-1", layer: "front", track: "dev" })).toBe("dev");
    // IN-5 по умолчанию → inbox, но явно назначен product
    expect(laneOf({ key: "IN-5", layer: "none", track: "product" })).toBe("product");
  });
  it("если track=null/undefined — применяется правило умолчания", () => {
    expect(laneOf({ key: "AUTH-11", layer: "fullstack", track: null })).toBe("dev");
    expect(laneOf({ key: "IN-3", layer: "none" })).toBe("inbox");
  });
  it("неизвестное значение track игнорируется, применяется правило умолчания", () => {
    expect(laneOf({ key: "AUTH-11", layer: "fullstack", track: "unknown" })).toBe("dev");
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
