import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { listEpics } from "@/server/services/epics";
import type { BoardTask } from "@/server/services/ccBoard";
import { EPIC_STATUSES } from "@/lib/backlog-labels";
import { FLOW_TONE, LANE_DOT, Empty, type CcSearch } from "./shared";
import { cn } from "@/lib/format";

type EpicRow = Awaited<ReturnType<typeof listEpics>>[number];

const STATUS_TONE: Record<string, string> = {
  planned: "bg-surface text-muted",
  in_progress: "bg-brand-50 text-brand",
  testing: "bg-warn-50 text-warn",
  ready: "bg-warn-50 text-warn",
  done: "bg-ok-50 text-ok",
};

/** Вид «Эпики» в бэклоге: раскрываемые блоки с задачами, прогрессом и внутриэпиковыми зависимостями */
export async function EpicsView({
  epics,
  tasks,
  sp,
  taskHref,
}: {
  epics: EpicRow[];
  tasks: BoardTask[];
  sp: CcSearch;
  taskHref: (key: string) => string;
}) {
  const tb = await getTranslations("admin.cc.backlog");

  const epicStatusMap = new Map(epics.map((e) => [e.key, e.status]));

  // Группируем задачи по epicKey; null — без эпика
  const byEpic = new Map<string | null, BoardTask[]>();
  for (const task of tasks) {
    const k = task.epicKey ?? null;
    if (!byEpic.has(k)) byEpic.set(k, []);
    byEpic.get(k)!.push(task);
  }

  const noEpicTasks = byEpic.get(null) ?? [];

  // Есть ли у эпика незакрытые задачи в текущей (возможно отфильтрованной) выборке
  const hasOpen = (epicKey: string) =>
    (byEpic.get(epicKey) ?? []).some((t) => t.status !== "done" && t.status !== "cancelled");

  // Блокирующие эпики: зависимости не-done (только из этого же набора эпиков)
  const blockers = (epic: EpicRow) =>
    epic.depends.filter((dep) => {
      const s = epicStatusMap.get(dep);
      return s !== undefined && s !== "done";
    });

  if (epics.length === 0) {
    return (
      <Empty>
        {tb("epicNoEpics")}{" — "}
        <Link href="/admin/control/epics/new" className="underline">
          {tb("epicNoTasksLink")}
        </Link>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {epics.map((epic) => {
        const epicTasks = byEpic.get(epic.key) ?? [];
        // Фильтр сузил до 0 задач — скрываем блок эпика
        if (epicTasks.length === 0 && (sp.q || sp.priority || sp.size)) return null;

        const epicTaskKeys = new Set(epicTasks.map((t) => t.key));
        const epicBlockers = blockers(epic);
        const isOpen = hasOpen(epic.key);
        const { taskDone, taskTotal } = epic;

        return (
          <details key={epic.key} open={isOpen} className="card overflow-hidden">
            <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 border-b border-line bg-surface/60 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-semibold">{epic.title}</span>
              <span className={cn("chip shrink-0 text-xs", STATUS_TONE[epic.status])}>
                {EPIC_STATUSES[epic.status] ?? epic.status}
              </span>
              {taskTotal > 0 && (
                <span className="shrink-0 text-xs text-muted">
                  {tb("epicProgress", { done: taskDone, total: taskTotal })}
                </span>
              )}
              {epicBlockers.slice(0, 1).map((dep) => (
                <span key={dep} className="chip shrink-0 bg-bad-50 text-[10px] text-bad">
                  {tb("epicWaits", { key: dep })}
                </span>
              ))}
              {epicBlockers.length > 1 && (
                <span className="chip shrink-0 bg-bad-50 text-[10px] text-bad">+{epicBlockers.length - 1}</span>
              )}
            </summary>

            {taskTotal > 0 && (
              <div className="h-1 bg-surface">
                <div
                  className="h-1 rounded-full bg-ok"
                  style={{ width: `${taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0}%` }}
                />
              </div>
            )}

            {epicTasks.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">{tb("epicNoTasks")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {epicTasks.map((task) => {
                  const isDone = task.status === "done" || task.status === "cancelled";
                  const innerDeps = task.depends.filter((d) => epicTaskKeys.has(d));
                  return (
                    <li
                      key={task.key}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
                        task.attention && "bg-bad-50/40",
                        isDone && "opacity-60",
                      )}
                    >
                      <Link href={taskHref(task.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="w-20 shrink-0 font-mono text-xs text-muted">{task.key}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                      </Link>
                      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <span className={cn("chip text-[10px]", FLOW_TONE[task.flow])}>
                          {tb(`flows.${task.flow}`)}
                        </span>
                        <span className={cn("size-2 rounded-full", LANE_DOT[task.lane])} />
                        {innerDeps.map((dep) => (
                          <span key={dep} className="text-xs text-muted">→ {dep}</span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        );
      })}

      {noEpicTasks.length > 0 && (
        <details className="card overflow-hidden">
          <summary className="flex cursor-pointer select-none items-center gap-2 border-b border-line bg-surface/60 px-3 py-2.5 font-semibold">
            {tb("epicWithout", { n: noEpicTasks.length })}
          </summary>
          <ul className="divide-y divide-line">
            {noEpicTasks.map((task) => {
              const isDone = task.status === "done" || task.status === "cancelled";
              return (
                <li
                  key={task.key}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2",
                    task.attention && "bg-bad-50/40",
                    isDone && "opacity-60",
                  )}
                >
                  <Link href={taskHref(task.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">{task.key}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                  </Link>
                  <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className={cn("chip text-[10px]", FLOW_TONE[task.flow])}>
                      {tb(`flows.${task.flow}`)}
                    </span>
                    <span className={cn("size-2 rounded-full", LANE_DOT[task.lane])} />
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
