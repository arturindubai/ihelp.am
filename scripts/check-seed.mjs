#!/usr/bin/env node
/**
 * Проверяет prisma/seed.ts и новые миграции ветки на создание «живых» записей
 * (отзывы, заказы, визиты, мастера) вне блока SEED_FLAG.
 *
 * Код возврата: 0 — чисто; 1 — нарушения найдены.
 * Вызывается из deploy/gate.sh и scripts/check.sh.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Модели, создание записей которых допустимо только внутри блока SEED_FLAG
const PROTECTED_MODELS = ['review', 'order', 'visit', 'master'];

/**
 * Находит 0-based индекс строки `return;`, закрывающей блок SEED_FLAG.
 * Возвращает -1, если блок не найден.
 */
function findSeedFlagGuardLine(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('SEED_FLAG') && lines[i].includes('findUnique')) {
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (/^\s*return;\s*$/.test(lines[j])) return j;
      }
    }
  }
  return -1;
}

/**
 * Проверяет содержимое seed.ts на создание защищённых моделей вне блока SEED_FLAG.
 */
function checkSeedContent(content, fileName) {
  const lines = content.split('\n');
  const guardLine = findSeedFlagGuardLine(lines);
  const violations = [];

  const pattern = new RegExp(
    `\\bdb\\.(${PROTECTED_MODELS.join('|')})\\.(create|createMany|upsert)\\b`,
    'i'
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
            ? 'создание записей без защиты SEED_FLAG'
            : `создание записей до блока SEED_FLAG (строка ${guardLine + 1})`,
      });
    }
  }

  return violations;
}

/**
 * Проверяет SQL-миграцию на INSERT в защищённые таблицы.
 */
function checkMigrationContent(sql, fileName) {
  const lines = sql.split('\n');
  const violations = [];

  const tableNames = PROTECTED_MODELS.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  const pattern = new RegExp(
    `\\bINSERT\\s+INTO\\s+"?(${tableNames.join('|')})"?\\b`,
    'i'
  );

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('--')) continue;
    if (pattern.test(lines[i])) {
      violations.push({
        file: fileName,
        line: i + 1,
        text: lines[i].trim(),
        reason: 'INSERT в защищённую таблицу в миграции',
      });
    }
  }

  return violations;
}

// ── Получение списка миграций для проверки ─────────────────────────────────

function getMigrationFiles() {
  const migrationsDir = path.join(root, 'prisma/migrations');
  // На хосте (gate.sh): проверяем только новые миграции ветки vs main.
  // В контейнере без git (check.sh): проверяем все.
  try {
    const diff = execSync('git diff main --name-only -- prisma/migrations/ 2>/dev/null', {
      encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const files = diff.split('\n')
      .filter((f) => f.endsWith('migration.sql'))
      .map((f) => path.join(root, f))
      .filter((f) => existsSync(f));
    if (files.length > 0) return files;
  } catch { /* git недоступен или ветка совпадает с main */ }

  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .sort()
    .filter((d) => existsSync(path.join(migrationsDir, d, 'migration.sql')))
    .map((d) => path.join(migrationsDir, d, 'migration.sql'));
}

// ── Main ───────────────────────────────────────────────────────────────────

let fail = 0;
const allViolations = [];

// 1. Проверка prisma/seed.ts
const seedPath = path.join(root, 'prisma/seed.ts');
if (existsSync(seedPath)) {
  const content = readFileSync(seedPath, 'utf8');
  const seedViolations = checkSeedContent(content, 'prisma/seed.ts');
  allViolations.push(...seedViolations);
} else {
  process.stdout.write('  ⚠ prisma/seed.ts не найден — пропускаю\n');
}

// 2. Проверка миграций
const migFiles = getMigrationFiles();
for (const f of migFiles) {
  const sql = readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  allViolations.push(...checkMigrationContent(sql, rel));
}

if (allViolations.length === 0) {
  process.stdout.write('  ✓ демо-данные не создаются вне блока SEED_FLAG\n');
} else {
  fail = 1;
  for (const v of allViolations) {
    process.stderr.write(`  ✗ ${v.file}:${v.line}: ${v.reason}\n`);
    process.stderr.write(`    ${v.text}\n`);
  }
}

process.exit(fail);
