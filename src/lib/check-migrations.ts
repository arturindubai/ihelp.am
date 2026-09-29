// Логика проверки миграций: парсинг ADD/DROP операций и сравнение со схемой.
// Используется в scripts/check-migrations.mjs (дублирует логику) и в тестах.

export interface ColOp {
  table: string;
  column: string;
}

export interface MigrationInput {
  file: string;
  sql: string;
}

export interface MigrationViolation {
  file: string;
  table: string;
  column: string;
}

/**
 * Извлекает операции добавления колонок из SQL-миграции.
 * ADD COLUMN и CREATE TABLE → [{table, column}].
 */
export function extractColOps(sql: string): ColOp[] {
  const ops: ColOp[] = [];
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // ALTER TABLE "Model" ADD COLUMN "col" TYPE [, ADD COLUMN "col2" TYPE ...]
  const alterParts = clean.split(/\bALTER\s+TABLE\b/i).slice(1);
  for (const part of alterParts) {
    const tm = part.match(/^\s*"([^"]+)"/);
    if (!tm) continue;
    const table = tm[1];
    const end = part.indexOf(';');
    const stmt = end >= 0 ? part.slice(0, end) : part;
    const re = /ADD\s+COLUMN\s+"([^"]+)"/gi;
    let m;
    while ((m = re.exec(stmt))) ops.push({ table, column: m[1] });
  }

  // CREATE TABLE "Model" ( ... )
  const createParts = clean.split(/\bCREATE\s+TABLE\b/i).slice(1);
  for (const part of createParts) {
    const tm = part.match(/^\s*(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
    if (!tm) continue;
    const table = tm[1];
    const open = part.indexOf('(');
    if (open < 0) continue;

    let depth = 0, close = -1;
    for (let i = open; i < part.length; i++) {
      if (part[i] === '(') depth++;
      else if (part[i] === ')') { if (--depth === 0) { close = i; break; } }
    }
    const body = close >= 0 ? part.slice(open + 1, close) : part.slice(open + 1);

    for (const line of body.split('\n')) {
      const t = line.trim().replace(/,\s*$/, '');
      if (!t) continue;
      if (/^(CONSTRAINT|UNIQUE|PRIMARY|CHECK|FOREIGN)\b/i.test(t)) continue;
      const cm = t.match(/^"([^"]+)"\s+\S/);
      if (cm) ops.push({ table, column: cm[1] });
    }
  }

  return ops;
}

/**
 * Извлекает ключи "table:column" удалённых/переименованных колонок.
 * DROP TABLE или RENAME TO (таблица) → "table:*" (все колонки).
 */
export function extractDropOps(sql: string): Set<string> {
  const keys = new Set<string>();
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const alterParts = clean.split(/\bALTER\s+TABLE\b/i).slice(1);
  for (const part of alterParts) {
    const tm = part.match(/^\s*"([^"]+)"/);
    if (!tm) continue;
    const table = tm[1];
    const end = part.indexOf(';');
    const stmt = end >= 0 ? part.slice(0, end) : part;

    // DROP COLUMN "col" / DROP COLUMN IF EXISTS "col"
    const reDropCol = /\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = reDropCol.exec(stmt))) keys.add(`${table}:${m[1]}`);

    // RENAME COLUMN "old" TO "new"
    const reRename = /\bRENAME\s+COLUMN\s+"([^"]+)"\s+TO\b/gi;
    while ((m = reRename.exec(stmt))) keys.add(`${table}:${m[1]}`);

    // ALTER TABLE "old" RENAME TO "new" → вся таблица переименована
    if (/\bRENAME\s+TO\s+"/i.test(stmt)) keys.add(`${table}:*`);
  }

  // DROP TABLE "Model" / DROP TABLE IF EXISTS "Model"
  const reDropTable = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = reDropTable.exec(clean))) keys.add(`${m[1]}:*`);

  return keys;
}

/**
 * Проверяет набор миграций на соответствие схеме Prisma.
 * Колонки, добавленные в одной миграции и удалённые/переименованные в более поздней,
 * расхождением не считаются — вычисляется «чистое» множество ADD-операций.
 */
export function checkMigrationsContent(
  migrations: MigrationInput[],
  models: Record<string, string[]>,
): MigrationViolation[] {
  // Чистое множество: каждый ADD попадает в Map, каждый DROP удаляет из Map.
  // После обработки всех миграций в Map остаются только «живые» столбцы.
  const netAdds = new Map<string, { file: string; table: string; column: string }>();

  for (const { file, sql } of migrations) {
    for (const { table, column } of extractColOps(sql)) {
      netAdds.set(`${table}:${column}`, { file, table, column });
    }
    for (const key of extractDropOps(sql)) {
      if (key.endsWith(':*')) {
        // DROP TABLE или RENAME TO — убираем все столбцы таблицы
        const table = key.slice(0, -2);
        for (const k of netAdds.keys()) {
          if (k.startsWith(`${table}:`)) netAdds.delete(k);
        }
      } else {
        netAdds.delete(key);
      }
    }
  }

  const violations: MigrationViolation[] = [];
  for (const [, { file, table, column }] of netAdds) {
    if (table.startsWith('_')) continue; // implicit m2m-таблицы Prisma
    if (!models[table]) continue; // внешняя таблица, не в схеме
    if (!models[table].includes(column)) {
      violations.push({ file, table, column });
    }
  }
  return violations;
}
