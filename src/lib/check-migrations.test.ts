import { describe, it, expect } from "vitest";
import {
  extractColOps,
  extractDropOps,
  checkMigrationsContent,
} from "./check-migrations";

describe("extractColOps", () => {
  it("находит ADD COLUMN", () => {
    const sql = `ALTER TABLE "User" ADD COLUMN "status" TEXT;`;
    expect(extractColOps(sql)).toEqual([{ table: "User", column: "status" }]);
  });

  it("находит несколько ADD COLUMN в одном ALTER TABLE", () => {
    const sql = `ALTER TABLE "User" ADD COLUMN "a" TEXT, ADD COLUMN "b" INT;`;
    const cols = extractColOps(sql).map((o) => o.column);
    expect(cols).toEqual(["a", "b"]);
  });

  it("находит CREATE TABLE и извлекает столбцы", () => {
    const sql = `CREATE TABLE "Foo" (\n  "id" TEXT NOT NULL,\n  "bar" INT\n);`;
    const ops = extractColOps(sql);
    expect(ops.map((o) => o.column)).toEqual(["id", "bar"]);
  });

  it("игнорирует строчные комментарии", () => {
    const sql = `-- ALTER TABLE "Foo" ADD COLUMN "ghost" TEXT;\nALTER TABLE "Foo" ADD COLUMN "real" TEXT;`;
    expect(extractColOps(sql)).toEqual([{ table: "Foo", column: "real" }]);
  });

  it("пропускает CONSTRAINT и PRIMARY KEY в CREATE TABLE", () => {
    const sql = `CREATE TABLE "T" (\n  "id" TEXT,\n  CONSTRAINT "pk" PRIMARY KEY ("id")\n);`;
    expect(extractColOps(sql).map((o) => o.column)).toEqual(["id"]);
  });
});

describe("extractDropOps", () => {
  it("находит DROP COLUMN", () => {
    const sql = `ALTER TABLE "User" DROP COLUMN "status";`;
    expect(extractDropOps(sql).has("User:status")).toBe(true);
  });

  it("находит DROP COLUMN IF EXISTS", () => {
    const sql = `ALTER TABLE "User" DROP COLUMN IF EXISTS "status";`;
    expect(extractDropOps(sql).has("User:status")).toBe(true);
  });

  it("находит DROP TABLE", () => {
    const sql = `DROP TABLE "OldModel";`;
    expect(extractDropOps(sql).has("OldModel:*")).toBe(true);
  });

  it("находит DROP TABLE IF EXISTS", () => {
    const sql = `DROP TABLE IF EXISTS "OldModel";`;
    expect(extractDropOps(sql).has("OldModel:*")).toBe(true);
  });

  it("находит RENAME COLUMN — старое имя помечается удалённым", () => {
    const sql = `ALTER TABLE "User" RENAME COLUMN "oldName" TO "newName";`;
    expect(extractDropOps(sql).has("User:oldName")).toBe(true);
    expect(extractDropOps(sql).has("User:newName")).toBe(false);
  });

  it("находит ALTER TABLE RENAME TO — таблица помечается удалённой", () => {
    const sql = `ALTER TABLE "OldTable" RENAME TO "NewTable";`;
    expect(extractDropOps(sql).has("OldTable:*")).toBe(true);
  });
});

describe("checkMigrationsContent — критерий 1 и 2", () => {
  it("добавленная и удалённая колонка не даёт расхождения (критерий 1)", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `ALTER TABLE "User" ADD COLUMN "temp" TEXT;`,
      },
      {
        file: "002/migration.sql",
        sql: `ALTER TABLE "User" DROP COLUMN "temp";`,
      },
    ];
    const models: Record<string, string[]> = { User: ["id", "name"] };
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("опечатка в имени колонки при схеме без неё — расхождение (критерий 2)", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `ALTER TABLE "User" ADD COLUMN "nme" TEXT;`,
      },
    ];
    const models: Record<string, string[]> = { User: ["id", "name"] };
    const violations = checkMigrationsContent(migrations, models);
    expect(violations).toHaveLength(1);
    expect(violations[0].column).toBe("nme");
  });

  it("правильная колонка в схеме — нет расхождения", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `ALTER TABLE "User" ADD COLUMN "name" TEXT;`,
      },
    ];
    const models: Record<string, string[]> = { User: ["id", "name"] };
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("таблица удалена целиком — все её столбцы не проверяются", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `CREATE TABLE "OldModel" (\n  "id" TEXT,\n  "data" TEXT\n);`,
      },
      {
        file: "002/migration.sql",
        sql: `DROP TABLE "OldModel";`,
      },
    ];
    const models: Record<string, string[]> = {};
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("переименование таблицы убирает старые столбцы из проверки", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `CREATE TABLE "OldTable" (\n  "id" TEXT,\n  "col" TEXT\n);`,
      },
      {
        file: "002/migration.sql",
        sql: `ALTER TABLE "OldTable" RENAME TO "NewTable";\nCREATE TABLE "NewTable" (\n  "id" TEXT,\n  "col" TEXT\n);`,
      },
    ];
    const models: Record<string, string[]> = { NewTable: ["id", "col"] };
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("колонка переименована — старое имя не проверяется, новое проверяется", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `ALTER TABLE "User" ADD COLUMN "oldCol" TEXT;`,
      },
      {
        file: "002/migration.sql",
        sql: `ALTER TABLE "User" RENAME COLUMN "oldCol" TO "newCol";\nALTER TABLE "User" ADD COLUMN "newCol" TEXT;`,
      },
    ];
    const models: Record<string, string[]> = { User: ["id", "newCol"] };
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("implicit m2m-таблицы Prisma (начинаются с _) не проверяются", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `CREATE TABLE "_CategoryToService" (\n  "A" TEXT,\n  "B" TEXT\n);`,
      },
    ];
    const models: Record<string, string[]> = {};
    expect(checkMigrationsContent(migrations, models)).toHaveLength(0);
  });

  it("несколько нарушений — все найдены", () => {
    const migrations = [
      {
        file: "001/migration.sql",
        sql: `ALTER TABLE "User" ADD COLUMN "bage" TEXT;\nALTER TABLE "User" ADD COLUMN "emal" TEXT;`,
      },
    ];
    const models: Record<string, string[]> = { User: ["id", "badge", "email"] };
    const violations = checkMigrationsContent(migrations, models);
    expect(violations).toHaveLength(2);
  });
});
