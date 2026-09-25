import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PRIORITIES, STATUSES } from "@/lib/backlog-labels";
import { TaskBadges, type AnnotatedTask } from "@/components/admin/cc/TaskBadges";
import { cn } from "@/lib/format";

const PRIORITY_TONE: Record<string, string> = { p0: "bg-bad-50 text-bad", p1: "bg-warn-50 text-warn", p2: "bg-surface text-muted", p3: "bg-surface text-muted" };
const COLUMN_ORDER = ["backlog", "ready", "in_progress", "review", "blocked", "done", "cancelled"] as const;

/**
 * Канбан по статусам. «Сделано» и «Отменена» показываются, только если такие задачи есть в выборке (обычно — при «Все»).
 * Клик по карточке открывает шторку со всем по задаче; у готовой по чек-листу задачи в бэклоге — кнопка «В очереди»
 */
export async function TaskBoard({ tasks, taskHref }: { tasks: AnnotatedTask[]; taskHref: (key: string) => string }) {
  const t = await getTranslations("admin.cc");
  const byStatus = new Map<string, AnnotatedTask[]>();
  for (const task of tasks) byStatus.set(task.status, [...(byStatus.get(task.status) ?? []), task]);
  const columns = COLUMN_ORDER.filter((s) => !["done", "cancelled"].includes(s) || (byStatus.get(s)?.length ?? 0) > 0);

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
                <div key={task.key} className={cn("card space-y-1.5 p-2.5", task.attention && "ring-1 ring-bad", task.status === "cancelled" && "opacity-50")}>
                  <Link href={taskHref(task.key)} scroll={false} className="block">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted">{task.key}</span>
                      <span className={cn("chip text-[10px]", PRIORITY_TONE[task.priority])}>{PRIORITIES[task.priority]}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium">{task.title}</div>
                    {task.epic && <div className="mt-1 truncate text-[11px] text-brand">{task.epic}</div>}
                  </Link>
                  <TaskBadges task={task} />
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
