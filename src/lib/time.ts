/** Армения живёт в UTC+4 без перехода на летнее время */
export const TZ = "Asia/Yerevan";
export const TZ_OFFSET = "+04:00";

/** "2026-09-20" + "11:30" → Date (момент времени) */
export function atYerevan(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${TZ_OFFSET}`);
}

/** Date → "YYYY-MM-DD" в ереванском времени */
export function ymd(d: Date): string {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Date → "HH:MM" в ереванском времени */
export function hm(d: Date): string {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(11, 16);
}

/** День недели 1=пн … 7=вс для даты "YYYY-MM-DD" */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Проверить, что момент попадает в тихий период по Еревану (UTC+4).
 *  При startH > endH период охватывает полночь: например, 21..9. */
export function isQuietHour(now: Date, startH = 21, endH = 9): boolean {
  const hour = parseInt(new Date(now.getTime() + 4 * 3600_000).toISOString().slice(11, 13), 10);
  if (startH < endH) {
    return hour >= startH && hour < endH;
  }
  return hour >= startH || hour < endH;
}

/** Диапазон суток по ереванскому времени через daysAhead дней от now */
export function packageWarnWindow(now: Date, daysAhead: number): { from: Date; to: Date } {
  const targetYmd = ymd(new Date(now.getTime() + daysAhead * 86400_000));
  return {
    from: new Date(`${targetYmd}T00:00:00${TZ_OFFSET}`),
    to: new Date(`${targetYmd}T23:59:59.999${TZ_OFFSET}`),
  };
}
