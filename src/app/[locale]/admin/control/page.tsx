import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { listTasks, systemStatus, taskStats, type TaskFilters } from "@/server/services/cc";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { PageHead, Forbidden, Stat } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { TaskStatus } from "@/components/admin/cc/TaskControls";
import { SystemPanel } from "@/components/admin/cc/SystemPanel";
import { cn } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS = ["stage", "status", "area", "layer", "priority", "owner"] as const;
const OPTIONS: Record<(typeof FILTERS)[number], Record<string, string>> = {
  stage: STAGES,
  status: STATUSES,
  area: AREAS,
  layer: LAYERS,
  priority: PRIORITIES,
  owner: OWNERS,
};

const PRIORITY_TONE: Record<string, string> = { p0: "bg-bad-50 text-bad", p1: "bg-warn-50 text-warn", p2: "bg-surface text-muted", p3: "bg-surface text-muted" };
const STATUS_TONE: Record<string, string> = {
  backlog: "bg-surface text-muted",
  in_progress: "bg-brand-50 text-brand",
  review: "bg-warn-50 text-warn",
  blocked: "bg-bad-50 text-bad",
  done: "bg-ok-50 text-ok",
};

type Search = Partial<Record<(typeof FILTERS)[number] | "q" | "all", string>>;

function href(sp: Search, patch: Search) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next[k] = v;
  const qs = new URLSearchParams(next).toString();
  return `/admin/control${qs ? `?${qs}` : ""}`;
}

export default async function ControlCenter({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const sp = await searchParams;
  const t = await getTranslations("admin.cc");

  const filters: TaskFilters = { open: !sp.all };
  for (const f of FILTERS) if (sp[f] && OPTIONS[f][sp[f]!]) filters[f] = sp[f];
  if (sp.q) filters.q = sp.q;

  const [tasks, stats, system] = await Promise.all([listTasks(filters), taskStats(), systemStatus()]);
  const open = Object.entries(stats.byStatus).filter(([s]) => s !== "done").reduce((s, [, n]) => s + n, 0);

  return (
    <div className="max-w-6xl">
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        actions={
          <div className="flex gap-2">
            <Link href={href(sp, { all: sp.all ? "" : "1" })} className={sp.all ? "btn-outline btn-sm" : "btn-dark btn-sm"}>
              {sp.all ? t("all") : t("openOnly")}
            </Link>
            <Link href="/admin/control/new" className="btn-primary btn-sm">
              {t("newTask")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("openTasks")} value={open} hint={`${t("doneTasks")}: ${stats.byStatus.done ?? 0} / ${stats.total}`} />
        <Stat label={STATUSES.in_progress} value={(stats.byStatus.in_progress ?? 0) + (stats.byStatus.review ?? 0)} tone="ok" />
        <Stat label={STATUSES.blocked} value={stats.byStatus.blocked ?? 0} tone={(stats.byStatus.blocked ?? 0) > 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("progress")} className="lg:col-span-2">
          <div className="space-y-3">
            {stats.byStage
              .filter((s) => s.total > 0)
              .map((s) => (
                <Link key={s.stage} href={href(sp, { stage: s.stage })} className="block">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{STAGES[s.stage]}</span>
                    <span className="text-xs text-muted">{t("stageLine", { done: s.done, total: s.total, inWork: s.inWork })}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${s.pct}%` }} />
                  </div>
                </Link>
              ))}
          </div>
        </Card>
        <SystemPanel system={system} />
      </div>

      <Card title={`${t("tasks")} · ${tasks.length}`} className="mt-4">
        <form className="mb-3 flex flex-wrap gap-2" action={`/${locale}/admin/control`}>
          {Object.entries(sp).map(([k, v]) => k !== "q" && v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
          <input name="q" defaultValue={sp.q ?? ""} placeholder={t("search")} className="input max-w-xs" />
          <button className="btn-outline btn-sm">{t("search")}</button>
          {(sp.q || FILTERS.some((f) => sp[f])) && (
            <Link href="/admin/control" className="btn-ghost btn-sm">
              {t("reset")}
            </Link>
          )}
        </form>

        <div className="mb-4 space-y-2">
          {FILTERS.map((f) => (
            <div key={f} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="w-24 shrink-0 text-muted">{t(f)}</span>
              {Object.entries(OPTIONS[f]).map(([value, label]) => (
                <Link
                  key={value}
                  href={href(sp, { [f]: sp[f] === value ? "" : value } as Search)}
                  className={cn("chip", sp[f] === value && "bg-ink text-inverse")}
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {tasks.length === 0 && <p className="py-8 text-center text-muted">{t("empty")}</p>}
        <ul className="divide-y divide-line">
          {tasks.map((task) => (
            <li key={task.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <Link href={`/admin/control/${task.key}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{task.key}</span>
                  <span className={cn("chip text-[10px]", PRIORITY_TONE[task.priority])}>{PRIORITIES[task.priority]}</span>
                  {task.status !== "backlog" && <span className={cn("chip text-[10px]", STATUS_TONE[task.status])}>{STATUSES[task.status]}</span>}
                </div>
                <div className="mt-0.5 font-medium">{task.title}</div>
                <div className="text-xs text-muted">
                  {STAGES[task.stage]} · {AREAS[task.area]} · {LAYERS[task.layer]} · {OWNERS[task.owner]}
                  {task.assignee ? ` · ${task.assignee}` : ""}
                  {task.blockedReason ? ` · ${task.blockedReason}` : ""}
                </div>
              </Link>
              <TaskStatus taskKey={task.key} status={task.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
