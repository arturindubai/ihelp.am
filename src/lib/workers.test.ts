import { describe, expect, it } from "vitest";
import { controlPatch, DEFAULT_WORKERS, executorOf, freeName, normalizeWorkers, planDispatch, poolForTask, reviewQueues, runOutcome, testedCurrent, workersState, type DispatchState, type ReviewTask, type WorkersConfig } from "./workers";

// 12:00 по Еревану — внутри окна выкладки 10–20
const noon = new Date("2026-09-24T08:00:00Z");
const on = { ...DEFAULT_WORKERS, enabled: true };

const review = (key: string, patch: Partial<ReviewTask> = {}): ReviewTask => ({ key, branch: `task/${key}`, testedSha: null, claimedBy: null, claimUntil: null, ...patch });

const state = (patch: Partial<DispatchState> = {}): DispatchState => ({
  config: on,
  running: [],
  today: { triage: 0, product: 0, designer: 0, dev: 0, nocode: 0, tester: 0, deployer: 0 },
  productQueue: [],
  productSweepDue: false,
  designerQueue: [],
  designerSweepDue: false,
  review: [],
  readyForDev: 0,
  readyForNocode: 0,
  heads: {},
  triageQueue: [],
  sweepDue: false,
  lastStart: {},
  requests: [],
  ...patch,
});

describe("настройки воркеров", () => {
  it("битое значение превращается в безопасные настройки по умолчанию, по умолчанию всё выключено", () => {
    const c = normalizeWorkers("мусор");
    expect(c.enabled).toBe(false);
    expect(c.pools.dev.max).toBe(2);
    expect(c.pools.deployer.max).toBe(1);
  });
  it("деплоер и триаж всегда по одному, модель, режим и интервал — только из списка", () => {
    const c = normalizeWorkers({ enabled: true, pools: { deployer: { max: 5 }, triage: { max: 3, mode: "сам", everyMin: 7 }, dev: { model: "gpt" } } });
    expect(c.pools.deployer.max).toBe(1);
    expect(c.pools.triage.max).toBe(1);
    expect(c.pools.triage.mode).toBe("auto");
    expect(c.pools.triage.everyMin).toBe(30);
    expect(c.pools.dev.model).toBe("sonnet");
  });
  it("«План старт» держится только вместе со временем: без pausedUntil флаг сбрасывается", () => {
    expect(normalizeWorkers({ enabled: true }).plannedStart).toBe(false);
    expect(normalizeWorkers({ enabled: true, plannedStart: true }).plannedStart).toBe(false);
    expect(normalizeWorkers({ enabled: true, plannedStart: true, pausedUntil: "2026-09-24T10:00:00Z" }).plannedStart).toBe(true);
    expect(normalizeWorkers({ enabled: true, plannedStart: "да", pausedUntil: "2026-09-24T10:00:00Z" }).plannedStart).toBe(false);
  });
  it("старые настройки без триажа и режимов получают значения по умолчанию", () => {
    const c = normalizeWorkers({ enabled: true, pools: { dev: { enabled: true, max: 2, model: "opus", dailyCap: 5 } } });
    expect(c.pools.dev).toEqual({ enabled: true, max: 2, model: "opus", dailyCap: 5, mode: "auto", everyMin: 30 });
    expect(c.pools.triage.enabled).toBe(true);
    expect(c.triageBatch).toBe(6);
    expect(c.dryRun).toBe(false);
  });
});

describe("план диспетчера", () => {
  it("пустые очереди — никого не запускаем, токены не тратятся", () => {
    expect(planDispatch(state(), noon)).toEqual([]);
  });
  it("выключено, пауза после лимита или остановка — никого", () => {
    const busy = { readyForDev: 3, triageQueue: ["IN-1"] };
    expect(planDispatch(state({ ...busy, config: DEFAULT_WORKERS }), noon)).toEqual([]);
    expect(planDispatch(state({ ...busy, config: { ...on, pausedUntil: "2026-09-24T09:00:00Z" } }), noon)).toEqual([]);
    expect(planDispatch(state({ ...busy, config: { ...on, stopRunning: true } }), noon)).toEqual([]);
  });
  it("разработчиков — по числу готовых задач, но не больше пула, с учётом уже работающих", () => {
    expect(planDispatch(state({ readyForDev: 5 }), noon)).toEqual([
      { pool: "dev", agent: "dev-1" },
      { pool: "dev", agent: "dev-2" },
    ]);
    expect(planDispatch(state({ readyForDev: 5, running: [{ pool: "dev", agent: "dev-1" }] }), noon)).toEqual([{ pool: "dev", agent: "dev-2" }]);
    expect(planDispatch(state({ readyForDev: 1 }), noon)).toEqual([{ pool: "dev", agent: "dev-1" }]);
  });
  it("дневной лимит пула останавливает запуски", () => {
    expect(planDispatch(state({ readyForDev: 5, today: { triage: 0, product: 0, designer: 0, dev: 16, nocode: 0, tester: 0, deployer: 0 } }), noon)).toEqual([]);
  });
  it("тестировщик берёт непроверенную задачу, деплоер — проверенную на текущем коммите", () => {
    const heads = { "task/A": "aaa111", "task/B": "bbb222" };
    const plan = planDispatch(state({ heads, review: [review("A"), review("B", { testedSha: "bbb222" })] }), noon);
    expect(plan).toEqual([
      { pool: "deployer", agent: "deployer", key: "B" },
      { pool: "tester", agent: "tester", key: "A" },
    ]);
  });
  it("новый коммит после проверки требует новой проверки, а не выкладки", () => {
    const t = review("B", { testedSha: "bbb222" });
    expect(testedCurrent(t, { "task/B": "ccc333" })).toBe(false);
    expect(planDispatch(state({ heads: { "task/B": "ccc333" }, review: [t] }), noon)).toEqual([{ pool: "tester", agent: "tester", key: "B" }]);
  });
  it("деплоер вне окна выкладки и второй деплоер не запускаются", () => {
    const s = state({ heads: { "task/B": "bbb222" }, review: [review("B", { testedSha: "bbb222" })] });
    expect(planDispatch(s, new Date("2026-09-24T20:00:00Z"))).toEqual([]);
    expect(planDispatch({ ...s, running: [{ pool: "deployer", agent: "deployer" }] }, noon)).toEqual([]);
  });
  it("задачу, которую сейчас держит тестировщик или деплоер, никто второй не берёт", () => {
    const busy = review("A", { claimedBy: "tester", claimUntil: new Date(noon.getTime() + 60_000) });
    expect(planDispatch(state({ heads: { "task/A": "aaa" }, review: [busy] }), noon)).toEqual([]);
  });
  it("задачу без отправленной ветки не тестируем и не выкладываем", () => {
    expect(planDispatch(state({ heads: {}, review: [review("A")] }), noon)).toEqual([]);
  });
});

describe("имена и итоги запусков", () => {
  it("свободные имена", () => {
    expect(freeName("dev", ["dev-1"])).toBe("dev-2");
    expect(freeName("tester", [])).toBe("tester");
    expect(freeName("tester", ["tester"])).toBe("tester-2");
  });
  it("исчерпанный лимит подписки распознаётся отдельно от ошибки", () => {
    expect(runOutcome({ is_error: true, result: "Claude AI usage limit reached|1759000000" }, 1)).toBe("limit");
    expect(runOutcome({ is_error: false, result: "Готово" }, 0)).toBe("done");
    expect(runOutcome({ is_error: true, subtype: "error_max_turns" }, 1)).toBe("failed");
    expect(runOutcome(null, null)).toBe("timeout");
  });
});

describe("триаж", () => {
  it("новые карточки уходят триажу пачкой, не больше размера пачки", () => {
    const keys = ["IN-1", "A-1", "A-2", "A-3", "A-4", "A-5", "A-6", "A-7"];
    expect(planDispatch(state({ triageQueue: keys }), noon)).toEqual([{ pool: "triage", agent: "triage", keys: keys.slice(0, 6) }]);
  });
  it("очередь пуста, но подошло время — обзор всего бэклога; не подошло — никого", () => {
    expect(planDispatch(state({ sweepDue: true }), noon)).toEqual([{ pool: "triage", agent: "triage", sweep: true }]);
    expect(planDispatch(state({ sweepDue: false }), noon)).toEqual([]);
    expect(planDispatch(state({ sweepDue: true, config: { ...on, sweepEveryH: 0 } }), noon)).toEqual([]);
  });
  it("второй триаж, пока идёт первый, не запускается", () => {
    expect(planDispatch(state({ triageQueue: ["A-1"], running: [{ pool: "triage", agent: "triage" }] }), noon)).toEqual([]);
  });
});

describe("режимы пулов", () => {
  it("вручную — пул сам не запускается даже при полной очереди", () => {
    const config = { ...on, pools: { ...on.pools, dev: { ...on.pools.dev, mode: "manual" as const } } };
    expect(planDispatch(state({ config, readyForDev: 3 }), noon)).toEqual([]);
  });
  it("по расписанию — не чаще интервала после прошлого запуска", () => {
    const config = { ...on, pools: { ...on.pools, triage: { ...on.pools.triage, mode: "scheduled" as const, everyMin: 60 } } };
    const recent = { triage: new Date(noon.getTime() - 20 * 60_000).toISOString() };
    const old = { triage: new Date(noon.getTime() - 61 * 60_000).toISOString() };
    expect(planDispatch(state({ config, triageQueue: ["A-1"], lastStart: recent }), noon)).toEqual([]);
    expect(planDispatch(state({ config, triageQueue: ["A-1"], lastStart: old }), noon)).toEqual([{ pool: "triage", agent: "triage", keys: ["A-1"] }]);
  });
});

describe("«Запустить сейчас»", () => {
  const at = "2026-09-24T07:59:00Z";
  it("работает при выключенном общем выключателе и в режиме «вручную»", () => {
    const config = { ...DEFAULT_WORKERS, pools: { ...DEFAULT_WORKERS.pools, dev: { ...DEFAULT_WORKERS.pools.dev, mode: "manual" as const } } };
    expect(planDispatch(state({ config, requests: [{ pool: "dev", key: "AUTH-1", at, by: "owner" }] }), noon)).toEqual([{ pool: "dev", agent: "dev-1", key: "AUTH-1", requestAt: at }]);
  });
  it("не работает на паузе после лимита и при остановке", () => {
    const requests = [{ pool: "triage" as const, at, by: "owner" }];
    expect(planDispatch(state({ requests, config: { ...on, stopRunning: true } }), noon)).toEqual([]);
    expect(planDispatch(state({ requests, config: { ...on, pausedUntil: "2026-09-24T09:00:00Z" } }), noon)).toEqual([]);
  });
  it("занятый пул не получает второго воркера сверх слотов", () => {
    const requests = [{ pool: "deployer" as const, at, by: "owner" }];
    const s = state({ requests, heads: { "task/B": "bbb" }, review: [review("B", { testedSha: "bbb" })], running: [{ pool: "deployer", agent: "deployer" }] });
    expect(planDispatch(s, noon)).toEqual([]);
  });
  it("деплоер по просьбе — вне окна выкладки, но только протестированный коммит", () => {
    const late = new Date("2026-09-24T20:00:00Z");
    const requests = [{ pool: "deployer" as const, key: "B", at, by: "owner" }];
    expect(planDispatch(state({ config: DEFAULT_WORKERS, requests, heads: { "task/B": "bbb" }, review: [review("B", { testedSha: "bbb" })] }), late)).toEqual([
      { pool: "deployer", agent: "deployer", key: "B", requestAt: at },
    ]);
    expect(planDispatch(state({ config: DEFAULT_WORKERS, requests, heads: { "task/B": "ccc" }, review: [review("B", { testedSha: "bbb" })] }), late)).toEqual([]);
  });
  it("триаж без ключа при пустой очереди — обзор бэклога; просьба и автозапуск одну задачу дважды не берут", () => {
    expect(planDispatch(state({ config: DEFAULT_WORKERS, requests: [{ pool: "triage", at, by: "owner" }] }), noon)).toEqual([{ pool: "triage", agent: "triage", sweep: true, requestAt: at }]);
    const s = state({ requests: [{ pool: "tester", key: "A", at, by: "owner" }], heads: { "task/A": "aaa", "task/C": "ccc" }, review: [review("A"), review("C")] });
    expect(planDispatch(s, noon)).toEqual([{ pool: "tester", agent: "tester", key: "A", requestAt: at }]);
  });
});

describe("очереди и выбор пула", () => {
  it("очереди проверки делятся на тест, выкладку, занятые и без ветки", () => {
    const q0 = reviewQueues(
      [review("H", { testHoldUntil: new Date(Date.now() + 3600_000) }), review("P", { testHoldUntil: new Date(Date.now() - 1) })],
      { "task/H": "aaa", "task/P": "bbb" },
    );
    expect(q0.test.map((t) => t.key)).toEqual(["P"]);
    expect(q0.holding.map((t) => t.key)).toEqual(["H"]);
    const q = reviewQueues(
      [review("A"), review("B", { testedSha: "bbb" }), review("C", { claimedBy: "tester", claimUntil: new Date(noon.getTime() + 1000) }), review("D", { branch: null })],
      { "task/A": "aaa", "task/B": "bbb", "task/C": "ccc" },
      noon,
    );
    expect(q.test.map((t) => t.key)).toEqual(["A"]);
    expect(q.deploy.map((t) => t.key)).toEqual(["B"]);
    expect(q.held.map((t) => t.key)).toEqual(["C"]);
    expect(q.noBranch.map((t) => t.key)).toEqual(["D"]);
  });
  it("кнопка в шторке зовёт пул по статусу задачи", () => {
    expect(poolForTask({ status: "backlog", layer: "back" })).toBe("triage");
    expect(poolForTask({ status: "ready", layer: "back" })).toBe("dev");
    expect(poolForTask({ status: "ready", layer: "none" })).toBe("nocode");
    expect(poolForTask({ status: "blocked", layer: "none", blockedOn: "product" })).toBe("product");
    expect(poolForTask({ status: "blocked", layer: "back", blockedOn: "owner" })).toBe("triage");
    expect(poolForTask({ status: "blocked", layer: "front", blockedOn: "design" })).toBe("designer");
    expect(executorOf({ status: "backlog", layer: "front" })).toBe("triage");
    expect(executorOf({ status: "ready", layer: "back" })).toBe("dev");
    expect(executorOf({ status: "ready", layer: "none" })).toBe("nocode");
    expect(executorOf({ status: "done", layer: "back" })).toBe(null);
    expect(poolForTask({ status: "review", layer: "front" })).toBe("tester");
    expect(poolForTask({ status: "review", layer: "front", testedSha: "abc" })).toBe("deployer");
    expect(poolForTask({ status: "review", layer: "none" })).toBe(null);
    expect(poolForTask({ status: "done", layer: "back" })).toBe(null);
  });
  it("задача с needs_mockup=true без утверждения идёт к дизайнеру", () => {
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true })).toBe("designer");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true, mockupApprovedBy: null })).toBe("designer");
    expect(poolForTask({ status: "ready", layer: "none", mockupRequired: true })).toBe("designer");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true, mockupApprovedBy: "cto" })).toBe("dev");
    expect(poolForTask({ status: "ready", layer: "none", mockupRequired: true, mockupApprovedBy: "owner" })).toBe("nocode");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: false })).toBe("dev");
    expect(poolForTask({ status: "backlog", layer: "front", mockupRequired: true })).toBe("triage");
  });
});

describe("«Продукт и не-код»", () => {
  it("готовые задачи без кода получает свой пул, не разработчики", () => {
    expect(planDispatch(state({ readyForNocode: 2 }), noon)).toEqual([{ pool: "nocode", agent: "nocode-1" }]);
    expect(planDispatch(state({ productQueue: ["AUD-4", "DSN-2"] }), noon)).toEqual([{ pool: "product", agent: "product", keys: ["AUD-4", "DSN-2"] }]);
    expect(planDispatch(state({ productSweepDue: true }), noon)).toEqual([{ pool: "product", agent: "product", sweep: true }]);
    expect(planDispatch(state({ productSweepDue: false }), noon)).toEqual([]);
    expect(planDispatch(state({ designerQueue: ["DSN-3", "STAFF-1", "X-1", "X-2"] }), noon)).toEqual([{ pool: "designer", agent: "designer", keys: ["DSN-3", "STAFF-1", "X-1"] }]);
    expect(planDispatch(state({ readyForDev: 1, readyForNocode: 1 }), noon)).toEqual([
      { pool: "dev", agent: "dev-1" },
      { pool: "nocode", agent: "nocode-1" },
    ]);
  });
  it("выключенный пул и дневной лимит соблюдаются, «Запустить сейчас» на задачу — работает", () => {
    const off = { ...on, pools: { ...on.pools, nocode: { ...on.pools.nocode, enabled: false } } };
    expect(planDispatch(state({ config: off, readyForNocode: 3 }), noon)).toEqual([]);
    expect(planDispatch(state({ readyForNocode: 3, today: { triage: 0, product: 0, designer: 0, dev: 0, nocode: 8, tester: 0, deployer: 0 } }), noon)).toEqual([]);
    const at = "2026-09-24T07:59:00Z";
    expect(planDispatch(state({ config: DEFAULT_WORKERS, requests: [{ pool: "nocode", key: "TEAM-9", at, by: "owner" }] }), noon)).toEqual([
      { pool: "nocode", agent: "nocode-1", key: "TEAM-9", requestAt: at },
    ]);
  });
});

describe("быстрый слот триажа для входящих", () => {
  const at = "2026-09-24T07:59:00Z";
  it("входящая IN-N по просьбе запускается, даже когда триаж занят пачкой бэклога", () => {
    const s = state({ requests: [{ pool: "triage", key: "IN-7", at, by: "telegram" }], running: [{ pool: "triage", agent: "triage" }] });
    expect(planDispatch(s, noon)).toEqual([{ pool: "triage", agent: "triage-1", keys: ["IN-7"], requestAt: at }]);
  });
  it("обычная карточка по просьбе ждёт свободного слота; третьего триажа не бывает", () => {
    expect(planDispatch(state({ requests: [{ pool: "triage", key: "AUTH-1", at, by: "owner" }], running: [{ pool: "triage", agent: "triage" }] }), noon)).toEqual([]);
    const busy = [{ pool: "triage" as const, agent: "triage" }, { pool: "triage" as const, agent: "triage-1" }];
    expect(planDispatch(state({ requests: [{ pool: "triage", key: "IN-8", at, by: "owner" }], running: busy }), noon)).toEqual([]);
  });
});


describe("кнопки владельца: Пауза, Стоп, Старт, План старт", () => {
  const busy = { readyForDev: 3, triageQueue: ["IN-1"], heads: { "task/B": "bbb" }, review: [review("B", { testedSha: "bbb" })] };
  // Как сервис: патч кнопки поверх текущих настроек, пулы сливаются по одному
  const apply = (c: WorkersConfig, patch: ReturnType<typeof controlPatch>): WorkersConfig => {
    const pools = { ...c.pools };
    for (const p of Object.keys(patch.pools ?? {}) as (keyof typeof pools)[]) pools[p] = { ...pools[p], ...patch.pools![p] };
    return normalizeWorkers({ ...c, ...patch, pools });
  };
  const manualOff = { ...on, pools: { ...on.pools, dev: { ...on.pools.dev, mode: "manual" as const }, triage: { ...on.pools.triage, enabled: false } } };

  it("Пауза: новые запуски не начинаются, текущие не трогаются, пауза «до отмены»", () => {
    const c = apply(on, controlPatch("pause", noon));
    expect(workersState(c, noon)).toBe("paused");
    expect(c.stopRunning).toBe(false);
    expect(c.plannedStart).toBe(false);
    expect(Date.parse(c.pausedUntil!) - noon.getTime()).toBeGreaterThan(9 * 365 * 86400_000);
    expect(planDispatch(state({ ...busy, config: c }), noon)).toEqual([]);
    expect(planDispatch(state({ ...busy, config: c, running: [{ pool: "dev", agent: "dev-1" }] }), noon)).toEqual([]);
  });
  it("Стоп: пауза плюс остановка работающих; «Снять остановку» оставляет паузу", () => {
    const c = apply(on, controlPatch("stop", noon));
    expect(workersState(c, noon)).toBe("stopped");
    expect(c.stopRunning).toBe(true);
    expect(planDispatch(state({ ...busy, config: c }), noon)).toEqual([]);
    const released = normalizeWorkers({ ...c, stopRunning: false });
    expect(workersState(released, noon)).toBe("paused");
    expect(planDispatch(state({ ...busy, config: released }), noon)).toEqual([]);
  });
  it("Старт: снимает паузу и остановку, включает выключатель, все пулы — «Вкл.» и «Авто»", () => {
    const stopped = apply({ ...manualOff, enabled: false }, controlPatch("stop", noon));
    const c = apply(stopped, controlPatch("start", noon));
    expect(workersState(c, noon)).toBe("running");
    expect(c).toMatchObject({ enabled: true, stopRunning: false, pausedUntil: null, pausedReason: null, plannedStart: false });
    for (const p of Object.values(c.pools)) expect(p).toMatchObject({ enabled: true, mode: "auto" });
    // Модель, слоты и дневной лимит не сбрасываются
    expect(c.pools.dev.max).toBe(on.pools.dev.max);
    expect(planDispatch(state({ ...busy, config: c }), noon)).toEqual([
      { pool: "deployer", agent: "deployer", key: "B" },
      { pool: "triage", agent: "triage", keys: ["IN-1"] },
      { pool: "dev", agent: "dev-1" },
      { pool: "dev", agent: "dev-2" },
    ]);
  });
  it("План старт: до назначенного времени — пауза «старт по плану», после — запуски идут сами", () => {
    const at = new Date(noon.getTime() + 2 * 3600_000);
    const c = apply({ ...manualOff, enabled: false }, controlPatch("plan", noon, at));
    expect(workersState(c, noon)).toBe("planned");
    expect(c).toMatchObject({ enabled: true, plannedStart: true, pausedUntil: at.toISOString(), pausedReason: "Старт по плану" });
    expect(planDispatch(state({ ...busy, config: c }), noon)).toEqual([]);
    expect(planDispatch(state({ ...busy, config: c }), new Date(at.getTime() - 60_000))).toEqual([]);
    const later = new Date(at.getTime() + 60_000);
    expect(workersState(c, later)).toBe("running");
    expect(planDispatch(state({ ...busy, config: c }), later).length).toBeGreaterThan(0);
  });
  it("План старт в прошлом или без времени не принимается; Пауза и Старт отменяют план", () => {
    expect(() => controlPatch("plan", noon, new Date(noon.getTime() - 1))).toThrow("plan_time_past");
    expect(() => controlPatch("plan", noon, null)).toThrow("plan_time_past");
    const planned = apply(on, controlPatch("plan", noon, new Date(noon.getTime() + 3600_000)));
    expect(workersState(apply(planned, controlPatch("pause", noon)), noon)).toBe("paused");
    expect(workersState(apply(planned, controlPatch("start", noon)), noon)).toBe("running");
  });
  it("состояние словами: выключены, лимит подписки — пауза без плана", () => {
    expect(workersState(DEFAULT_WORKERS, noon)).toBe("off");
    expect(workersState({ ...on, pausedUntil: "2026-09-24T09:00:00Z", pausedReason: "лимит" }, noon)).toBe("paused");
    expect(workersState({ ...on, pausedUntil: "2026-09-24T07:00:00Z", plannedStart: true }, noon)).toBe("running");
  });
});
