// Статический анализ prisma/seed.ts и миграций: создание «живых» записей вне блока SEED_FLAG.
// Используется в deploy/gate.sh через scripts/check-seed.mjs и в тестах.

export interface SeedViolation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

// Модели, создание записей которых допустимо только внутри блока SEED_FLAG
export const PROTECTED_MODELS = ["review", "order", "visit", "master"] as const;

/**
 * Находит 0-based индекс строки `return;`, закрывающей блок SEED_FLAG в seed.ts.
 * Это строка внутри `if (... SEED_FLAG ... findUnique ...) { ... return; }`.
 * Возвращает -1, если блок не найден.
 */
export function findSeedFlagGuardLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("SEED_FLAG") && lines[i].includes("findUnique")) {
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (/^\s*return;\s*$/.test(lines[j])) return j;
      }
    }
  }
  return -1;
}

/**
 * Проверяет содержимое seed.ts на создание защищённых моделей вне блока SEED_FLAG.
 * Нарушение: db.review.create / db.order.create / db.visit.create / db.master.create
 * встречается до строки `return;` блока SEED_FLAG.
 */
export function checkSeedContent(content: string, fileName = "prisma/seed.ts"): SeedViolation[] {
  const lines = content.split("\n");
  const guardLine = findSeedFlagGuardLine(lines);
  const violations: SeedViolation[] = [];

  const pattern = new RegExp(
    `\\bdb\\.(${PROTECTED_MODELS.join("|")})\\.(create|createMany|upsert)\\b`,
    "i"
  );

  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue;
    const outsideGuard = guardLine === -1 || i < guardLine;
    if (outsideGuard) {
      violations.push({
        file: fileName,
        line: i + 1,
        text: lines[i].trim(),
        reason:
          guardLine === -1
            ? "создание записей без защиты SEED_FLAG"
            : `создание записей до блока SEED_FLAG (строка ${guardLine + 1})`,
      });
    }
  }

  return violations;
}

/**
 * Проверяет SQL-миграцию на INSERT в защищённые таблицы.
 * Прямые INSERT в миграциях создают «живые» записи при каждой свежей выкладке.
 */
export function checkMigrationContent(sql: string, fileName: string): SeedViolation[] {
  const lines = sql.split("\n");
  const violations: SeedViolation[] = [];

  const tableNames = PROTECTED_MODELS.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  const pattern = new RegExp(`\\bINSERT\\s+INTO\\s+"?(${tableNames.join("|")})"?\\b`, "i");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("--")) continue;
    if (pattern.test(lines[i])) {
      violations.push({
        file: fileName,
        line: i + 1,
        text: lines[i].trim(),
        reason: "INSERT в защищённую таблицу в миграции",
      });
    }
  }

  return violations;
}
