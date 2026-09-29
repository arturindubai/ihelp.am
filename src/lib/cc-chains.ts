/**
 * Цепочки зависимостей: чистые функции для поиска задач, ждущих «зависших» зависимостей.
 * «Зависшая» зависимость — заблокирована на owner/product/design/external без даты разблокировки,
 * или залежалась в бэклоге дольше 3 суток.
 */

const STUCK_BLOCKED_ON = ["owner", "product", "design", "external"] as const;
const BACKLOG_STUCK_MS = 3 * 24 * 3600_000;

export type DepInfo = {
  key: string;
  title: string;
  status: string;
  blockedOn: string | null;
  blockedUntil: Date | null;
  updatedAt: Date;
};

export type OpenDepInfo = {
  key: string;
  title: string;
  status: string;
  blockedOn: string | null;
};

export type WaitingDepEntry = {
  key: string;
  title: string;
  openDeps: OpenDepInfo[];
};

export type DepChain = {
  rootKey: string;
  rootTitle: string;
  blockedOn: string | null;
  since: Date;
  waitingKeys: string[];
};

function isStuck(dep: DepInfo, now: Date): boolean {
  if (dep.status === "blocked") {
    return (STUCK_BLOCKED_ON as readonly string[]).includes(dep.blockedOn ?? "") && !dep.blockedUntil;
  }
  if (dep.status === "backlog") {
    return now.getTime() - dep.updatedAt.getTime() > BACKLOG_STUCK_MS;
  }
  return false;
}

/**
 * Возвращает задачи из ready/backlog/blocked, у которых есть хотя бы одна «зависшая» зависимость.
 * Зависимость в статусе «На проверке» или закрытая не считается проблемой.
 */
export function waitingDeps(
  waiters: { key: string; title: string; status: string; depends: string[] }[],
  depMap: Map<string, DepInfo>,
  now: Date = new Date(),
): WaitingDepEntry[] {
  const result: WaitingDepEntry[] = [];
  for (const task of waiters) {
    if (!["ready", "backlog", "blocked"].includes(task.status)) continue;
    if (task.depends.length === 0) continue;
    const openDeps: OpenDepInfo[] = [];
    for (const depKey of task.depends) {
      const dep = depMap.get(depKey);
      if (!dep) continue;
      if (dep.status === "done" || dep.status === "cancelled" || dep.status === "review") continue;
      if (isStuck(dep, now)) {
        openDeps.push({ key: dep.key, title: dep.title, status: dep.status, blockedOn: dep.blockedOn });
      }
    }
    if (openDeps.length > 0) result.push({ key: task.key, title: task.title, openDeps });
  }
  return result;
}

/**
 * Строит цепочки зависимостей: для каждого «зависшего» корня — список задач, которые его ждут.
 * Показывает только прямые зависимости (без рекурсии).
 */
export function depChains(entries: WaitingDepEntry[], depMap: Map<string, DepInfo>): DepChain[] {
  const rootToWaiting = new Map<string, string[]>();
  for (const entry of entries) {
    for (const dep of entry.openDeps) {
      const list = rootToWaiting.get(dep.key);
      if (list) list.push(entry.key);
      else rootToWaiting.set(dep.key, [entry.key]);
    }
  }
  const chains: DepChain[] = [];
  for (const [rootKey, waitingKeys] of rootToWaiting) {
    const dep = depMap.get(rootKey);
    if (!dep) continue;
    chains.push({ rootKey, rootTitle: dep.title, blockedOn: dep.blockedOn, since: dep.updatedAt, waitingKeys });
  }
  return chains;
}
