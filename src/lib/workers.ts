/**
 * Воркеры Control Center: пулы (разработчики, тестировщик, деплоер), их настройки и план запуска.
 * Чистые функции без базы: диспетчер на сервере (scripts/dispatcher.mjs) присылает состояние,
 * сервис решает, кого запускать. Правила словами — docs/WORKERS.md.
 */

export const POOLS = ["dev", "tester", "deployer"] as const;
export type Pool = (typeof POOLS)[number];

export const MODELS = ["sonnet", "opus", "haiku"] as const;

export type PoolConfig = {
  enabled: boolean;
  /** Сколько воркеров пула работают одновременно (деплоер — всегда один) */
  max: number;
  model: (typeof MODELS)[number];
  /** Сколько запусков пула в сутки, чтобы не съесть лимит подписки */
  dailyCap: number;
};

export type WorkersConfig = {
  /** Общий выключатель: false — диспетчер никого не запускает */
  enabled: boolean;
  pools: Record<Pool, PoolConfig>;
  /** Часы выкладки по Еревану: деплоер запускается только в этом окне, [с, до) */
  deployWindow: [number, number];
  /** Пауза после исчерпанного лимита подписки: до этого момента никого не запускаем */
  pausedUntil: string | null;
  /** Остановить уже работающих воркеров на следующем проходе диспетчера */
  stopRunning: boolean;
};

export const DEFAULT_WORKERS: WorkersConfig = {
  enabled: false,
  pools: {
    dev: { enabled: true, max: 2, model: "sonnet", dailyCap: 16 },
    tester: { enabled: true, max: 1, model: "sonnet", dailyCap: 16 },
    deployer: { enabled: true, max: 1, model: "sonnet", dailyCap: 8 },
  },
  deployWindow: [10, 20],
  pausedUntil: null,
  stopRunning: false,
};

/** Настройки из базы поверх значений по умолчанию: старое или битое значение не ломает диспетчер */
export function normalizeWorkers(raw: unknown): WorkersConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<WorkersConfig>;
  const pools = {} as Record<Pool, PoolConfig>;
  for (const p of POOLS) {
    const src = (r.pools?.[p] ?? {}) as Partial<PoolConfig>;
    const d = DEFAULT_WORKERS.pools[p];
    pools[p] = {
      enabled: typeof src.enabled === "boolean" ? src.enabled : d.enabled,
      max: p === "deployer" ? 1 : Math.min(4, Math.max(0, Math.round(Number(src.max ?? d.max)) || 0)),
      model: (MODELS as readonly string[]).includes(String(src.model)) ? (src.model as PoolConfig["model"]) : d.model,
      dailyCap: Math.min(100, Math.max(0, Math.round(Number(src.dailyCap ?? d.dailyCap)) || 0)),
    };
  }
  const w = Array.isArray(r.deployWindow) ? r.deployWindow.map(Number) : DEFAULT_WORKERS.deployWindow;
  const from = Math.min(23, Math.max(0, w[0] ?? 10));
  const to = Math.min(24, Math.max(from + 1, w[1] ?? 20));
  return {
    enabled: r.enabled === true,
    pools,
    deployWindow: [from, to],
    pausedUntil: typeof r.pausedUntil === "string" ? r.pausedUntil : null,
    stopRunning: r.stopRunning === true,
  };
}

/** Час по Еревану (UTC+4, без перехода на летнее время) */
export const yerevanHour = (now: Date) => (now.getUTCHours() + 4) % 24;

export type ReviewTask = {
  key: string;
  branch: string | null;
  testedSha: string | null;
  /** Кто сейчас держит задачу на проверке: тестировщик или деплоер */
  claimedBy: string | null;
  claimUntil: Date | null;
};

export type DispatchState = {
  config: WorkersConfig;
  /** Работающие сейчас запуски: пул и имя агента */
  running: { pool: Pool; agent: string }[];
  /** Запусков пула за сегодня (по Еревану) */
  today: Record<Pool, number>;
  /** Задачи «На проверке» */
  review: ReviewTask[];
  /** Сколько задач готово для автономной разработки */
  readyForDev: number;
  /** Текущие коммиты веток в репозитории: ветка → sha. Их присылает диспетчер из git */
  heads: Record<string, string>;
};

export type DispatchAction = { pool: "dev"; agent: string } | { pool: "tester" | "deployer"; agent: string; key: string };

const leaseAlive = (t: ReviewTask, now: Date) => !!t.claimedBy && !!t.claimUntil && t.claimUntil > now;

/** Проверка пройдена на том же коммите, что сейчас в ветке: новые коммиты после проверки требуют новой */
export const testedCurrent = (t: ReviewTask, heads: Record<string, string>) =>
  !!t.testedSha && !!t.branch && !!heads[t.branch] && heads[t.branch].startsWith(t.testedSha.slice(0, 40));

/**
 * Кого запустить на этом проходе. Никого, если воркеры выключены, на паузе или идёт остановка.
 * Деплоер — один на всех, только в окне выкладки и только для протестированного коммита.
 * Тестировщик берёт задачу, у которой нет проверки текущего коммита и которую сейчас никто не держит.
 * Разработчики — по числу готовых задач, не больше лимита пула. Дневной лимит считается на пул.
 */
export function planDispatch(s: DispatchState, now = new Date()): DispatchAction[] {
  const { config } = s;
  if (!config.enabled || config.stopRunning) return [];
  if (config.pausedUntil && Date.parse(config.pausedUntil) > now.getTime()) return [];
  const actions: DispatchAction[] = [];
  const runningOf = (p: Pool) => s.running.filter((r) => r.pool === p);
  const left = (p: Pool) => Math.max(0, config.pools[p].dailyCap - (s.today[p] ?? 0));
  const onBranch = s.review.filter((t) => !!t.branch && !!s.heads[t.branch]);

  const dp = config.pools.deployer;
  const hour = yerevanHour(now);
  if (dp.enabled && left("deployer") > 0 && runningOf("deployer").length === 0 && hour >= config.deployWindow[0] && hour < config.deployWindow[1]) {
    const next = onBranch.find((t) => testedCurrent(t, s.heads) && !leaseAlive(t, now));
    if (next) actions.push({ pool: "deployer", agent: "deployer", key: next.key });
  }

  const tp = config.pools.tester;
  const testerSlots = Math.min(tp.max - runningOf("tester").length, left("tester"));
  if (tp.enabled && testerSlots > 0) {
    const busy = new Set(actions.map((a) => ("key" in a ? a.key : "")));
    const queue = onBranch.filter((t) => !testedCurrent(t, s.heads) && !leaseAlive(t, now) && !busy.has(t.key));
    const names = runningOf("tester").map((r) => r.agent);
    for (const t of queue.slice(0, testerSlots)) {
      const agent = freeName("tester", names);
      names.push(agent);
      actions.push({ pool: "tester", agent, key: t.key });
    }
  }

  const dv = config.pools.dev;
  const devSlots = Math.min(dv.max - runningOf("dev").length, left("dev"), s.readyForDev);
  if (dv.enabled && devSlots > 0) {
    const names = runningOf("dev").map((r) => r.agent);
    for (let i = 0; i < devSlots; i++) {
      const agent = freeName("dev", names);
      names.push(agent);
      actions.push({ pool: "dev", agent });
    }
  }
  return actions;
}

/** Первое свободное имя: dev-1, dev-2… (тестировщик: tester, tester-2…) */
export function freeName(base: string, taken: string[]): string {
  if (base === "tester" && !taken.includes("tester")) return "tester";
  for (let n = base === "tester" ? 2 : 1; n < 100; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-x`;
}

/** Итог запуска по ответу claude -p: закончен, ошибка или упёрлись в лимит подписки */
export function runOutcome(result: { is_error?: boolean; result?: string; subtype?: string } | null, exitCode: number | null): "done" | "failed" | "limit" | "timeout" {
  const text = `${result?.result ?? ""} ${result?.subtype ?? ""}`;
  if (/usage limit|limit reached|rate.?limit|out of (extra )?usage|5-hour limit|weekly limit/i.test(text)) return "limit";
  if (!result) return exitCode === null ? "timeout" : "failed";
  if (result.subtype === "error_max_turns") return "failed";
  return result.is_error ? "failed" : "done";
}
