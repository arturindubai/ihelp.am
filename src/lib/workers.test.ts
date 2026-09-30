import { describe, expect, it } from "vitest";
import { POOLS, DAILY_CAP_MAX, capLeft, normalizeDailyCap, controlPatch, DEFAULT_WORKERS, executorOf, filterDesignerCooldown, freeName, inDesignerQueue, normalizeWorkers, planDispatch, poolForTask, reviewQueues, runOutcome, testedCurrent, workersState, type DispatchState, type ReviewTask, type WorkersConfig } from "./workers";
import { poolPatchSchema, workersPatchSchema } from "./workers-schema";
import { unblockTarget } from "./cc-flow";

// 12:00 по Еревану (UTC+4) — удобное время для тестов диспетчера
const noon = new Date("2026-09-24T08:00:00Z");
const on = { ...DEFAULT_WORKERS, enabled: true };
// конфиг с явным окном выкладки 10–20 для тестов, проверяющих поведение окна
const onWindow = { ...on, deployWindow: [10, 20] as [number, number] };

const review = (key: string, patch: Partial<ReviewTask> = {}): ReviewTask => ({ key, branch: `task/${key}`, testedSha: null, claimedBy: null, claimUntil: null, ...patch });

const state = (patch: Partial<DispatchState> = {}): DispatchState => ({
  config: on,
  running: [],
  today: { triage: 0, product: 0, designer: 0, dev: 0, nocode: 0, tester: 0, deployer: 0 },
  productQueue: [],
  productSweepDue: false,
  productHold: [],
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
  it("deployWindow отсутствует или null — без ограничения (критерий 5)", () => {
    expect(normalizeWorkers({}).deployWindow).toBeNull();
    expect(normalizeWorkers({ deployWindow: null }).deployWindow).toBeNull();
  });
  it("deployWindow [0, 24] — старый формат «весь день» читается как null (критерий 5)", () => {
    expect(normalizeWorkers({ deployWindow: [0, 24] }).deployWindow).toBeNull();
  });
  it("deployWindow с конкретным окном сохраняется", () => {
    expect(normalizeWorkers({ deployWindow: [10, 20] }).deployWindow).toEqual([10, 20]);
    expect(normalizeWorkers({ deployWindow: [9, 18] }).deployWindow).toEqual([9, 18]);
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
    const c = normalizeWorkers({ enabled: true, capsOptional: true, pools: { dev: { enabled: true, max: 2, model: "opus", dailyCap: 5 } } });
    expect(c.pools.dev).toEqual({ enabled: true, max: 2, model: "opus", modelForL: "sonnet", dailyCap: 5, mode: "auto", everyMin: 30 });
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
  it("дневной лимит пула, если он задан, останавливает запуски; без лимита пул работает", () => {
    const today = { triage: 0, product: 0, designer: 0, dev: 16, nocode: 0, tester: 0, deployer: 0 };
    const capped = { ...on, pools: { ...on.pools, dev: { ...on.pools.dev, dailyCap: 16 } } };
    expect(planDispatch(state({ config: capped, readyForDev: 5, today }), noon)).toEqual([]);
    expect(planDispatch(state({ readyForDev: 5, today }), noon).filter((a) => a.pool === "dev").length).toBeGreaterThan(0);
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
    const s = state({ config: onWindow, heads: { "task/B": "bbb222" }, review: [review("B", { testedSha: "bbb222" })] });
    // 22:00 по Еревану (18:00 UTC) — вне окна 10–20
    expect(planDispatch(s, new Date("2026-09-24T18:00:00Z"))).toEqual([]);
    expect(planDispatch({ ...s, running: [{ pool: "deployer", agent: "deployer" }] }, noon)).toEqual([]);
  });
  it("окно не задано (null) — деплоер планируется в любой час (критерий 5)", () => {
    const noWindow = { ...on, deployWindow: null } as WorkersConfig;
    const s = state({ config: noWindow, heads: { "task/B": "bbb" }, review: [review("B", { testedSha: "bbb" })] });
    // ночь по Еревану — 02:00 UTC = 06:00 Yerevan
    expect(planDispatch(s, new Date("2026-09-24T22:00:00Z")).some((a) => a.pool === "deployer")).toBe(true);
    // полдень
    expect(planDispatch(s, noon).some((a) => a.pool === "deployer")).toBe(true);
  });
  it("окно задано — деплоер работает только внутри него (критерий 5)", () => {
    const withWindow = { ...on, deployWindow: [10, 20] } as WorkersConfig;
    const s = state({ config: withWindow, heads: { "task/B": "bbb" }, review: [review("B", { testedSha: "bbb" })] });
    // 12:00 по Еревану (UTC+4) = 08:00 UTC — внутри окна
    expect(planDispatch(s, new Date("2026-09-24T08:00:00Z")).some((a) => a.pool === "deployer")).toBe(true);
    // 22:00 по Еревану = 18:00 UTC — вне окна
    expect(planDispatch(s, new Date("2026-09-24T18:00:00Z")).some((a) => a.pool === "deployer")).toBe(false);
  });
  it("задачу, которую сейчас держит тестировщик или деплоер, никто второй не берёт", () => {
    const busy = review("A", { claimedBy: "tester", claimUntil: new Date(noon.getTime() + 60_000) });
    expect(planDispatch(state({ heads: { "task/A": "aaa" }, review: [busy] }), noon)).toEqual([]);
  });
  it("задачу без отправленной ветки не тестируем и не выкладываем", () => {
    expect(planDispatch(state({ heads: {}, review: [review("A")] }), noon)).toEqual([]);
  });
  it("deployBatch=1 — прежнее поведение: одна задача с key", () => {
    const heads = { "task/A": "aaa", "task/B": "bbb" };
    const s = state({ config: { ...on, deployBatch: 1 }, heads, review: [review("A", { testedSha: "aaa" }), review("B", { testedSha: "bbb" })] });
    const plan = planDispatch(s, noon).filter((a) => a.pool === "deployer");
    expect(plan).toHaveLength(1);
    expect(plan[0].key).toBeDefined();
    expect(plan[0].keys).toBeUndefined();
  });
  it("deployBatch=3 — деплоер получает пачку из трёх задач через keys", () => {
    const heads = { "task/A": "aaa", "task/B": "bbb", "task/C": "ccc", "task/D": "ddd" };
    const s = state({
      config: { ...on, deployBatch: 3 },
      heads,
      review: [review("A", { testedSha: "aaa" }), review("B", { testedSha: "bbb" }), review("C", { testedSha: "ccc" }), review("D", { testedSha: "ddd" })],
    });
    const plan = planDispatch(s, noon).filter((a) => a.pool === "deployer");
    expect(plan).toHaveLength(1);
    expect(plan[0].keys).toHaveLength(3);
    expect(plan[0].key).toBeUndefined();
  });
  it("deployBatch=3 с одной задачей — используется key, а не keys", () => {
    const heads = { "task/A": "aaa" };
    const s = state({ config: { ...on, deployBatch: 3 }, heads, review: [review("A", { testedSha: "aaa" })] });
    const plan = planDispatch(s, noon).filter((a) => a.pool === "deployer");
    expect(plan).toHaveLength(1);
    expect(plan[0].key).toBe("A");
    expect(plan[0].keys).toBeUndefined();
  });
});

describe("имена и итоги запусков", () => {
  it("свободные имена", () => {
    expect(freeName("dev", ["dev-1"])).toBe("dev-2");
    expect(freeName("tester", [])).toBe("tester");
    expect(freeName("tester", ["tester"])).toBe("tester-2");
  });
  it("имя с задачей в работе (claimedAgents) не выбирается — отказ agent_busy не возникает (критерий 5)", () => {
    // dev-1 держит задачу в работе, но нет активного запуска systemd
    const s = state({ readyForDev: 2, claimedAgents: [{ pool: "dev", agent: "dev-1" }] });
    const actions = planDispatch(s, noon);
    // оба слота dev: dev-1 занят claimedAgents, должен выбраться dev-2 и dev-3
    expect(actions.every((a) => a.agent !== "dev-1")).toBe(true);
    expect(actions.find((a) => a.pool === "dev" && a.agent === "dev-2")).toBeTruthy();
  });
  it("два работающих разработчика с задачами, лимит 4 — планируются ещё два запуска (критерий 5, без дублей)", () => {
    // Без дедупликации: running=[dev-1,dev-2], claimedAgents=[dev-1,dev-2] → names.length=4, free=0 → никого
    // С дедупликацией через Set: names={dev-1,dev-2}.length=2, free=2 → dev-3 и dev-4
    const config4 = { ...on, pools: { ...on.pools, dev: { ...on.pools.dev, max: 4 } } };
    const s = state({
      config: config4,
      readyForDev: 4,
      running: [{ pool: "dev" as const, agent: "dev-1" }, { pool: "dev" as const, agent: "dev-2" }],
      claimedAgents: [{ pool: "dev" as const, agent: "dev-1" }, { pool: "dev" as const, agent: "dev-2" }],
    });
    const devActions = planDispatch(s, noon).filter((a) => a.pool === "dev");
    expect(devActions).toHaveLength(2);
    expect(devActions.every((a) => !["dev-1", "dev-2"].includes(a.agent))).toBe(true);
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
  it("по расписанию — карточки в очереди обрабатываются без ограничения интервала; обзор бэклога (пустая очередь) — по интервалу", () => {
    const config = { ...on, pools: { ...on.pools, triage: { ...on.pools.triage, mode: "scheduled" as const, everyMin: 60 } } };
    const recent = { triage: new Date(noon.getTime() - 20 * 60_000).toISOString() };
    const old = { triage: new Date(noon.getTime() - 61 * 60_000).toISOString() };
    // Непустая очередь — запускаем, игнорируя расписание
    expect(planDispatch(state({ config, triageQueue: ["A-1"], lastStart: recent }), noon)).toEqual([{ pool: "triage", agent: "triage", keys: ["A-1"] }]);
    expect(planDispatch(state({ config, triageQueue: ["A-1"], lastStart: old }), noon)).toEqual([{ pool: "triage", agent: "triage", keys: ["A-1"] }]);
    // Обзор бэклога при пустой очереди — только по расписанию
    expect(planDispatch(state({ config, sweepDue: true, lastStart: recent }), noon)).toEqual([]);
    expect(planDispatch(state({ config, sweepDue: true, lastStart: old }), noon)).toEqual([{ pool: "triage", agent: "triage", sweep: true }]);
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
  it("задача с needs_mockup=true и написанными требованиями идёт к дизайнеру (шаг 2)", () => {
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true, screenRequirements: "Экран списка" })).toBe("designer");
    expect(poolForTask({ status: "ready", layer: "none", mockupRequired: true, screenRequirements: "Детали" })).toBe("designer");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true, mockupApprovedBy: "cto", screenRequirements: "Экран" })).toBe("dev");
    expect(poolForTask({ status: "ready", layer: "none", mockupRequired: true, mockupApprovedBy: "owner", screenRequirements: "Экран" })).toBe("nocode");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: false })).toBe("dev");
    expect(poolForTask({ status: "backlog", layer: "front", mockupRequired: true })).toBe("triage");
  });
  it("задача с needs_mockup=true без screenRequirements идёт к продакту (шаг 1)", () => {
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true })).toBe("product");
    expect(poolForTask({ status: "ready", layer: "front", mockupRequired: true, mockupApprovedBy: null, screenRequirements: null })).toBe("product");
    expect(poolForTask({ status: "ready", layer: "none", mockupRequired: true, screenRequirements: "" })).toBe("product");
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
    const cappedNocode = { ...on, pools: { ...on.pools, nocode: { ...on.pools.nocode, dailyCap: 8 } } };
    expect(planDispatch(state({ config: cappedNocode, readyForNocode: 3, today: { triage: 0, product: 0, designer: 0, dev: 0, nocode: 8, tester: 0, deployer: 0 } }), noon)).toEqual([]);
    const at = "2026-09-24T07:59:00Z";
    expect(planDispatch(state({ config: DEFAULT_WORKERS, requests: [{ pool: "nocode", key: "TEAM-9", at, by: "owner" }] }), noon)).toEqual([
      { pool: "nocode", agent: "nocode-1", key: "TEAM-9", requestAt: at },
    ]);
  });
});

describe("продакт: задачи ready с opens needs и холд на 60 мин", () => {
  it("задача «В очереди» с открытыми needs попадает в очередь продакта (страховка)", () => {
    const plan = planDispatch(state({ productQueue: ["DEV-1"] }), noon);
    expect(plan).toContainEqual(expect.objectContaining({ pool: "product", keys: ["DEV-1"] }));
  });
  it("задача в productHold продакту повторно не выдаётся в течение 60 мин", () => {
    const plan = planDispatch(state({ productQueue: ["DEV-1", "DEV-2"], productHold: ["DEV-1"] }), noon);
    expect(plan).toContainEqual(expect.objectContaining({ pool: "product", keys: ["DEV-2"] }));
    expect(plan.find((a) => a.pool === "product")?.keys).not.toContain("DEV-1");
  });
  it("после истечения холда (или при отсутствии) задача снова идёт продакту", () => {
    expect(planDispatch(state({ productQueue: ["DEV-1"], productHold: [] }), noon)).toContainEqual(
      expect.objectContaining({ pool: "product", keys: ["DEV-1"] }),
    );
    expect(planDispatch(state({ productQueue: ["DEV-1"], productHold: ["DEV-2"] }), noon)).toContainEqual(
      expect.objectContaining({ pool: "product", keys: ["DEV-1"] }),
    );
  });
  it("если все задачи в холде и нет обзора — продакта не запускаем", () => {
    const plan = planDispatch(state({ productQueue: ["DEV-1"], productHold: ["DEV-1"], productSweepDue: false }), noon);
    expect(plan.find((a) => a.pool === "product")).toBeUndefined();
  });
});

describe("две просьбы к одному пулу", () => {
  const at1 = "2026-09-24T06:00:00Z";
  const at2 = "2026-09-24T06:01:00Z";
  it("пул с одним слотом: первая просьба идёт в план, вторая не создаёт лишнего действия", () => {
    const s = state({
      requests: [
        { pool: "designer" as const, key: "DSN-1", at: at1, by: "owner" },
        { pool: "designer" as const, key: "DSN-3", at: at2, by: "owner" },
      ],
    });
    const actions = planDispatch(s, noon);
    const da = actions.filter((a) => a.pool === "designer");
    expect(da).toHaveLength(1);
    expect(da[0]).toMatchObject({ pool: "designer", requestAt: at1 });
  });
  it("после запуска первой просьбы слот занят — вторая не порождает лишнего действия", () => {
    const s = state({
      running: [{ pool: "designer" as const, agent: "designer" }],
      requests: [{ pool: "designer" as const, key: "DSN-3", at: at2, by: "owner" }],
    });
    expect(planDispatch(s, noon).filter((a) => a.pool === "designer")).toHaveLength(0);
  });
  it("когда слот снова свободен — вторая просьба выполняется", () => {
    const s = state({
      requests: [{ pool: "designer" as const, key: "DSN-3", at: at2, by: "owner" }],
    });
    const actions = planDispatch(s, noon).filter((a) => a.pool === "designer");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ requestAt: at2 });
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

describe("отбор очереди дизайнера", () => {
  const base = { mockupRequired: false, mockupApprovedBy: null, mockupUrl: null, design: null, layer: "front", blockedOn: null, hasImageAttachments: false, hasAnyAttachments: false, needsDesign: null as boolean | null };

  it("задача заблокирована на дизайне без поданного макета — в очереди", () => {
    expect(inDesignerQueue({ ...base, status: "blocked", blockedOn: "design" })).toBe(true);
  });
  it("задача заблокирована на дизайне, но mockupUrl уже есть — ждёт утверждения, не в очереди", () => {
    expect(inDesignerQueue({ ...base, status: "blocked", blockedOn: "design", mockupUrl: "/uploads/2026-09/abc.png" })).toBe(false);
  });
  it("задача с needs_mockup, написанными требованиями, без файлов — в очереди дизайнера (шаг 2)", () => {
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, screenRequirements: "Экран списка заказов" })).toBe(true);
    expect(inDesignerQueue({ ...base, status: "in_progress", mockupRequired: true, screenRequirements: "Детальный экран" })).toBe(true);
  });
  it("задача с needs_mockup без screenRequirements — НЕ в очереди дизайнера (шаг 1: к продакту)", () => {
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, screenRequirements: null })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, screenRequirements: "" })).toBe(false);
  });
  it("нужен макет, но mockupUrl или картинки уже есть — ждёт утверждения, не в очереди", () => {
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, mockupUrl: "/uploads/2026-09/x.png" })).toBe(false);
    // hasImageAttachments → hasAnyAttachments тоже true (картинки — подмножество всех файлов)
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, hasImageAttachments: true, hasAnyAttachments: true })).toBe(false);
  });
  it("нужен макет, утверждён — не в очереди (разработчик возьмёт)", () => {
    // После утверждения задача готова к разработке, даже если нет текстового дизайна
    expect(inDesignerQueue({ ...base, status: "ready", mockupRequired: true, mockupApprovedBy: "owner" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", layer: "front", design: null, mockupApprovedBy: "cto" })).toBe(false);
  });
  it("задача с флагом needsDesign без описания дизайна и без файлов — в очереди", () => {
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "front", needsDesign: true })).toBe(true);
    expect(inDesignerQueue({ ...base, status: "ready", layer: "front", needsDesign: true })).toBe(true);
    // любой слой с флагом — к дизайнеру
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "back", needsDesign: true })).toBe(true);
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "fullstack", needsDesign: true })).toBe(true);
  });
  it("задача без флага needsDesign не идёт к дизайнеру независимо от слоя", () => {
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "front" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", layer: "front" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "fullstack" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "back" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "none" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "backlog", layer: "front", needsDesign: false })).toBe(false);
  });
  it("задача с флагом needsDesign, но описание или файлы уже есть — не в очереди", () => {
    expect(inDesignerQueue({ ...base, status: "ready", layer: "front", needsDesign: true, design: "Экран списка..." })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", layer: "fullstack", needsDesign: true, hasAnyAttachments: true })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "ready", layer: "front", needsDesign: true, mockupApprovedBy: "owner" })).toBe(false);
  });
  it("заблокирована не на дизайне — не в очереди дизайнера", () => {
    expect(inDesignerQueue({ ...base, status: "blocked", blockedOn: "product" })).toBe(false);
    expect(inDesignerQueue({ ...base, status: "blocked", blockedOn: "owner" })).toBe(false);
  });
});

describe("60-минутное остывание очереди дизайнера", () => {
  const t = (key: string, updatedAt: Date) => ({ key, updatedAt });
  const now = new Date("2026-09-27T10:00:00Z");

  it("задача не выдавалась дизайнеру — всегда в очереди", () => {
    expect(filterDesignerCooldown([t("A", new Date("2026-09-27T09:00:00Z"))], new Map(), now)).toHaveLength(1);
  });
  it("задача выдавалась более 60 минут назад — остывание истекло, снова в очереди", () => {
    const seen = new Map([["A", new Date("2026-09-27T08:59:00Z")]]);
    expect(filterDesignerCooldown([t("A", new Date("2026-09-27T08:00:00Z"))], seen, now)).toHaveLength(1);
  });
  it("задача выдавалась менее 60 минут назад и не менялась — не в очереди", () => {
    const seen = new Map([["A", new Date("2026-09-27T09:30:00Z")]]);
    expect(filterDesignerCooldown([t("A", new Date("2026-09-27T09:00:00Z"))], seen, now)).toHaveLength(0);
  });
  it("задача выдавалась менее 60 минут назад, но обновилась после — снова в очереди", () => {
    const seen = new Map([["A", new Date("2026-09-27T09:30:00Z")]]);
    expect(filterDesignerCooldown([t("A", new Date("2026-09-27T09:45:00Z"))], seen, now)).toHaveLength(1);
  });
  it("остывание не касается других задач", () => {
    const seen = new Map([["A", new Date("2026-09-27T09:30:00Z")]]);
    const tasks = [t("A", new Date("2026-09-27T09:00:00Z")), t("B", new Date("2026-09-27T09:00:00Z"))];
    const result = filterDesignerCooldown(tasks, seen, now);
    expect(result.map((x) => x.key)).toEqual(["B"]);
  });
});

describe("пулы product и designer при лимите > 1", () => {
  it("второй запуск получает имя с суффиксом и не берёт задачи первого запуска", () => {
    const config2 = { ...on, pools: { ...on.pools, designer: { ...on.pools.designer, max: 2 } } };
    const s = state({
      config: config2,
      running: [{ pool: "designer" as const, agent: "designer", keys: ["DSN-1", "DSN-2", "DSN-3"] }],
      designerQueue: ["DSN-1", "DSN-4", "DSN-5"],
    });
    const actions = planDispatch(s, noon).filter((a) => a.pool === "designer");
    expect(actions).toHaveLength(1);
    expect(actions[0].agent).toBe("designer-2");
    expect((actions[0].keys ?? []).includes("DSN-1")).toBe(false);
    expect(actions[0].keys).toContain("DSN-4");
  });
  it("два запуска идут — третий не создаётся", () => {
    const config2 = { ...on, pools: { ...on.pools, designer: { ...on.pools.designer, max: 2 } } };
    const s = state({
      config: config2,
      running: [
        { pool: "designer" as const, agent: "designer", keys: ["DSN-1"] },
        { pool: "designer" as const, agent: "designer-2", keys: ["DSN-2"] },
      ],
      designerQueue: ["DSN-3", "DSN-4"],
    });
    expect(planDispatch(s, noon).filter((a) => a.pool === "designer")).toHaveLength(0);
  });
  it("два запуска с одинаковым именем (legacy) — третий не создаётся (считаем экземпляры, не уникальные имена)", () => {
    const config2 = { ...on, pools: { ...on.pools, designer: { ...on.pools.designer, max: 2 } } };
    const s = state({
      config: config2,
      running: [
        { pool: "designer" as const, agent: "designer", keys: ["DSN-1"] },
        { pool: "designer" as const, agent: "designer", keys: ["DSN-2"] },
      ],
      designerQueue: ["DSN-3", "DSN-4"],
    });
    expect(planDispatch(s, noon).filter((a) => a.pool === "designer")).toHaveLength(0);
  });
  it("то же для пула product: второй запуск — product-2, без дублей задач", () => {
    const config2 = { ...on, pools: { ...on.pools, product: { ...on.pools.product, max: 2 } } };
    const s = state({
      config: config2,
      running: [{ pool: "product" as const, agent: "product", keys: ["AUD-4"] }],
      productQueue: ["AUD-4", "DSN-2", "X-1"],
    });
    const actions = planDispatch(s, noon).filter((a) => a.pool === "product");
    expect(actions).toHaveLength(1);
    expect(actions[0].agent).toBe("product-2");
    expect((actions[0].keys ?? []).includes("AUD-4")).toBe(false);
  });
});

describe("схема настроек пулов (workersPatchSchema)", () => {
  it("принимает все семь пулов из POOLS, неизвестный ключ — ошибка", () => {
    expect(POOLS.length).toBe(7);
    for (const p of POOLS) {
      expect(workersPatchSchema.safeParse({ pools: { [p]: { enabled: true } } }).success, `пул ${p} должен приниматься`).toBe(true);
    }
    expect(workersPatchSchema.safeParse({ pools: { unknown_pool: { enabled: true } } }).success).toBe(false);
  });
});

describe("цель разблокировки при утверждении дизайна", () => {
  it("задача была заблокирована из очереди — возвращается в очередь", () => {
    expect(unblockTarget("ready", "owner")).toBe("ready");
    expect(unblockTarget("ready", "cto")).toBe("ready");
    expect(unblockTarget("ready", "dev")).toBe("ready");
  });
  it("задача была заблокирована с проверки — возвращается на проверку", () => {
    expect(unblockTarget("review", "owner")).toBe("review");
    expect(unblockTarget("review", "cto")).toBe("review");
  });
  it("задача была заблокирована из бэклога — возвращается в бэклог (только для ролей с правом)", () => {
    expect(unblockTarget("backlog", "owner")).toBe("backlog");
    expect(unblockTarget("backlog", "cto")).toBe("backlog");
    // dev не имеет права вернуть в backlog — переходит в ready
    expect(unblockTarget("backlog", "dev")).toBe("ready");
  });
  it("blockedFrom не задан — возвращается в очередь", () => {
    expect(unblockTarget(null, "owner")).toBe("ready");
    expect(unblockTarget(undefined, "dev")).toBe("ready");
  });
});

describe("суточный лимит пула необязателен (DEV-110)", () => {
  it("по умолчанию лимита нет ни у одного пула", () => {
    const c = normalizeWorkers({});
    for (const p of POOLS) expect(c.pools[p].dailyCap).toBeNull();
    expect(c.capsOptional).toBe(true);
  });

  it("настройки, сохранённые при обязательном лимите, читаются без ошибки и без лимитов", () => {
    const c = normalizeWorkers({ enabled: true, pools: { dev: { max: 4, dailyCap: 90 }, tester: { max: 4, dailyCap: 90 }, designer: { max: 2, dailyCap: 20 } } });
    expect(c.pools.dev.dailyCap).toBeNull();
    expect(c.pools.tester.dailyCap).toBeNull();
    expect(c.pools.designer.dailyCap).toBeNull();
    expect(c.pools.dev.max).toBe(4);
  });

  it("лимит, заданный после снятия, сохраняется; пустое значение — без лимита", () => {
    const c = normalizeWorkers({ capsOptional: true, pools: { dev: { dailyCap: 120 }, tester: { dailyCap: null }, designer: { dailyCap: 5000 } } });
    expect(c.pools.dev.dailyCap).toBe(120);
    expect(c.pools.tester.dailyCap).toBeNull();
    expect(c.pools.designer.dailyCap).toBe(DAILY_CAP_MAX);
  });

  it("normalizeDailyCap: пусто, null и мусор — без лимита; ноль остаётся нулём", () => {
    expect(normalizeDailyCap(null)).toBeNull();
    expect(normalizeDailyCap(undefined)).toBeNull();
    expect(normalizeDailyCap("")).toBeNull();
    expect(normalizeDailyCap("abc")).toBeNull();
    expect(normalizeDailyCap(0)).toBe(0);
    expect(normalizeDailyCap(-3)).toBe(0);
    expect(normalizeDailyCap(16)).toBe(16);
  });

  it("capLeft: без лимита остаток бесконечен при любом числе запусков; с лимитом — останавливается на нём", () => {
    expect(capLeft(null, 0)).toBe(Infinity);
    expect(capLeft(null, 500)).toBe(Infinity);
    expect(capLeft(90, 89)).toBe(1);
    expect(capLeft(90, 90)).toBe(0);
    expect(capLeft(90, 120)).toBe(0);
  });

  it("схема настроек принимает пустой лимит и отклоняет значение выше границы", () => {
    expect(poolPatchSchema.safeParse({ dailyCap: null }).success).toBe(true);
    expect(poolPatchSchema.safeParse({ dailyCap: 250 }).success).toBe(true);
    expect(poolPatchSchema.safeParse({ dailyCap: DAILY_CAP_MAX + 1 }).success).toBe(false);
  });
});
