import { describe, expect, it } from "vitest";
import { sectionsFor, sectionsForUser, DELEGATABLE_SECTIONS } from "./adminAccess";

describe("sectionsFor", () => {
  it("OPERATOR имеет 5 базовых разделов", () => {
    expect(sectionsFor("OPERATOR")).toEqual(["dashboard", "orders", "schedule", "clients", "reviews"]);
  });

  it("OWNER включает settings и staff", () => {
    const s = sectionsFor("OWNER");
    expect(s).toContain("settings");
    expect(s).toContain("staff");
  });

  it("ADMIN не имеет settings и staff", () => {
    const s = sectionsFor("ADMIN");
    expect(s).not.toContain("settings");
    expect(s).not.toContain("staff");
  });
});

describe("sectionsForUser — дельта", () => {
  it("null дельта = базовая роль", () => {
    const s = sectionsForUser({ role: "OPERATOR", sectionDelta: null });
    expect(s).toEqual(sectionsFor("OPERATOR"));
  });

  it("дельта добавляет раздел выше базы роли", () => {
    const s = sectionsForUser({ role: "OPERATOR", sectionDelta: { added: ["services"], removed: [] } });
    expect(s).toContain("services");
    expect(s).toContain("dashboard");
  });

  it("дельта убирает раздел из базы роли", () => {
    const s = sectionsForUser({ role: "ADMIN", sectionDelta: { added: [], removed: ["analytics"] } });
    expect(s).not.toContain("analytics");
    expect(s).toContain("dashboard");
  });

  it("дельта не добавляет settings или staff для не-OWNER", () => {
    const s = sectionsForUser({ role: "ADMIN", sectionDelta: { added: ["settings", "staff"], removed: [] } });
    expect(s).not.toContain("settings");
    expect(s).not.toContain("staff");
  });

  it("дельта не может удалить settings и staff у OWNER", () => {
    const s = sectionsForUser({ role: "OWNER", sectionDelta: { added: [], removed: ["settings", "staff"] } });
    expect(s).toContain("settings");
    expect(s).toContain("staff");
  });

  it("дельта не дублирует уже существующие разделы", () => {
    const s = sectionsForUser({ role: "ADMIN", sectionDelta: { added: ["dashboard"], removed: [] } });
    expect(s.filter((x) => x === "dashboard")).toHaveLength(1);
  });

  it("некорректная дельта игнорируется", () => {
    const s = sectionsForUser({ role: "OPERATOR", sectionDelta: "broken" });
    expect(s).toEqual(sectionsFor("OPERATOR"));
  });

  it("403: OPERATOR без права на services получает пустой список для этого раздела", () => {
    const sections = sectionsForUser({ role: "OPERATOR", sectionDelta: null });
    expect(sections.includes("services")).toBe(false);
  });

  it("403: OPERATOR с явно снятым dashboard теряет доступ", () => {
    const sections = sectionsForUser({ role: "OPERATOR", sectionDelta: { added: [], removed: ["dashboard"] } });
    expect(sections.includes("dashboard")).toBe(false);
  });
});

describe("DELEGATABLE_SECTIONS", () => {
  it("содержит ровно 15 разделов", () => {
    expect(DELEGATABLE_SECTIONS).toHaveLength(15);
  });

  it("не содержит settings и staff", () => {
    expect(DELEGATABLE_SECTIONS).not.toContain("settings");
    expect(DELEGATABLE_SECTIONS).not.toContain("staff");
  });
});

describe("статический анализ: маршруты используют sectionsForUser, а не sectionsFor(u.role)", () => {
  const ROUTES = [
    "src/app/api/cc/library/route.ts",
    "src/app/api/cc/upload/route.ts",
    "src/app/api/upload/route.ts",
  ];

  it("ни один маршрут не содержит sectionsFor(u.role)", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.resolve(__dirname, "../..");
    for (const rel of ROUTES) {
      const content = fs.readFileSync(path.resolve(root, rel), "utf8");
      expect(content, rel).not.toMatch(/sectionsFor\(u\.role\)/);
    }
  });

  it("каждый маршрут вызывает sectionsForUser(u)", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.resolve(__dirname, "../..");
    for (const rel of ROUTES) {
      const content = fs.readFileSync(path.resolve(root, rel), "utf8");
      expect(content, rel).toMatch(/sectionsForUser\(u\)/);
    }
  });
});
