import { describe, expect, it } from "vitest";
import {
  canCreateTask,
  canTransition,
  unblockTarget,
  doneGate,
  isReady,
  needsReason,
  nextStatuses,
  pickNext,
  readiness,
  reviewGate,
  roleOf,
  scopeOverlap,
  taskHealth,
  watchdogPlan,
  LEASE_MIN,
  RETURN_AFTER_STALE_MIN,
  WORKER_ROLES,
  type HealthTask,
} from "./cc-flow";

const now = new Date("2026-09-24T12:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);

const task = (patch: Partial<HealthTask> = {}): HealthTask => ({
  key: "T-1",
  status: "in_progress",
  claimedBy: "dev-1",
  claimUntil: min(30),
  heartbeatAt: min(-5),
  assignee: null,
  staleAt: null,
  updatedAt: min(-10),
  blockedOn: null,
  depends: [],
  rework: 0,
  reclaims: 0,
  ...patch,
});

describe("дизайнер", () => {
  it("сдаёт и передаёт свою задачу, но не закрывает", () => {
    expect(canTransition("in_progress", "review", "designer")).toBe(true);
    expect(canTransition("in_progress", "ready", "designer")).toBe(true);
    expect(canTransition("review", "done", "designer")).toBe(false);
  });
});

describe("разблокировка", () => {
  it("возвращает задачу туда, откуда заблокирована", () => {
    expect(unblockTarget("review", "owner")).toBe("review");
    expect(unblockTarget("review", "dev")).toBe("review");
    expect(unblockTarget("backlog", "triage")).toBe("backlog");
    expect(unblockTarget("backlog", "dev")).toBe("ready");
    expect(unblockTarget("in_progress", "owner")).toBe("ready");
    expect(unblockTarget(null, "owner")).toBe("ready");
  });
});

describe("сторож и проверка", () => {
  it("сторож может заблокировать задачу на проверке, но не закрыть её", () => {
    expect(canTransition("review", "blocked", "watchdog")).toBe(true);
    expect(canTransition("review", "done", "watchdog")).toBe(false);
  });
});

describe("роли", () => {
  it("роль берётся из префикса имени агента", () => {
    expect(roleOf("dev-2")).toBe("dev");
    expect(roleOf("deployer")).toBe("deployer");
    expect(roleOf("cto")).toBe("cto");
    expect(roleOf("Product-1")).toBe("product");
    expect(roleOf("nocode-2")).toBe("nocode");
    expect(roleOf("triage")).toBe("triage");
  });
  it("незнакомое имя и попытка назваться сторожем получают права разработчика", () => {
    expect(roleOf("claude-code")).toBe("dev");
    expect(roleOf("watchdog")).toBe("dev");
  });
});

describe("переходы", () => {
  it("разработчик не может закрыть задачу и не может сам объявить её готовой к работе", () => {
    expect(canTransition("review", "done", "dev")).toBe(false);
    expect(canTransition("backlog", "ready", "dev")).toBe(false);
    expect(canTransition("in_progress", "review", "dev")).toBe(true);
  });
  it("закрывает только деплоер или владелец", () => {
    expect(canTransition("review", "done", "deployer")).toBe(true);
    expect(canTransition("review", "done", "owner")).toBe(true);
    expect(canTransition("review", "done", "cto")).toBe(false);
  });
  it("из бэклога нельзя сразу в работу: сначала готовность", () => {
    expect(canTransition("backlog", "in_progress", "owner")).toBe(false);
    expect(nextStatuses("backlog", "cto")).toEqual(["ready", "blocked", "cancelled"]);
  });
  it("владелец и CTO могут отклонить задачу с проверки, разработчик — нет", () => {
    expect(canTransition("review", "cancelled", "owner")).toBe(true);
    expect(canTransition("review", "cancelled", "cto")).toBe(true);
    expect(canTransition("review", "cancelled", "product")).toBe(true);
    expect(canTransition("review", "cancelled", "deployer")).toBe(false);
    expect(canTransition("review", "cancelled", "dev")).toBe(false);
  });
  it("возврат на доработку и отмена требуют причины", () => {
    expect(needsReason("review", "ready")).toBe(true);
    expect(needsReason("review", "cancelled")).toBe(true);
    expect(needsReason("ready", "cancelled")).toBe(true);
    expect(needsReason("backlog", "ready")).toBe(false);
  });
});

describe("готовность к работе", () => {
  const base = { summary: "Зачем: клиенты не могут войти без кода", requirements: ["Код приходит в Telegram", "Ошибки видны в логах"], needs: [], depends: [], layer: "back", estimate: "M", scope: ["src/server/otp.ts"] };

  it("полная задача готова, мягких предупреждений нет", () => {
    const items = readiness(base, new Set());
    expect(isReady(items)).toBe(true);
    expect(items.filter((i) => !i.ok)).toEqual([]);
  });
  it("без критериев приёмки задача не готова", () => {
    expect(isReady(readiness({ ...base, requirements: [] }, new Set()))).toBe(false);
  });
  it("незакрытые зависимости и вопросы к продукту — предупреждения, а не запрет", () => {
    const items = readiness({ ...base, depends: ["X-1"], needs: ["Ключ API"] }, new Set());
    expect(isReady(items)).toBe(true);
    expect(items.filter((i) => !i.ok).map((i) => i.key)).toEqual(["needs", "deps"]);
  });
  it("интерфейсной задаче нужен дизайн — текстом или файлом", () => {
    const ui = { ...base, layer: "front" };
    expect(readiness(ui, new Set()).find((i) => i.key === "design")?.ok).toBe(false);
    expect(readiness(ui, new Set(), 1).find((i) => i.key === "design")?.ok).toBe(true);
  });
});

describe("гейт макета", () => {
  const base = { summary: "Зачем: клиенты не могут войти без кода", requirements: ["Код приходит в Telegram", "Ошибки видны в логах"], needs: [], depends: [], layer: "front", estimate: "M", scope: ["src/app/login/"], design: "есть дизайн" };

  it("без флага mockupRequired задача готова как обычно", () => {
    expect(isReady(readiness(base, new Set()))).toBe(true);
    expect(readiness(base, new Set()).find((i) => i.key === "mockup")?.ok).toBe(true);
  });
  it("с флагом mockupRequired без утверждения — жёсткий блокер", () => {
    const items = readiness({ ...base, mockupRequired: true }, new Set());
    expect(isReady(items)).toBe(false);
    const mockupItem = items.find((i) => i.key === "mockup");
    expect(mockupItem?.ok).toBe(false);
    expect(mockupItem?.hard).toBe(true);
  });
  it("с флагом mockupRequired и утверждением — гейт снят", () => {
    const items = readiness({ ...base, mockupRequired: true, mockupApprovedBy: "Артур" }, new Set());
    expect(isReady(items)).toBe(true);
    expect(items.find((i) => i.key === "mockup")?.ok).toBe(true);
  });
  it("mockup_required — только для задач с флагом; остальные не затронуты", () => {
    const noneLayer = { ...base, layer: "none" };
    expect(isReady(readiness(noneLayer, new Set()))).toBe(true);
    expect(isReady(readiness({ ...noneLayer, mockupRequired: true }, new Set()))).toBe(false);
    expect(isReady(readiness({ ...noneLayer, mockupRequired: true, mockupApprovedBy: "cto" }, new Set()))).toBe(true);
  });
});

describe("гейты сдачи", () => {
  it("на проверку код-задача уходит только с веткой и отчётом", () => {
    const report = "Сделано: вход через бота. Проверено: tsc, vitest, стенд 8082.";
    expect(reviewGate({ layer: "back", branch: null }, report)).toBe("branch_required");
    expect(reviewGate({ layer: "back", branch: "task/AUTH-1" }, "готово")).toBe("report_required");
    expect(reviewGate({ layer: "back", branch: "task/AUTH-1" }, report)).toBeNull();
    expect(reviewGate({ layer: "none", branch: null }, report)).toBeNull();
  });
  it("«Готово» у код-задачи — только с коммитом и доказательством", () => {
    expect(doneGate({ layer: "back" }, { text: "smoke OK, вход проверен в проде" })).toBe("sha_required");
    expect(doneGate({ layer: "back" }, { sha: "d149ace", text: "" })).toBe("proof_required");
    expect(doneGate({ layer: "back" }, { sha: "d149ace", text: "smoke OK, вход проверен в проде" })).toBeNull();
  });
  it("не-код задачу закрывает доказательство словами или файлом", () => {
    expect(doneGate({ layer: "none" }, { text: "" })).toBe("proof_required");
    expect(doneGate({ layer: "none" }, { text: "", attachments: 1 })).toBeNull();
  });
});

describe("параллельная работа", () => {
  it("папка и файл внутри неё пересекаются, соседние файлы — нет", () => {
    expect(scopeOverlap(["src/server/services/"], ["src/server/services/cc.ts"])).toEqual(["src/server/services"]);
    expect(scopeOverlap(["src/lib/pricing.ts"], ["src/lib/slots.ts"])).toEqual([]);
    expect(scopeOverlap(["./messages/ru.json"], ["messages/ru.json"])).toEqual(["messages/ru.json"]);
  });
  it("следующей берётся возвращённая на доработку, затем по приоритету, пропуская занятый код и незакрытые зависимости", () => {
    const c = (key: string, patch: Partial<{ priority: string; sort: number; rework: number; depends: string[]; scope: string[] }> = {}) => ({
      key,
      priority: "p1",
      sort: 0,
      rework: 0,
      depends: [],
      scope: [],
      ...patch,
    });
    const list = [c("A", { priority: "p0", scope: ["src/lib/pricing.ts"] }), c("B", { priority: "p0", depends: ["Z"] }), c("C", { priority: "p1", rework: 1 }), c("D", { priority: "p0", sort: 5 })];
    expect(pickNext(list, new Set(), [])?.key).toBe("C");
    const rest = list.filter((t) => t.key !== "C");
    expect(pickNext(rest, new Set(), [["src/lib"]])?.key).toBe("D");
    expect(pickNext(rest, new Set(["Z"]), [["src/lib"]])?.key).toBe("B");
  });
});

describe("здоровье и сторож", () => {
  it("живая аренда — всё в порядке", () => {
    const h = taskHealth(task(), new Set(), now);
    expect(h.stale || h.phantom).toBe(false);
    expect(h.silentMin).toBe(5);
  });
  it("истёкшая аренда — задача брошена, «в работе» без исполнителя — фантом", () => {
    expect(taskHealth(task({ claimUntil: min(-1) }), new Set(), now).stale).toBe(true);
    expect(taskHealth(task({ claimedBy: null, claimUntil: null }), new Set(), now).phantom).toBe(true);
    expect(taskHealth(task({ claimedBy: null, claimUntil: null, assignee: "Артур" }), new Set(), now).phantom).toBe(false);
  });
  it("сторож сначала отмечает брошенную, возвращает только после паузы и оживляет, если пульс вернулся", () => {
    const fresh = task({ key: "S1", claimUntil: min(-1) });
    const old = task({ key: "S2", claimUntil: min(-LEASE_MIN - RETURN_AFTER_STALE_MIN), staleAt: min(-RETURN_AFTER_STALE_MIN - 1) });
    const alive = task({ key: "S3", staleAt: min(-10) });
    const plan = watchdogPlan([fresh, old, alive], new Set(), now);
    expect(plan.markStale).toEqual(["S1"]);
    expect(plan.autoReturn).toEqual(["S2"]);
    expect(plan.revive).toEqual(["S3"]);
  });
  it("брошенная проверка освобождает задачу, но оставляет её «На проверке»", () => {
    const r = task({ key: "R1", status: "review", claimedBy: "tester", claimUntil: min(-1) });
    const plan = watchdogPlan([r], new Set(), now);
    expect(plan.releaseLease).toEqual(["R1"]);
    expect(plan.markStale).toEqual([]);
  });
  it("тестировщик возвращает на доработку, но не закрывает задачу", () => {
    expect(roleOf("tester")).toBe("tester");
    expect(canTransition("review", "ready", "tester")).toBe(true);
    expect(canTransition("review", "done", "tester")).toBe(false);
  });
  it("задача, заблокированная только зависимостями, разблокируется, когда они закрылись", () => {
    const b = task({ key: "B1", status: "blocked", blockedOn: "deps", depends: ["X"], claimedBy: null, claimUntil: null });
    expect(watchdogPlan([b], new Set(), now).unblock).toEqual([]);
    expect(watchdogPlan([b], new Set(["X"]), now).unblock).toEqual(["B1"]);
  });
});

describe("запрет воркерам заводить задачи и входящие", () => {
  it("WORKER_ROLES содержит всех воркеров-исполнителей", () => {
    expect(WORKER_ROLES).toContain("dev");
    expect(WORKER_ROLES).toContain("nocode");
    expect(WORKER_ROLES).toContain("tester");
    expect(WORKER_ROLES).toContain("deployer");
    expect(WORKER_ROLES).not.toContain("cto");
    expect(WORKER_ROLES).not.toContain("owner");
    expect(WORKER_ROLES).not.toContain("triage");
    expect(WORKER_ROLES).not.toContain("product");
  });
  it("воркеры-исполнители не могут создавать задачи и входящие", () => {
    for (const role of WORKER_ROLES) {
      expect(canCreateTask(role), `роль ${role} должна быть запрещена`).toBe(false);
    }
  });
  it("триаж, техдиректор, продакт и владелец могут создавать задачи", () => {
    expect(canCreateTask("cto")).toBe(true);
    expect(canCreateTask("product")).toBe(true);
    expect(canCreateTask("owner")).toBe(true);
    expect(canCreateTask("triage")).toBe(true);
  });
  it("dev-1, nocode-2 и tester из имён агентов блокируются через roleOf", () => {
    expect(canCreateTask(roleOf("dev-1"))).toBe(false);
    expect(canCreateTask(roleOf("nocode-2"))).toBe(false);
    expect(canCreateTask(roleOf("tester"))).toBe(false);
    expect(canCreateTask(roleOf("deployer"))).toBe(false);
    expect(canCreateTask(roleOf("cto"))).toBe(true);
    expect(canCreateTask(roleOf("triage"))).toBe(true);
  });
});

describe("роли воркеров триажа и «Продукт и не-код»", () => {
  it("не-код сдаёт свою задачу на проверку и передаёт её, но не переводит чужие в очередь и не закрывает", () => {
    expect(canTransition("in_progress", "review", "nocode")).toBe(true);
    expect(canTransition("in_progress", "ready", "nocode")).toBe(true);
    expect(canTransition("backlog", "ready", "nocode")).toBe(false);
    expect(canTransition("review", "done", "nocode")).toBe(false);
  });
  it("триаж переводит в очередь и блокирует, но не закрывает и не сдаёт", () => {
    expect(canTransition("backlog", "ready", "triage")).toBe(true);
    expect(canTransition("backlog", "blocked", "triage")).toBe(true);
    expect(canTransition("review", "done", "triage")).toBe(false);
    expect(canTransition("in_progress", "review", "triage")).toBe(false);
  });
});
