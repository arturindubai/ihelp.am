import { describe, expect, it } from "vitest";
import { DEFAULT_WORKERS, freeName, normalizeWorkers, planDispatch, runOutcome, testedCurrent, type DispatchState, type ReviewTask } from "./workers";

// 12:00 по Еревану — внутри окна выкладки 10–20
const noon = new Date("2026-09-24T08:00:00Z");
const on = { ...DEFAULT_WORKERS, enabled: true };

const review = (key: string, patch: Partial<ReviewTask> = {}): ReviewTask => ({ key, branch: `task/${key}`, testedSha: null, claimedBy: null, claimUntil: null, ...patch });

const state = (patch: Partial<DispatchState> = {}): DispatchState => ({
  config: on,
  running: [],
  today: { dev: 0, tester: 0, deployer: 0 },
  review: [],
  readyForDev: 0,
  heads: {},
  ...patch,
});

describe("настройки воркеров", () => {
  it("битое значение превращается в безопасные настройки по умолчанию, по умолчанию всё выключено", () => {
    const c = normalizeWorkers("мусор");
    expect(c.enabled).toBe(false);
    expect(c.pools.dev.max).toBe(2);
    expect(c.pools.deployer.max).toBe(1);
  });
  it("деплоер всегда один, модель — только из списка", () => {
    const c = normalizeWorkers({ enabled: true, pools: { deployer: { max: 5 }, dev: { model: "gpt" } } });
    expect(c.pools.deployer.max).toBe(1);
    expect(c.pools.dev.model).toBe("sonnet");
  });
});

describe("план диспетчера", () => {
  it("пустые очереди — никого не запускаем, токены не тратятся", () => {
    expect(planDispatch(state(), noon)).toEqual([]);
  });
  it("выключено, пауза после лимита или остановка — никого", () => {
    const busy = { readyForDev: 3 };
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
    expect(planDispatch(state({ readyForDev: 5, today: { dev: 16, tester: 0, deployer: 0 } }), noon)).toEqual([]);
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
