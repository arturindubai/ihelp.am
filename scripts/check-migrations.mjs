#!/usr/bin/env node
/**
 * Проверяет соответствие имён столбцов схеме Prisma.
 *
 * Режимы:
 *   (без флагов) — статическая: имена столбцов в миграциях совпадают с полями schema.prisma
 *   --db          — динамическая: все поля Task, Epic, WorkerRun из schema.prisma реально есть в базе
 *                   (использует docker exec homecare-db-1, запускать с хоста из deploy/smoke.sh)
 *
 * Код возврата: 0 — всё в порядке; 1 — найдены несовпадения.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'prisma/schema.prisma');
const migrationsDir = path.join(root, 'prisma/migrations');
const dbMode = process.argv.includes('--db');

// ── Парсинг schema.prisma ──────────────────────────────────────────────────

const SCALAR_TYPES = new Set([
  'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json',
  'Decimal', 'BigInt', 'Bytes',
]);

function parseSchema() {
  const text = readFileSync(schemaPath, 'utf8');
  const modelNames = new Set();
  const models = {}; // { ModelName: string[] }

  for (const line of text.split('\n')) {
    const m = line.trim().match(/^model\s+(\w+)\s*\{/);
    if (m) modelNames.add(m[1]);
  }

  let current = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    const mStart = t.match(/^model\s+(\w+)\s*\{/);
    if (mStart) { current = mStart[1]; models[current] = []; continue; }
    if (t === '}') { current = null; continue; }
    if (!current || !t || t.startsWith('//') || t.startsWith('///') || t.startsWith('@@')) continue;

    const f = t.match(/^(\w+)\s+(\S+)/);
    if (!f) continue;
    const [, fieldName, rawType] = f;

    // Поля с @relation — не столбцы в базе
    if (t.includes('@relation')) continue;
    // Поля, тип которых — другая модель — тоже не столбцы
    const base = rawType.replace(/[[\]?]/g, '');
    if (modelNames.has(base)) continue;

    // @map("db_name") — реальное имя столбца в базе отличается от поля в схеме
    const mapMatch = t.match(/@map\("([^"]+)"\)/);
    models[current].push(mapMatch ? mapMatch[1] : fieldName);
  }

  return models;
}

// ── Режим --db: проверяет наличие всех полей Task/Epic/WorkerRun в базе ────

function checkDb(models) {
  const targets = ['Task', 'Epic', 'WorkerRun'];
  let fail = 0;

  for (const model of targets) {
    const cols = models[model];
    if (!cols || cols.length === 0) {
      process.stderr.write(`  ✗ модель ${model} не найдена в schema.prisma\n`);
      fail = 1;
      continue;
    }

    const colList = cols.map(c => `"${c}"`).join(', ');
    const sql = `SELECT ${colList} FROM "${model}" LIMIT 0`;

    const result = spawnSync(
      'docker',
      ['exec', 'homecare-db-1', 'psql', '-U', 'app', '-d', 'homeservices',
       '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql],
      { encoding: 'utf8' },
    );

    if (result.status !== 0) {
      const errLine = (result.stderr || result.stdout || '')
        .split('\n')
        .find(l => /ERROR/.test(l)) || 'ошибка psql';
      process.stderr.write(`  ✗ ${model}: ${errLine.trim()}\n`);
      fail = 1;
    } else {
      process.stdout.write(`  ✓ ${model}: все ${cols.length} полей есть в базе\n`);
    }
  }

  return fail;
}

// ── Режим статический: имена столбцов в миграциях vs схема ────────────────

function getMigrationFiles() {
  // В Docker-контейнере (check.sh) git недоступен — проверяем все миграции.
  // На хосте (gate.sh) — только новые (добавленные в ветке vs main).
  try {
    const diff = execSync('git diff main --name-only -- prisma/migrations/ 2>/dev/null', {
      encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const files = diff.split('\n')
      .filter(f => f.endsWith('migration.sql'))
      .map(f => path.join(root, f))
      .filter(f => existsSync(f));
    if (files.length > 0) return files;
  } catch { /* git недоступен или ветка совпадает с main */ }

  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .sort()
    .filter(d => existsSync(path.join(migrationsDir, d, 'migration.sql')))
    .map(d => path.join(migrationsDir, d, 'migration.sql'));
}

/**
 * Извлекает операции с колонками из SQL-миграции.
 * Возвращает [{ table, column }].
 */
function extractColOps(sql) {
  const ops = [];
  // Убираем комментарии
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // ALTER TABLE "Model" ADD COLUMN "col" TYPE [, ADD COLUMN "col2" TYPE ...]
  // Prisma генерирует их как один ALTER TABLE, заканчивающийся на ;
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

  // CREATE TABLE "Model" ( ... );
  const createParts = clean.split(/\bCREATE\s+TABLE\b/i).slice(1);
  for (const part of createParts) {
    const tm = part.match(/^\s*(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
    if (!tm) continue;
    const table = tm[1];
    const open = part.indexOf('(');
    if (open < 0) continue;

    // Ищем закрывающую скобку с учётом вложенности
    let depth = 0, close = -1;
    for (let i = open; i < part.length; i++) {
      if (part[i] === '(') depth++;
      else if (part[i] === ')') { if (--depth === 0) { close = i; break; } }
    }
    const body = close >= 0 ? part.slice(open + 1, close) : part.slice(open + 1);

    for (const line of body.split('\n')) {
      const t = line.trim().replace(/,\s*$/, '');
      if (!t) continue;
      // Пропускаем CONSTRAINT, UNIQUE, PRIMARY KEY и т.п.
      if (/^(CONSTRAINT|UNIQUE|PRIMARY|CHECK|FOREIGN)\b/i.test(t)) continue;
      // Определение столбца: "colName" TYPE
      const cm = t.match(/^"([^"]+)"\s+\S/);
      if (cm) ops.push({ table, column: cm[1] });
    }
  }

  return ops;
}

function checkMigrations(models) {
  const files = getMigrationFiles();
  if (files.length === 0) {
    process.stdout.write('  ✓ нет миграций для проверки\n');
    return 0;
  }

  let fail = 0;
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    const ops = extractColOps(sql);
    const rel = path.relative(root, file);
    for (const { table, column } of ops) {
      if (table.startsWith('_')) continue; // Implicit m2m-таблицы Prisma
      if (!models[table]) continue; // Таблица не в схеме (внешняя)
      if (!models[table].includes(column)) {
        process.stderr.write(`  ✗ ${rel}: таблица "${table}", столбец "${column}" — нет в schema.prisma\n`);
        fail = 1;
      }
    }
  }

  if (!fail) {
    const n = files.length;
    process.stdout.write(`  ✓ имена столбцов в ${n} ${n === 1 ? 'миграции' : 'миграциях'} совпадают со схемой\n`);
  }
  return fail;
}

// ── Main ───────────────────────────────────────────────────────────────────

const models = parseSchema();
process.exit(dbMode ? checkDb(models) : checkMigrations(models));
