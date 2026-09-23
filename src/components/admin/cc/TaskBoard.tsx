import { Link } from "@/i18n/navigation";
import { PRIORITIES, STATUSES } from "@/lib/backlog-labels";
import { TaskStatus } from "@/components/admin/cc/TaskControls";
import { cn } from "@/lib/format";
import type { Task } from "@prisma/client";

const PRIORITY_TONE: Record<string, string> = { p0: "bg-bad-50 text-bad", p1: "bg-warn-50 text-warn", p2: "bg-surface text-muted", p3: "bg-surface text-muted" };
const COLUMN_ORDER = ["backlog", "in_progress", "review", "blocked", "done"] as const;

/** Канбан-доска: колонки по статусу. Готово показывается только если такие задачи есть в выборке (обычно — при «Все») */
export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const byStatus = new Map<string, Task[]>();
  for (const t of tasks) byStatus.set(t.status, [...(byStatus.get(t.status) ?? []), t]);
  const columns = COLUMN_ORDER.filter((s) => s !== "done" || (byStatus.get("done")?.length ?? 0) > 0);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((status) => {
        const items = byStatus.get(status) ?? [];
        return (
          <div key={status} className="w-72 shrink-0 rounded-xl bg-surface/60 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium">{STATUSES[status]}</span>
              <span className="text-xs text-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((task) => (
                <div key={task.key} className="card space-y-1.5 p-2.5">
                  <Link href={`/admin/control/${task.key}`} className="block">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted">{task.key}</span>
                      <span className={cn("chip text-[10px]", PRIORITY_TONE[task.priority])}>{PRIORITIES[task.priority]}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{task.title}</div>
                    {task.epic && <div className="mt-1 truncate text-[11px] text-brand">{task.epic}</div>}
                  </Link>
                  <TaskStatus taskKey={task.key} status={task.status} className="w-full" />
                </div>
              ))}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
