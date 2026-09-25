/**
 * Воркеры Control Center: пулы (триаж, разработчики, «Продукт и не-код», тестировщик, деплоер), их настройки и план запуска.
 * Чистые функции без базы: диспетчер на сервере (scripts/dispatcher.mjs) присылает состояние,
 * сервис решает, кого запускать. Правила словами — docs/WORKERS.md.
 */

export const POOLS = ["triage", "dev", "nocode", "tester", "deployer"] as const;
export type Pool = (typeof POOLS)[number];

export const MODELS = ["sonnet", "opus", "haiku"] as const;

/**
 * Режим пула, как в LIA: auto — запуск, как только в очереди есть работа; scheduled — не чаще,
 * чем раз в everyMin минут; manual — только кнопкой «Запустить сейчас»
 */
export const MODES = ["auto", "scheduled", "manual"] as const;
export type Mode = (typeof MODES)[number];
/** Интервалы для режима «по расписанию», минуты */
export const EVERY_MIN = [15, 30, 60, 120, 240, 720, 1440] as const;

/** Пулы, где одновременно работает только один воркер: деплоер выкладывает по одной задаче, триаж не должен разбирать одно и то же дважды */
export const SINGLE: Pool[] = ["triage", "deployer"];

export type PoolConfig = {
  enabled: boolean;
  /** Сколько воркеров пула работают одновременно (деплоер и триаж — всегда один) */
  max: number;
  model: (typeof MODELS)[number];
  /** Сколько запусков пула в сутки, чтобы не съесть лимит подписки */
  dailyCap: number;
  mode: Mode;
  /** Для режима «по расписанию»: не чаще раза в столько минут */
  everyMin: number;
};

export type WorkersConfig = {
  /** Общий выключатель: false — диспетчер никого не запускает сам (кнопка «Запустить сейчас» работает) */
  enabled: boolean;
  /** Пробный режим: диспетчер считает план и пишет его в журнал, но никого не запускает */
  dryRun: boolean;
  pools: Record<Pool, PoolConfig>;
  /** Часы выкладки по Еревану: деплоер сам запускается только в этом окне, [с, до) */
  deployWindow: [number, number];
  /** Сколько карточек триаж разбирает за один запуск */
  triageBatch: number;
  /** Раз в столько часов триаж пересматривает весь бэклог и готовые задачи; 0 — не пересматривать */
  sweepEveryH: number;
  /** Пауза после исчерпанного лимита подписки или отказа входа: до этого момента никого не запускаем */
  pausedUntil: string | null;
  /** Почему пауза: лимит подписки, вход в Claude — показывается во вкладке «Воркеры» */
  pausedReason: string | null;
  /** Остановить уже работающих воркеров на следующем проходе диспетчера */
  stopRunning: boolean;
};

export const DEFAULT_WORKERS: WorkersConfig = {
  enabled: false,
  dryRun: false,
  pools: {
    // Триаж: каждая входящая IN-N — отдельный запуск, пачка бэклога — ещё один; 12 в сутки не хватало и очередь вставала
    triage: { enabled: true, max: 1, model: "sonnet", dailyCap: 40, mode: "auto", everyMin: 30 },
    dev: { enabled: true, max: 2, model: "sonnet", dailyCap: 16, mode: "auto", everyMin: 30 },
    nocode: { enabled: true, max: 1, model: "sonnet", dailyCap: 8, mode: "auto", everyMin: 30 },
    tester: { enabled: true, max: 1, model: "sonnet", dailyCap: 16, mode: "auto", everyMin: 30 },
    deployer: { enabled: true, max: 1, model: "sonnet", dailyCap: 8, mode: "auto", everyMin: 30 },
  },
  deployWindow: [10, 20],
  triageBatch: 6,
  sweepEveryH: 24,
  pausedUntil: null,
  pausedReason: null,
  stopRunning: false,
};

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
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
      max: SINGLE.includes(p) ? 1 : clamp(src.max ?? d.max, 0, 4, d.max),
      model: (MODELS as readonly string[]).includes(String(src.model)) ? (src.model as PoolConfig["model"]) : d.model,
      dailyCap: clamp(src.dailyCap ?? d.dailyCap, 0, 100, d.dailyCap),
      mode: (MODES as readonly string[]).includes(String(src.mode)) ? (src.mode as Mode) : d.mode,
      everyMin: (EVERY_MIN as readonly number[]).includes(Number(src.everyMin)) ? Number(src.everyMin) : d.everyMin,
    };
  }
  const w = Array.isArray(r.deployWindow) ? r.deployWindow.map(Number) : DEFAULT_WORKERS.deployWindow;
  const from = clamp(w[0], 0, 23, 10);
  const to = Math.max(from + 1, clamp(w[1], 1, 24, 20));
  return {
    enabled: r.enabled === true,
    dryRun: r.dryRun === true,
    pools,
    deployWindow: [from, to],
    triageBatch: clamp(r.triageBatch ?? DEFAULT_WORKERS.triageBatch, 1, 15, DEFAULT_WORKERS.triageBatch),
    sweepEveryH: clamp(r.sweepEveryH ?? DEFAULT_WORKERS.sweepEveryH, 0, 168, DEFAULT_WORKERS.sweepEveryH),
    pausedUntil: typeof r.pausedUntil === "string" ? r.pausedUntil : null,
    pausedReason: typeof r.pausedReason === "string" ? r.pausedReason.slice(0, 300) : null,
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
  /** Тестировщик недавно закончил без вердикта: до этого времени задачу ему снова не даём */
  testHoldUntil?: Date | null;
};

/** Просьба человека запустить пул сейчас — кнопка «Запустить сейчас» или «▶ Запустить воркера» в шторке задачи */
export type RunRequest = { pool: Pool; key?: string | null; at: string; by: string };

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
  /** Сколько готовых задач без кода может взять воркер «Продукт и не-код» */
  readyForNocode: number;
  /** Текущие коммиты веток в репозитории: ветка → sha. Их присылает диспетчер из git */
  heads: Record<string, string>;
  /** Карточки, ждущие триажа, в порядке разбора */
  triageQueue: string[];
  /** Пора пересмотреть весь бэклог */
  sweepDue: boolean;
  /** Когда пул запускался последний раз (ISO) — для режима «по расписанию» */
  lastStart: Partial<Record<Pool, string>>;
  requests: RunRequest[];
};

export type DispatchAction = {
  pool: Pool;
  agent: string;
  /** Задача запуска; у разработчика без ключа — следующая из очереди */
  key?: string;
  /** Карточки для триажа */
  keys?: string[];
  /** Триаж: обзор всего бэклога */
  sweep?: boolean;
  /** Запуск по просьбе человека: время просьбы */
  requestAt?: string;
};

const leaseAlive = (t: ReviewTask, now: Date) => !!t.claimedBy && !!t.claimUntil && t.claimUntil > now;

/** Проверка пройдена на том же коммите, что сейчас в ветке: новые коммиты после проверки требуют новой */
export const testedCurrent = (t: ReviewTask, heads: Record<string, string>) =>
  !!t.testedSha && !!t.branch && !!heads[t.branch] && heads[t.branch].startsWith(t.testedSha.slice(0, 40));

/** Очереди проверки: что ждёт тестировщика, что готово к выкладке, что сейчас кто-то держит */
export function reviewQueues(review: ReviewTask[], heads: Record<string, string>, now = new Date()) {
  const onBranch = review.filter((t) => !!t.branch && !!heads[t.branch]);
  const holding = (t: ReviewTask) => !!t.testHoldUntil && t.testHoldUntil > now;
  return {
    test: onBranch.filter((t) => !testedCurrent(t, heads) && !leaseAlive(t, now) && !holding(t)),
    deploy: onBranch.filter((t) => testedCurrent(t, heads) && !leaseAlive(t, now)),
    held: review.filter((t) => leaseAlive(t, now)),
    /** Запуск тестировщика закончился без вердикта — пауза, чтобы не гонять одну задачу по кругу */
    holding: onBranch.filter((t) => !testedCurrent(t, heads) && !leaseAlive(t, now) && holding(t)),
    noBranch: review.filter((t) => !t.branch || !heads[t.branch]),
  };
}

/**
 * Кого запустить на этом проходе. Никого на паузе после лимита и во время остановки.
 * Сначала — просьбы человека («Запустить сейчас»): они не ждут общего выключателя, режима и расписания,
 * но занимают свободный слот пула и берут только ту работу, которая есть.
 * Сами пулы запускаются, когда включены общий выключатель и пул, режим не «вручную», не исчерпан дневной лимит
 * и (для «по расписанию») прошёл интервал. Деплоер — один, в окне выкладки, только протестированный коммит.
 * Тестировщик — задача без проверки текущего коммита. Триаж — пачка непроверенных карточек, а если их нет
 * и подошло время — обзор всего бэклога. Разработчики — по числу готовых задач.
 */
export function planDispatch(s: DispatchState, now = new Date()): DispatchAction[] {
  const { config } = s;
  if (config.stopRunning) return [];
  if (config.pausedUntil && Date.parse(config.pausedUntil) > now.getTime()) return [];
  const actions: DispatchAction[] = [];
  const names = (p: Pool) => [...s.running.filter((r) => r.pool === p).map((r) => r.agent), ...actions.filter((a) => a.pool === p).map((a) => a.agent)];
  const free = (p: Pool) => config.pools[p].max - names(p).length;
  const taken = () => new Set(actions.flatMap((a) => [a.key ?? "", ...(a.keys ?? [])]));
  const q = reviewQueues(s.review, s.heads, now);
  const nextTest = () => q.test.find((t) => !taken().has(t.key));
  const nextDeploy = () => q.deploy.find((t) => !taken().has(t.key));
  const triageBatch = () => s.triageQueue.filter((k) => !taken().has(k)).slice(0, config.triageBatch);

  for (const r of s.requests) {
    // Входящие IN-N не ждут пачку бэклога: у триажа для них второй, быстрый слот
    const fast = r.pool === "triage" && !!r.key && r.key.startsWith("IN-");
    if (free(r.pool) + (fast ? 1 : 0) <= 0) continue;
    const base = { requestAt: r.at };
    if (r.pool === "dev" || r.pool === "nocode") {
      actions.push({ pool: r.pool, agent: freeName(r.pool, names(r.pool)), ...(r.key ? { key: r.key } : {}), ...base });
    } else if (r.pool === "tester") {
      const t = r.key ? q.test.find((x) => x.key === r.key) : nextTest();
      if (t && !taken().has(t.key)) actions.push({ pool: "tester", agent: freeName("tester", names("tester")), key: t.key, ...base });
    } else if (r.pool === "deployer") {
      const t = r.key ? q.deploy.find((x) => x.key === r.key) : nextDeploy();
      if (t && !taken().has(t.key)) actions.push({ pool: "deployer", agent: "deployer", key: t.key, ...base });
    } else {
      const keys = r.key ? [r.key] : triageBatch();
      const agent = names("triage").includes("triage") ? freeName("triage", names("triage")) : "triage";
      actions.push(keys.length ? { pool: "triage", agent, keys, ...base } : { pool: "triage", agent, sweep: true, ...base });
    }
  }

  if (!config.enabled) return actions;
  const left = (p: Pool) => Math.max(0, config.pools[p].dailyCap - (s.today[p] ?? 0));
  const due = (p: Pool) => {
    const pc = config.pools[p];
    if (!pc.enabled || pc.mode === "manual" || left(p) <= 0 || free(p) <= 0) return false;
    if (pc.mode === "auto") return true;
    const last = s.lastStart[p];
    return !last || now.getTime() - Date.parse(last) >= pc.everyMin * 60_000;
  };

  const hour = yerevanHour(now);
  if (due("deployer") && hour >= config.deployWindow[0] && hour < config.deployWindow[1]) {
    const t = nextDeploy();
    if (t) actions.push({ pool: "deployer", agent: "deployer", key: t.key });
  }

  if (due("tester")) {
    for (let i = Math.min(free("tester"), left("tester")); i > 0; i--) {
      const t = nextTest();
      if (!t) break;
      actions.push({ pool: "tester", agent: freeName("tester", names("tester")), key: t.key });
    }
  }

  if (due("triage")) {
    const keys = triageBatch();
    if (keys.length) actions.push({ pool: "triage", agent: "triage", keys });
    else if (s.sweepDue && config.sweepEveryH > 0) actions.push({ pool: "triage", agent: "triage", sweep: true });
  }

  // Разработчики и «Продукт и не-код» — по числу готовых задач своего вида; запущенные по просьбе уже заняли часть
  for (const [pool, ready] of [
    ["dev", s.readyForDev],
    ["nocode", s.readyForNocode],
  ] as const) {
    if (!due(pool)) continue;
    const requested = actions.filter((a) => a.pool === pool).length;
    for (let i = Math.min(free(pool), left(pool), ready - requested); i > 0; i--) actions.push({ pool, agent: freeName(pool, names(pool)) });
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

/** Какой пул подходит задаче для кнопки «▶ Запустить воркера» в шторке: по статусу и проверке */
export function poolForTask(t: { status: string; layer: string; testedSha?: string | null }): Pool | null {
  if (t.status === "backlog" || t.status === "blocked") return "triage";
  if (t.status === "ready") return t.layer === "none" ? "nocode" : "dev";
  if (t.status === "review" && t.layer !== "none") return t.testedSha ? "deployer" : "tester";
  return null;
}
