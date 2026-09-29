/**
 * Отказы прав воркеров для Control Center → «Здоровье» (DEV-79): разбор раздела из лога запуска и сводка за период.
 * Раздел пишет диспетчер (src/lib/worker-denials-format.mjs → formatDenials) в конец поля WorkerRun.log:
 *
 *   --- отказы прав: 2 ---
 *   Write /tmp/…
 *   cd /opt/ihelp.am && node scripts/cc.mjs note КЛЮЧ "…" --agent имя
 *
 * Отдельного поля в таблице нет, поэтому запуски без раздела (до DEV-79 или без ответа воркера) в долю не входят.
 */

/** Заголовок раздела — тот же, что DENIALS_MARK у диспетчера; совпадение проверяет тест */
export const DENIALS_HEADER = /^--- отказы прав: (\d+) ---$/;

export type RunDenials = { count: number; forms: string[] };
export type DenialStats = {
  /** Запусков в выборке */
  runs: number;
  /** Из них с данными об отказах (раздел в логе есть) */
  withData: number;
  /** Из них хотя бы с одним отказом */
  withDenials: number;
  /** Всего отказов */
  denials: number;
  /** Доля запусков с отказами среди запусков с данными, проценты 0–100; null — данных нет */
  sharePct: number | null;
  /** Самые частые отклонённые команды */
  top: { form: string; count: number }[];
};

/** Раздел об отказах из лога запуска; null — раздела нет */
export function parseDenials(log: string | null | undefined): RunDenials | null {
  if (!log) return null;
  const lines = log.split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (DENIALS_HEADER.test(lines[i].trim())) {
      at = i;
      break;
    }
  }
  if (at < 0) return null;
  const count = Number(lines[at].trim().match(DENIALS_HEADER)![1]);
  const forms = lines
    .slice(at + 1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("… и ещё "));
  return { count, forms: forms.slice(0, count) };
}

/** Сводка по логам запусков: доля запусков с отказами и самые частые отклонённые команды */
export function denialStats(logs: (string | null | undefined)[], topN = 5): DenialStats {
  const byForm = new Map<string, number>();
  let withData = 0;
  let withDenials = 0;
  let denials = 0;
  for (const log of logs) {
    const d = parseDenials(log);
    if (!d) continue;
    withData++;
    if (d.count > 0) withDenials++;
    denials += d.count;
    for (const f of d.forms) byForm.set(f, (byForm.get(f) ?? 0) + 1);
  }
  const top = [...byForm.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([form, count]) => ({ form, count }));
  return { runs: logs.length, withData, withDenials, denials, sharePct: withData ? Math.round((withDenials / withData) * 100) : null, top };
}
