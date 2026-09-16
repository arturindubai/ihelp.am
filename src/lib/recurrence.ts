import { addDays, isoWeekday } from "./time";

export interface Recurrence {
  start: string; // YYYY-MM-DD первого визита
  time: string; // HH:MM
  weekdays: number[]; // 1..7
  intervalDays: number; // 7, 14, 28
}

/** Даты визитов подписки в диапазоне [from, until] включительно */
export function recurrenceDates(r: Recurrence, from: string, until: string): string[] {
  const out: string[] = [];
  const weeks = Math.max(1, Math.round(r.intervalDays / 7));
  const startMonday = addDays(r.start, -(isoWeekday(r.start) - 1));
  const weekdays = r.weekdays.length ? r.weekdays : [isoWeekday(r.start)];
  for (let d = r.start > from ? r.start : from; d <= until; d = addDays(d, 1)) {
    if (!weekdays.includes(isoWeekday(d))) continue;
    const diffDays = Math.round((Date.parse(d) - Date.parse(startMonday)) / 86400_000);
    if (Math.floor(diffDays / 7) % weeks !== 0) continue;
    out.push(d);
  }
  return out;
}
