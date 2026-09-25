/**
 * Жизненный цикл задачи Control Center: статусы, роли, переходы, гейты и «здоровье» задачи.
 * Чистые функции без базы: их используют сервис, API для агентов, интерфейс и сторож.
 * Правила словами — docs/DEV_SYSTEM.md; меняются вместе с этим файлом.
 */

export const TASK_STATUSES = ["backlog", "ready", "in_progress", "review", "blocked", "done", "cancelled"] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];

/** Открытые — всё, что ещё требует чьих-то действий */
export const OPEN_STATUSES: TaskStatusKey[] = ["backlog", "ready", "in_progress", "review", "blocked"];
/** Закрытые: зависимость от такой задачи считается снятой (отменённая больше никого не держит) */
export const CLOSED_STATUSES: TaskStatusKey[] = ["done", "cancelled"];

/** nocode — воркер «Продукт и не-код»: права разработчика, но только на задачи без кода (проверка — в сервисе) */
export const ROLES = ["owner", "cto", "product", "designer", "triage", "dev", "nocode", "tester", "deployer", "watchdog"] as const;
export type Role = (typeof ROLES)[number];

/** Воркеры-исполнители: не заводят задачи и входящие — бэклог остаётся чистым */
export const WORKER_ROLES: readonly Role[] = ["dev", "nocode", "tester", "deployer"];

/**
 * Может ли роль заводить задачи (create) и входящие (intake) в бэклоге.
 * Воркеры-исполнители не создают задачи — они сообщают о потребности через CTO.
 */
export function canCreateTask(role: Role): boolean {
  return !WORKER_ROLES.includes(role);
}

/** Кто должен снять блокировку */
export const BLOCKED_ON = ["owner", "product", "design", "tech", "external", "deps"] as const;
export type BlockedOn = (typeof BLOCKED_ON)[number];

/** Виды записей в ленте задачи */
export const COMMENT_KINDS = ["note", "progress", "report", "handoff", "review", "error", "system", "triage"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

/** Аренда задачи исполнителем: столько минут без пульса — и задача считается брошенной */
export const LEASE_MIN = 60;
/** Сколько минут задача может висеть брошенной, прежде чем сторож вернёт её в очередь */
export const RETURN_AFTER_STALE_MIN = 240;
/** Сколько часов задача может ждать проверки, прежде чем сторож напомнит деплоеру */
export const REVIEW_STUCK_HOURS = 24;

/**
 * Роль агента по его имени: dev-2 → dev, deployer → deployer, cto → cto.
 * Незнакомое имя получает права разработчика — самые узкие.
 */
export function roleOf(agent: string): Role {
  const head = agent.trim().toLowerCase().split(/[-_.:\s]/)[0];
  if (head === "watchdog") return "dev";
  return (ROLES as readonly string[]).includes(head) ? (head as Role) : "dev";
}

const PLAN: Role[] = ["owner", "cto", "product"];
/** Триаж решает судьбу новой карточки: в очередь, обратно в бэклог. Отменять может только входящие IN-* (проверка в сервисе) */
const TRIAGE: Role[] = [...PLAN, "triage"];
const WORK: Role[] = ["dev", "nocode", "cto", "owner"];
const RELEASE: Role[] = ["deployer", "owner"];
const ANY: Role[] = ["owner", "cto", "product", "designer", "triage", "dev", "nocode", "tester", "deployer", "watchdog"];

/**
 * Разрешённые переходы: из какого статуса, в какой и кому.
 * «В работу» задачу переводит только аренда (claim) — отдельным путём, не этой таблицей.
 */
const TRANSITIONS: Record<TaskStatusKey, Partial<Record<TaskStatusKey, Role[]>>> = {
  backlog: { ready: TRIAGE, blocked: ANY, cancelled: TRIAGE },
  ready: { backlog: TRIAGE, blocked: ANY, cancelled: PLAN },
  in_progress: { review: WORK, ready: [...WORK, ...PLAN, "watchdog"], blocked: ANY, backlog: PLAN },
  // Сторож блокирует проверку, когда тестировщик дважды закончил без вердикта (src/server/services/workers.ts)
  review: { done: RELEASE, ready: [...RELEASE, ...PLAN, "tester"], blocked: [...RELEASE, ...PLAN, "tester", "watchdog"] },
  // Разблокировка ведёт туда, откуда задача была заблокирована (unblockTarget): с проверки — на проверку
  blocked: { ready: ANY, review: ANY, backlog: TRIAGE, cancelled: PLAN },
  done: { ready: RELEASE },
  cancelled: { backlog: PLAN },
};

/**
 * Куда возвращается задача при разблокировке: туда, откуда её заблокировали. С проверки — на проверку
 * (ветка и отчёт целы, тестировщик проверит заново), из бэклога — в бэклог на новый разбор триажем,
 * из работы и очереди — в очередь. Роли без права на такой переход — в очередь
 */
export function unblockTarget(blockedFrom: string | null | undefined, role: Role): TaskStatusKey {
  const want: TaskStatusKey = blockedFrom === "review" ? "review" : blockedFrom === "backlog" ? "backlog" : "ready";
  return canTransition("blocked", want, role) ? want : "ready";
}

export function canTransition(from: string, to: string, role: Role): boolean {
  return !!TRANSITIONS[from as TaskStatusKey]?.[to as TaskStatusKey]?.includes(role);
}

/** Куда можно перевести задачу из текущего статуса — для выпадающего списка в интерфейсе */
export function nextStatuses(from: string, role: Role): TaskStatusKey[] {
  return Object.entries(TRANSITIONS[from as TaskStatusKey] ?? {})
    .filter(([, roles]) => roles?.includes(role))
    .map(([to]) => to as TaskStatusKey);
}

/** Переходы, для которых обязательна причина словами: без неё история превращается в «кто-то зачем-то поменял» */
export function needsReason(from: string, to: string): boolean {
  if (to === "blocked" || to === "cancelled") return true;
  if (from === "review" && to === "ready") return true; // возврат на доработку
  if (from === "done") return true; // переоткрытие
  if (from === "in_progress" && to === "ready") return true; // передача или возврат брошенной
  if (from === "in_progress" && to === "backlog") return true;
  if (from === "ready" && to === "backlog") return true;
  if (from === "cancelled") return true;
  if (from === "blocked" && to === "ready") return true;
  return false;
}

type TaskShape = {
  summary: string;
  requirements: string[];
  needs: string[];
  depends: string[];
  layer: string;
  design?: string | null;
  estimate?: string | null;
  epicKey?: string | null;
  scope?: string[];
};

export type CheckItem = { key: string; ok: boolean; hard: boolean };

/**
 * Готовность к работе (Definition of Ready). Жёсткие пункты не пускают задачу в «В очереди»,
 * мягкие — предупреждения, которые видит техдиректор, прежде чем отдать задачу разработчику.
 */
export function readiness(t: TaskShape, closedKeys: Set<string>, attachments = 0): CheckItem[] {
  const isUi = t.layer === "front" || t.layer === "fullstack";
  const criteria = t.requirements.filter((r) => r.trim().length > 0);
  return [
    { key: "why", ok: t.summary.trim().length >= 20, hard: true },
    { key: "criteria", ok: criteria.length >= 1, hard: true },
    { key: "criteria2", ok: criteria.length >= 2, hard: false },
    { key: "needs", ok: t.needs.length === 0, hard: false },
    { key: "deps", ok: t.depends.every((d) => closedKeys.has(d)), hard: false },
    { key: "design", ok: !isUi || !!t.design?.trim() || attachments > 0, hard: false },
    { key: "size", ok: !!t.estimate && t.estimate !== "L", hard: false },
    { key: "scope", ok: t.layer === "none" || (t.scope?.length ?? 0) > 0, hard: false },
  ];
}

export const isReady = (items: CheckItem[]) => items.every((i) => i.ok || !i.hard);

/** Код-задача: её доказательство готовности — коммит в main, а не слова */
export const isCodeTask = (layer: string) => layer !== "none";

/** Гейт «На проверке»: у код-задачи есть ветка, у любой — отчёт, по которому деплоер поймёт, что проверять */
export function reviewGate(t: { layer: string; branch?: string | null }, report: string): string | null {
  if (isCodeTask(t.layer) && !t.branch?.trim()) return "branch_required";
  if (report.trim().length < 40) return "report_required";
  return null;
}

export const SHA_RE = /^[0-9a-f]{7,40}$/i;

/** Гейт «Сделано»: код-задача — коммит в main и что проверено после выкладки; прочие — доказательство словами или файлом */
export function doneGate(t: { layer: string }, proof: { sha?: string | null; text?: string | null; attachments?: number }): string | null {
  if (isCodeTask(t.layer) && !SHA_RE.test(proof.sha?.trim() ?? "")) return "sha_required";
  if ((proof.text?.trim().length ?? 0) < 10 && !(proof.attachments && !isCodeTask(t.layer))) return "proof_required";
  return null;
}

const normPath = (p: string) => p.trim().replace(/^\.\//, "").replace(/\/+$/, "");

/** Пересечение областей кода: один путь — префикс другого (папка и файл в ней тоже пересекаются) */
export function scopeOverlap(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (const x of a.map(normPath).filter(Boolean)) {
    for (const y of b.map(normPath).filter(Boolean)) {
      if (x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)) out.push(x.length <= y.length ? x : y);
    }
  }
  return [...new Set(out)];
}

const PRIORITY_ORDER = ["p0", "p1", "p2", "p3"];

type Candidate = { key: string; priority: string; sort: number; rework: number; depends: string[]; scope: string[] };

/**
 * Какую задачу взять следующей: сначала возвращённые на доработку (их быстрее закончить),
 * затем по приоритету и порядку бэклога. Пропускаем задачи с незакрытыми зависимостями
 * и те, что пересекаются по коду с уже взятыми в работу.
 */
export function pickNext<T extends Candidate>(candidates: T[], closedKeys: Set<string>, busyScopes: string[][]): T | null {
  const order = [...candidates].sort(
    (a, b) =>
      Number(b.rework > 0) - Number(a.rework > 0) ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      a.sort - b.sort,
  );
  return (
    order.find((t) => t.depends.every((d) => closedKeys.has(d)) && busyScopes.every((s) => scopeOverlap(t.scope, s).length === 0)) ?? null
  );
}

export type HealthTask = {
  key: string;
  status: string;
  claimedBy: string | null;
  claimUntil: Date | null;
  heartbeatAt: Date | null;
  assignee: string | null;
  staleAt: Date | null;
  updatedAt: Date;
  blockedOn: string | null;
  depends: string[];
  rework: number;
  reclaims: number;
};

export type Health = {
  /** Аренда истекла, пульса нет — исполнитель, похоже, бросил задачу */
  stale: boolean;
  /** «В работе», но никто её не держит */
  phantom: boolean;
  /** Проверка затянулась */
  stuckReview: boolean;
  /** Ждёт закрытия зависимостей */
  waitingDeps: boolean;
  /** Ждёт решения владельца или продукта */
  needsOwner: boolean;
  /** Минут с последнего признака жизни исполнителя */
  silentMin: number | null;
};

export function taskHealth(t: HealthTask, closedKeys: Set<string>, now = new Date()): Health {
  const working = t.status === "in_progress";
  // Старая аренда без пульса: последний признак жизни — момент, когда её взяли или продлили
  const lastSign = t.heartbeatAt ?? (t.claimUntil ? new Date(t.claimUntil.getTime() - LEASE_MIN * 60_000) : null);
  return {
    stale: working && !!t.claimedBy && (!t.claimUntil || t.claimUntil < now),
    phantom: working && !t.claimedBy && !t.assignee,
    stuckReview: t.status === "review" && now.getTime() - t.updatedAt.getTime() > REVIEW_STUCK_HOURS * 3600_000,
    waitingDeps: ["backlog", "ready", "blocked"].includes(t.status) && t.depends.some((d) => !closedKeys.has(d)),
    needsOwner: t.status === "blocked" && (t.blockedOn === "owner" || t.blockedOn === "product"),
    silentMin: working && lastSign ? Math.floor((now.getTime() - lastSign.getTime()) / 60_000) : null,
  };
}

export const needsAttention = (h: Health) => h.stale || h.phantom || h.stuckReview || h.needsOwner;

export type WatchdogPlan = {
  /** Впервые заметили брошенную аренду — отметить и сообщить */
  markStale: string[];
  /** Была брошенной, но исполнитель снова подал пульс */
  revive: string[];
  /** Брошена слишком давно — вернуть в очередь */
  autoReturn: string[];
  /** «В работе» без исполнителя — сообщить, решает человек */
  phantom: string[];
  /** Заблокирована только зависимостями, а они закрылись — вернуть в очередь */
  unblock: string[];
  /** Слишком долго ждёт проверки */
  stuckReview: string[];
  /** Тестировщик или деплоер держал задачу на проверке и замолчал — снять аренду, статус не трогать */
  releaseLease: string[];
};

/** Решения сторожа по текущему состоянию доски. Применяет их сервис — здесь только логика */
export function watchdogPlan(tasks: HealthTask[], closedKeys: Set<string>, now = new Date()): WatchdogPlan {
  const plan: WatchdogPlan = { markStale: [], revive: [], autoReturn: [], phantom: [], unblock: [], stuckReview: [], releaseLease: [] };
  for (const t of tasks) {
    const h = taskHealth(t, closedKeys, now);
    if (h.stale && !t.staleAt) plan.markStale.push(t.key);
    if (h.stale && t.staleAt && now.getTime() - t.staleAt.getTime() >= RETURN_AFTER_STALE_MIN * 60_000) plan.autoReturn.push(t.key);
    if (!h.stale && t.staleAt && t.status === "in_progress") plan.revive.push(t.key);
    if (h.phantom) plan.phantom.push(t.key);
    if (t.status === "blocked" && t.blockedOn === "deps" && t.depends.every((d) => closedKeys.has(d))) plan.unblock.push(t.key);
    if (h.stuckReview) plan.stuckReview.push(t.key);
    if (t.status === "review" && t.claimedBy && (!t.claimUntil || t.claimUntil < now)) plan.releaseLease.push(t.key);
  }
  return plan;
}
