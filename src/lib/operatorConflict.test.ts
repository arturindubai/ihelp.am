import { describe, it, expect } from "vitest";

/**
 * Чистая функция проверки пересечения визитов — та же логика, что в operatorService.assignMasterToVisit.
 * Тест на критерий: назначение занятого мастера отклоняется.
 */
function hasConflict(
  existing: { start: number; end: number }[],
  newStart: number,
  newEnd: number,
  bufMs: number,
): boolean {
  return existing.some(({ start, end }) => newStart - bufMs < end && start < newEnd + bufMs);
}

describe("operator: проверка пересечения визитов", () => {
  const t = (h: number, m = 0) => (h * 60 + m) * 60_000; // ms from epoch-start

  it("пересечение есть — мастер занят", () => {
    const existing = [{ start: t(10), end: t(11) }];
    // новый визит 10:30–11:30 пересекается с 10:00–11:00
    expect(hasConflict(existing, t(10, 30), t(11, 30), 0)).toBe(true);
  });

  it("визиты вплотную без буфера — не конфликт", () => {
    const existing = [{ start: t(10), end: t(11) }];
    // новый 11:00–12:00 вплотную — без буфера не конфликт
    expect(hasConflict(existing, t(11), t(12), 0)).toBe(false);
  });

  it("буфер создаёт конфликт при вплотную стоящих визитах", () => {
    const existing = [{ start: t(10), end: t(11) }];
    const buf = 30 * 60_000; // 30 мин буфер
    // новый 11:00 — попадает в буфер предыдущего
    expect(hasConflict(existing, t(11), t(12), buf)).toBe(true);
  });

  it("свободное время — конфликта нет", () => {
    const existing = [{ start: t(10), end: t(11) }];
    // новый 12:00–13:00 — нет пересечения даже с буфером 30 мин
    expect(hasConflict(existing, t(12), t(13), 30 * 60_000)).toBe(false);
  });

  it("нет существующих визитов — всегда свободен", () => {
    expect(hasConflict([], t(10), t(11), 30 * 60_000)).toBe(false);
  });
});
