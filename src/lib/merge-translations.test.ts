import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeTranslations } from './merge-translations';

describe('mergeTranslations', () => {
  // ── Базовые случаи (плоский уровень) ──────────────────────────────────────

  it('добавляет ключ из other, которого нет в current и предке', () => {
    const { merged, conflicts } = mergeTranslations({ a: 'A' }, { a: 'A' }, { a: 'A', b: 'B' });
    expect(merged).toEqual({ a: 'A', b: 'B' });
    expect(conflicts).toEqual([]);
  });

  it('сохраняет ключ из current, которого нет в other', () => {
    const { merged, conflicts } = mergeTranslations({ a: 'A' }, { a: 'A', b: 'B' }, { a: 'A' });
    expect(merged).toEqual({ a: 'A', b: 'B' });
    expect(conflicts).toEqual([]);
  });

  it('нет конфликта: обе ветки добавили один ключ с одинаковым значением', () => {
    const { merged, conflicts } = mergeTranslations(
      { a: 'A' },
      { a: 'A', b: 'same' },
      { a: 'A', b: 'same' },
    );
    expect(merged.b).toBe('same');
    expect(conflicts).toEqual([]);
  });

  it('конфликт: обе ветки добавили один ключ с разными значениями', () => {
    const { conflicts } = mergeTranslations(
      { a: 'A' },
      { a: 'A', b: 'from_current' },
      { a: 'A', b: 'from_other' },
    );
    expect(conflicts).toContain('b');
  });

  it('конфликт: обе ветки изменили один существующий ключ по-разному', () => {
    const { conflicts } = mergeTranslations({ a: 'old' }, { a: 'new_current' }, { a: 'new_other' });
    expect(conflicts).toContain('a');
  });

  it('нет конфликта: только other изменил ключ — берём из other', () => {
    const { merged, conflicts } = mergeTranslations({ a: 'old' }, { a: 'old' }, { a: 'new' });
    expect(merged.a).toBe('new');
    expect(conflicts).toEqual([]);
  });

  it('нет конфликта: только current изменил ключ — сохраняем current', () => {
    const { merged, conflicts } = mergeTranslations({ a: 'old' }, { a: 'new' }, { a: 'old' });
    expect(merged.a).toBe('new');
    expect(conflicts).toEqual([]);
  });

  it('нет конфликта: оба изменили ключ одинаково', () => {
    const { merged, conflicts } = mergeTranslations({ a: 'old' }, { a: 'same' }, { a: 'same' });
    expect(merged.a).toBe('same');
    expect(conflicts).toEqual([]);
  });

  it('несколько конфликтов — все перечислены', () => {
    const { conflicts } = mergeTranslations(
      { a: 'A', b: 'B' },
      { a: 'A_curr', b: 'B_curr' },
      { a: 'A_other', b: 'B_other' },
    );
    expect(conflicts).toContain('a');
    expect(conflicts).toContain('b');
  });

  // ── Главный сценарий задачи: вложенные ключи в одном разделе ─────────────

  it('главный сценарий: разные ключи внутри одного вложенного раздела — без конфликта', () => {
    const ancestor = { admin: { title: 'CC', banners: { a: 'A' } } };
    const current  = { admin: { title: 'CC', banners: { a: 'A' }, cc: { product: 'P' } } };
    const other    = { admin: { title: 'CC', banners: { a: 'A', b: 'B' } } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    const admin = merged.admin as Record<string, unknown>;
    expect(admin).toHaveProperty('cc');
    const banners = admin.banners as Record<string, unknown>;
    expect(banners).toHaveProperty('a', 'A');
    expect(banners).toHaveProperty('b', 'B');
  });

  it('вложенный конфликт: один и тот же конечный ключ изменён по-разному', () => {
    const ancestor = { admin: { title: 'Old' } };
    const current  = { admin: { title: 'New_Curr' } };
    const other    = { admin: { title: 'New_Other' } };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('admin.title');
  });

  it('конфликт сообщает полный путь, а не имя раздела', () => {
    const ancestor = { booking: { steps: { date: { label: 'Old' } } } };
    const current  = { booking: { steps: { date: { label: 'Curr' } } } };
    const other    = { booking: { steps: { date: { label: 'Other' } } } };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('booking.steps.date.label');
    expect(conflicts).not.toContain('booking');
  });

  it('при конфликте спорный ключ сохраняет значение current', () => {
    const ancestor = { admin: { title: 'Old', other: 'X' } };
    const current  = { admin: { title: 'Curr', other: 'X' } };
    const other    = { admin: { title: 'Other', other: 'X' } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('admin.title');
    expect((merged.admin as Record<string, unknown>).title).toBe('Curr');
    expect((merged.admin as Record<string, unknown>).other).toBe('X');
  });

  it('нет конфликта: два новых раздела верхнего уровня в разных ветках', () => {
    const ancestor = { nav: { home: 'Home' } };
    const current  = { nav: { home: 'Home' }, cc:      { title: 'CC' } };
    const other    = { nav: { home: 'Home' }, workers: { title: 'W' } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    expect(merged).toHaveProperty('cc');
    expect(merged).toHaveProperty('workers');
  });

  it('оба добавили один раздел: разные подключи — без конфликта', () => {
    const ancestor = {};
    const current  = { section: { a: '1' } };
    const other    = { section: { b: '2' } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    const section = merged.section as Record<string, unknown>;
    expect(section).toHaveProperty('a', '1');
    expect(section).toHaveProperty('b', '2');
  });

  it('оба добавили один раздел: одинаковый подключ — без конфликта', () => {
    const ancestor = {};
    const current  = { section: { a: 'same' } };
    const other    = { section: { a: 'same' } };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    expect((merged.section as Record<string, unknown>).a).toBe('same');
  });

  it('оба добавили один раздел: одинаковый подключ с разными значениями — конфликт', () => {
    const ancestor = {};
    const current  = { section: { a: 'curr' } };
    const other    = { section: { a: 'other' } };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('section.a');
  });

  // ── Удаления ──────────────────────────────────────────────────────────────

  it('удаление: ключ удалён в other, не тронут в current — удаляется', () => {
    const ancestor = { a: 'A', b: 'B' };
    const current  = { a: 'A', b: 'B' };
    const other    = { a: 'A' };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    expect(merged).not.toHaveProperty('b');
    expect(merged).toHaveProperty('a', 'A');
  });

  it('удаление: ключ удалён в other, изменён в current — конфликт', () => {
    const ancestor = { a: 'A', b: 'old' };
    const current  = { a: 'A', b: 'changed' };
    const other    = { a: 'A' };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('b');
  });

  it('удаление: ключ удалён в current, не тронут в other — удаляется', () => {
    const ancestor = { a: 'A', b: 'B' };
    const current  = { a: 'A' };
    const other    = { a: 'A', b: 'B' };
    const { merged, conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toEqual([]);
    expect(merged).not.toHaveProperty('b');
  });

  it('удаление: ключ удалён в current, изменён в other — конфликт', () => {
    const ancestor = { a: 'A', b: 'old' };
    const current  = { a: 'A' };
    const other    = { a: 'A', b: 'new' };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    expect(conflicts).toContain('b');
  });

  it('массивы — финальные значения, не рекурсируем', () => {
    const ancestor = { arr: ['x'] };
    const current  = { arr: ['x', 'y'] };
    const other    = { arr: ['x', 'z'] };
    const { conflicts } = mergeTranslations(ancestor, current, other);
    // Оба изменили массив по-разному — конфликт на уровне ключа, не элемента
    expect(conflicts).toContain('arr');
  });

  // ── Порядок ключей ────────────────────────────────────────────────────────

  it('порядок ключей: существующие сохраняются, новые из other добавляются в конец', () => {
    const ancestor = { a: '1', b: '2', c: '3' };
    const current  = { a: '1', b: 'changed', c: '3' };
    const other    = { a: '1', b: '2',       c: '3', d: 'new' };
    const { merged } = mergeTranslations(ancestor, current, other);
    expect(Object.keys(merged)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.b).toBe('changed');
    expect(merged.d).toBe('new');
  });

  it('порядок ключей в разделе: существующие сохраняются, новые из other — в конец', () => {
    const ancestor = { admin: { x: '1', y: '2' } };
    const current  = { admin: { x: '1', y: '2', z: 'from_current' } };
    const other    = { admin: { x: '1', y: '2', w: 'from_other' } };
    const { merged } = mergeTranslations(ancestor, current, other);
    expect(Object.keys((merged as Record<string, unknown>).admin as object)).toEqual(['x', 'y', 'z', 'w']);
  });
});

// ── Сравнение mjs-драйвера с ts-реализацией ──────────────────────────────────

describe('scripts/merge-translations.mjs', () => {
  const SCRIPT = join(process.cwd(), 'scripts', 'merge-translations.mjs');
  const hasScript = existsSync(SCRIPT);

  it.skipIf(!hasScript)('совпадает с ts-реализацией на одних данных', () => {
    const dir = mkdtempSync(join(tmpdir(), 'merge-test-'));
    try {
      const ancestor = { admin: { title: 'T', banners: { a: 'A' } } };
      const current  = { admin: { title: 'T', banners: { a: 'A' }, cc: { product: 'P' } } };
      const other    = { admin: { title: 'T', banners: { a: 'A', b: 'B' } } };

      const ancPath = join(dir, 'ancestor.json');
      const curPath = join(dir, 'current.json');
      const othPath = join(dir, 'other.json');

      writeFileSync(ancPath, JSON.stringify(ancestor, null, 2) + '\n');
      writeFileSync(curPath, JSON.stringify(current, null, 2) + '\n');
      writeFileSync(othPath, JSON.stringify(other, null, 2) + '\n');

      const result = spawnSync('node', [SCRIPT, ancPath, curPath, othPath], { encoding: 'utf8' });
      expect(result.status).toBe(0);

      const mjsResult = JSON.parse(readFileSync(curPath, 'utf8'));
      const tsResult  = mergeTranslations(ancestor, current, other).merged;
      expect(mjsResult).toEqual(tsResult);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it.skipIf(!hasScript)('при конфликте записывает частичный результат и выходит с кодом 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'merge-conflict-'));
    try {
      const ancestor = { admin: { title: 'Old', other: 'X' } };
      const current  = { admin: { title: 'Curr', other: 'X' } };
      const other    = { admin: { title: 'Other', other: 'X' } };

      const ancPath = join(dir, 'ancestor.json');
      const curPath = join(dir, 'current.json');
      const othPath = join(dir, 'other.json');

      writeFileSync(ancPath, JSON.stringify(ancestor, null, 2) + '\n');
      writeFileSync(curPath, JSON.stringify(current, null, 2) + '\n');
      writeFileSync(othPath, JSON.stringify(other, null, 2) + '\n');

      const result = spawnSync('node', [SCRIPT, ancPath, curPath, othPath], { encoding: 'utf8' });
      expect(result.status).toBe(1);

      // Файл должен быть записан даже при конфликте
      const written = JSON.parse(readFileSync(curPath, 'utf8')) as Record<string, Record<string, string>>;
      expect(written.admin.title).toBe('Curr');   // спорный ключ — значение current
      expect(written.admin.other).toBe('X');       // не спорный ключ присутствует

      // Stderr содержит полный путь конфликта
      expect(result.stderr).toContain('admin.title');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
