import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  checkSeedContent,
  checkMigrationContent,
  findSeedFlagGuardLine,
  PROTECTED_MODELS,
  PROTECTED_METHODS,
} from "./check-seed";

const withGuard = (before: string, after: string) => `
async function main() {
  await syncBacklog();
${before}
  const SEED_FLAG = "_seed";
  if ((await db.setting.findUnique({ where: { key: SEED_FLAG } }))) {
    await db.setting.upsert({ where: { key: SEED_FLAG }, create: {}, update: {} });
    return;
  }
${after}
}
`;

describe("findSeedFlagGuardLine", () => {
  it("находит return внутри блока SEED_FLAG", () => {
    const lines = withGuard("", "").split("\n");
    const idx = findSeedFlagGuardLine(lines);
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx].trim()).toBe("return;");
  });

  it("возвращает -1 если блока нет", () => {
    const lines = ["async function main() {", "  await db.review.create({});", "}"];
    expect(findSeedFlagGuardLine(lines)).toBe(-1);
  });
});

describe("checkSeedContent — отзывы", () => {
  it("отзыв ДО блока SEED_FLAG — нарушение", () => {
    const content = withGuard("  await db.review.create({ data: { rating: 5 } });", "");
    const v = checkSeedContent(content);
    expect(v).toHaveLength(1);
    expect(v[0].line).toBeGreaterThan(0);
    expect(v[0].reason).toMatch(/SEED_FLAG/);
  });

  it("отзыв ПОСЛЕ блока SEED_FLAG — проход", () => {
    const content = withGuard("", "  await db.review.create({ data: { rating: 5 } });");
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("db.review.createMany вне блока — нарушение", () => {
    const content = withGuard("  await db.review.createMany({ data: [] });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });
});

describe("checkSeedContent — заказы и визиты", () => {
  it("order.create вне блока — нарушение", () => {
    const content = withGuard("  await db.order.create({ data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("visit.create вне блока — нарушение", () => {
    const content = withGuard("  await db.visit.create({ data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("master.create вне блока — нарушение", () => {
    const content = withGuard("  await db.master.create({ data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });
});

describe("checkSeedContent — мутации (update/delete) вне блока", () => {
  it("master.update вне блока — нарушение (сценарий NOTIFY-2B)", () => {
    const content = withGuard(
      "  await db.master.update({ where: { id: 'x' }, data: { userId: 'owner-id' } });",
      ""
    );
    const v = checkSeedContent(content);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/SEED_FLAG/);
  });

  it("master.update внутри блока — проход (сценарий NOTIFY-2B)", () => {
    const content = withGuard(
      "",
      "  await db.master.update({ where: { id: 'x' }, data: { userId: 'owner-id' } });"
    );
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("master.updateMany вне блока — нарушение", () => {
    const content = withGuard("  await db.master.updateMany({ data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("visit.delete вне блока — нарушение", () => {
    const content = withGuard("  await db.visit.delete({ where: { id: 'x' } });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("order.deleteMany вне блока — нарушение", () => {
    const content = withGuard("  await db.order.deleteMany({ where: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });
});

describe("checkSeedContent — модель user", () => {
  it("user.upsert вне блока — нарушение", () => {
    const content = withGuard(
      "  await db.user.upsert({ where: { phone: '' }, create: {}, update: {} });",
      ""
    );
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("user.upsert внутри блока — проход", () => {
    const content = withGuard(
      "",
      "  await db.user.upsert({ where: { phone: '' }, create: {}, update: {} });"
    );
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("user.update вне блока — нарушение", () => {
    const content = withGuard("  await db.user.update({ where: { id: 'x' }, data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(1);
  });
});

describe("checkSeedContent — чистый seed", () => {
  it("seed без защищённых моделей — проход", () => {
    const content = withGuard(
      "  await db.category.create({ data: {} });",
      "  await db.service.create({ data: {} });"
    );
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("task.update вне блока — проход (не защищённая модель)", () => {
    const content = withGuard("  await db.task.update({ where: { key: 'x' }, data: {} });", "");
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("несколько нарушений — все найдены", () => {
    const content = withGuard(
      "  await db.review.create({});\n  await db.order.create({});",
      ""
    );
    expect(checkSeedContent(content)).toHaveLength(2);
  });

  it("seed без блока SEED_FLAG и с защищённой моделью — нарушение", () => {
    const content = `
async function main() {
  await db.review.create({ data: { rating: 5 } });
}`;
    const v = checkSeedContent(content);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/без защиты SEED_FLAG/);
  });
});

describe("checkSeedContent — исключение seed-gate:owner-only", () => {
  it("db.user.upsert с маркером seed-gate:owner-only вне блока — проход", () => {
    const content = withGuard(
      "  await db.user.upsert({ where: { phone: ownerPhone }, create: {}, update: { role: 'OWNER' } }); // seed-gate:owner-only",
      ""
    );
    expect(checkSeedContent(content)).toHaveLength(0);
  });

  it("db.user.update без маркера вне блока — нарушение (исключение не распространяется на другие строки)", () => {
    const content = withGuard(
      "  await db.user.update({ where: { phone: 'x' }, data: { role: 'OWNER' } }); // не владелец",
      ""
    );
    expect(checkSeedContent(content)).toHaveLength(1);
  });

  it("db.user.upsert без маркера вне блока — нарушение", () => {
    const content = withGuard(
      "  await db.user.upsert({ where: { phone: 'x' }, create: {}, update: {} });",
      ""
    );
    expect(checkSeedContent(content)).toHaveLength(1);
  });
});

describe("синхронизация констант .ts и .mjs", () => {
  const mjsPath = join(process.cwd(), "scripts/check-seed.mjs");
  const mjsContent = readFileSync(mjsPath, "utf8");

  it("PROTECTED_MODELS в .mjs и .ts совпадают", () => {
    const match = mjsContent.match(/const PROTECTED_MODELS\s*=\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const mjsModels = match![1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, "").trim())
      .filter(Boolean);
    expect(mjsModels).toEqual([...PROTECTED_MODELS]);
  });

  it("PROTECTED_METHODS в .mjs и .ts совпадают", () => {
    const match = mjsContent.match(/const PROTECTED_METHODS\s*=\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const mjsMethods = match![1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, "").trim())
      .filter(Boolean);
    expect(mjsMethods).toEqual([...PROTECTED_METHODS]);
  });
});

describe("checkMigrationContent", () => {
  it("INSERT в Review — нарушение", () => {
    const sql = `ALTER TABLE "Review" ADD COLUMN "foo" TEXT;\nINSERT INTO "Review" VALUES ('id', 5);\n`;
    const v = checkMigrationContent(sql, "migration.sql");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/INSERT/);
  });

  it("INSERT в Order — нарушение", () => {
    const sql = `INSERT INTO "Order" ("id") VALUES ('x');\n`;
    expect(checkMigrationContent(sql, "migration.sql")).toHaveLength(1);
  });

  it("INSERT в комментарии — проход", () => {
    const sql = `-- INSERT INTO "Review" VALUES ('id', 5);\nALTER TABLE "Review" ADD COLUMN "foo" TEXT;\n`;
    expect(checkMigrationContent(sql, "migration.sql")).toHaveLength(0);
  });

  it("только DDL — проход", () => {
    const sql = `CREATE TABLE "NewTable" ("id" TEXT);\nALTER TABLE "Review" ADD COLUMN "bar" INT;\n`;
    expect(checkMigrationContent(sql, "migration.sql")).toHaveLength(0);
  });
});
