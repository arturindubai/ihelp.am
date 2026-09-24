import { describe, expect, it } from "vitest";
import { DEFAULT_WORKERS, freeName, normalizeWorkers, planDispatch, poolForTask, reviewQueues, runOutcome, testedCurrent, type DispatchState, type ReviewTask } from "./workers";

// 12:00 по Еревану — внутри окна выкладки 10–20
const noon = new Date("2026-09-24T08:00:00Z");
const on = { ...DEFAULT_WORKERS, enabled: true };

const review = (key: string, patch: Partial<ReviewTask> = {}): ReviewTask => ({ key, branch: `task/${key}`, testedSha: null, claimedBy: null, claimUntil: null, ...patch });

const state = (patch: Partial<DispatchState> = {}): DispatchState => ({
  config: on,
  running: [],
  today: { triage: 0, dev: 0, tester: 0, deployer: 0 },
  review: [],
  readyForDev: 0,
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
    expect(planDispatch(state({ readyForDev: 5, today: { triage: 0, dev: 16, tester: 0, deployer: 0 } }), noon)).toEqual([]);
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
    expect(poolForTask({ status: "ready", layer: "none" })).toBe("triage");
    expect(poolForTask({ status: "review", layer: "front" })).toBe("tester");
    expect(poolForTask({ status: "review", layer: "front", testedSha: "abc" })).toBe("deployer");
    expect(poolForTask({ status: "review", layer: "none" })).toBe(null);
    expect(poolForTask({ status: "done", layer: "back" })).toBe(null);
  });
});
