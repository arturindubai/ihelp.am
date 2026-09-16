import { atYerevan, isoWeekday, toMin, fromMin } from "./time";

export interface MasterAvailability {
  id: string;
  /** { "1": [["10:00","19:00"]] } — 1=пн */
  workingHours: Record<string, [string, string][]>;
  timeOff: { from: Date; to: Date }[];
  busy: { start: Date; end: Date }[];
}

export interface Slot {
  time: string;
  start: Date;
  masterIds: string[];
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

/**
 * Свободные слоты на дату. Слот доступен, если хотя бы один мастер свободен
 * на всю длительность визита плюс буфер на дорогу до и после.
 */
export function computeSlots(opts: {
  date: string;
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  notBefore: Date;
  masters: MasterAvailability[];
}): Slot[] {
  const { date, durationMin, bufferMin, stepMin, notBefore, masters } = opts;
  const wd = String(isoWeekday(date));
  const byTime = new Map<number, string[]>();

  for (const m of masters) {
    const windows = m.workingHours?.[wd] || [];
    for (const [from, to] of windows) {
      const startMin = toMin(from);
      const endMin = toMin(to);
      for (let t = startMin; t + durationMin <= endMin; t += stepMin) {
        const start = atYerevan(date, fromMin(t));
        if (start < notBefore) continue;
        const s = start.getTime();
        const e = s + durationMin * 60_000;
        const sb = s - bufferMin * 60_000;
        const eb = e + bufferMin * 60_000;
        if (m.timeOff.some((o) => overlaps(s, e, o.from.getTime(), o.to.getTime()))) continue;
        if (m.busy.some((b) => overlaps(sb, eb, b.start.getTime(), b.end.getTime()))) continue;
        const list = byTime.get(t) || [];
        list.push(m.id);
        byTime.set(t, list);
      }
    }
  }

  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ids]) => ({ time: fromMin(t), start: atYerevan(date, fromMin(t)), masterIds: ids }));
}

/** Проверка, свободен ли конкретный мастер в момент start */
export function isMasterFree(m: MasterAvailability, start: Date, durationMin: number, bufferMin: number): boolean {
  const date = new Date(start.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  const time = new Date(start.getTime() + 4 * 3600_000).toISOString().slice(11, 16);
  const t = toMin(time);
  const windows = m.workingHours?.[String(isoWeekday(date))] || [];
  if (!windows.some(([f, to]) => t >= toMin(f) && t + durationMin <= toMin(to))) return false;
  const s = start.getTime();
  const e = s + durationMin * 60_000;
  if (m.timeOff.some((o) => overlaps(s, e, o.from.getTime(), o.to.getTime()))) return false;
  return !m.busy.some((b) => overlaps(s - bufferMin * 60_000, e + bufferMin * 60_000, b.start.getTime(), b.end.getTime()));
}
