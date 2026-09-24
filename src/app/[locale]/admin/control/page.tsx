import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { annotate, attention, listTasks, systemStatus, taskStats, type TaskFilters } from "@/server/services/cc";
import { listEpics } from "@/server/services/epics";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { PageHead, Forbidden, Stat } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { QuickMove, STATUS_TONE } from "@/components/admin/cc/TaskControls";
import { TaskBoard } from "@/components/admin/cc/TaskBoard";
import { TaskBadges } from "@/components/admin/cc/TaskBadges";
import { TaskDetail } from "@/components/admin/cc/TaskDetail";
import { TaskDrawer } from "@/components/admin/cc/TaskDrawer";
import { AttentionPanel } from "@/components/admin/cc/AttentionPanel";
import { FilterBar } from "@/components/admin/cc/FilterBar";
import { Collapsible } from "@/components/admin/cc/Collapsible";
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

type Search = Partial<Record<(typeof FILTERS)[number] | "q" | "all" | "epicKey" | "view" | "task" | "claimedBy" | "attention", string>>;

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
  if (sp.epicKey) filters.epicKey = sp.epicKey;
  if (sp.claimedBy) filters.claimedBy = sp.claimedBy;

  const [all, stats, system, epics, attn] = await Promise.all([listTasks(filters).then(annotate), taskStats(), systemStatus(), listEpics(), attention()]);
  const tasks = sp.attention ? all.filter((task) => task.attention) : all;
  const open = Object.entries(stats.byStatus)
    .filter(([s]) => s !== "done" && s !== "cancelled")
    .reduce((s, [, n]) => s + n, 0);
  const attentionCount = attn.stale.length + attn.owner.length + attn.review.filter((r) => r.health.stuckReview).length;
  const view = sp.view === "board" ? "board" : "list";
  const taskHref = (key: string) => href(sp, { task: key });
  const workers = [...new Set([...attn.working, ...attn.stale].map((w) => w.claimedBy).filter(Boolean) as string[])];
  // Фильтры не должны тащить за собой открытую шторку
  const current = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== "task")) as Record<string, string>;

  return (
    <div className="max-w-6xl">
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={href(sp, { all: sp.all ? "" : "1", task: "" })} className={sp.all ? "btn-outline btn-sm" : "btn-dark btn-sm"}>
              {sp.all ? t("all") : t("openOnly")}
            </Link>
            <Link href="/admin/control/epics" className="btn-outline btn-sm">
              {t("epics.title")}
            </Link>
            <Link href="/admin/control/new" className="btn-primary btn-sm">
              {t("newTask")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label={t("openTasks")} value={open} hint={`${t("doneTasks")}: ${stats.byStatus.done ?? 0} / ${stats.total}`} />
        <Stat label={t("stats.ready")} value={stats.byStatus.ready ?? 0} tone="ok" />
        <Stat label={t("stats.working")} value={`${stats.byStatus.in_progress ?? 0} · ${stats.byStatus.review ?? 0}`} hint={`${STATUSES.in_progress} · ${STATUSES.review}`} />
        <Stat label={t("stats.attention")} value={attentionCount} tone={attentionCount > 0 ? "bad" : undefined} />
      </div>

      <AttentionPanel data={attn} taskHref={taskHref} readyHref={href({}, { status: "ready" })} attentionHref={href(sp, { attention: "1", task: "" })} />

      <Collapsible title={t("systemToggle")}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t("progress")} className="lg:col-span-2">
            <div className="space-y-3">
              {stats.byStage
                .filter((s) => s.total > 0)
                .map((s) => (
                  <Link key={s.stage} href={href(sp, { stage: s.stage, task: "" })} className="block">
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
      </Collapsible>

      <Card
        title={`${t("tasks")} · ${tasks.length}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href(sp, { attention: sp.attention ? "" : "1", task: "" })} className={cn("chip text-xs", sp.attention ? "bg-bad-50 text-bad" : "bg-surface text-muted")}>
              {t("filterAttention")}
            </Link>
            <div className="flex gap-1 rounded-lg bg-surface p-1 text-xs">
              <Link href={href(sp, { view: "", task: "" })} className={cn("rounded-md px-2.5 py-1", view === "list" ? "bg-paper font-medium shadow-sm" : "text-muted")}>
                {t("viewList")}
              </Link>
              <Link href={href(sp, { view: "board", task: "" })} className={cn("rounded-md px-2.5 py-1", view === "board" ? "bg-paper font-medium shadow-sm" : "text-muted")}>
                {t("viewBoard")}
              </Link>
            </div>
          </div>
        }
      >
        <FilterBar
          current={current}
          defs={[
            ...FILTERS.map((f) => ({ key: f, label: t(f), options: OPTIONS[f] })),
            ...(workers.length ? [{ key: "claimedBy", label: t("filterWorker"), options: Object.fromEntries(workers.map((w) => [w, w])) }] : []),
          ]}
          epics={epics.map((e) => ({ key: e.key, title: e.title }))}
        />

        {tasks.length === 0 && <p className="py-8 text-center text-muted">{t("empty")}</p>}

        {view === "board" ? (
          <TaskBoard tasks={tasks} taskHref={taskHref} />
        ) : (
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <li key={task.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5", task.attention && "bg-bad-50/40")}>
                <Link href={taskHref(task.key)} scroll={false} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">{task.key}</span>
                    <span className={cn("chip text-[10px]", STATUS_TONE[task.status])}>{STATUSES[task.status]}</span>
                    <span className={cn("chip text-[10px]", PRIORITY_TONE[task.priority])}>{PRIORITIES[task.priority]}</span>
                    {task.epic && <span className="chip bg-brand-50 text-[10px] text-brand">{task.epic}</span>}
                  </div>
                  <div className="mt-0.5 font-medium">{task.title}</div>
                  <div className="text-xs text-muted">
                    {STAGES[task.stage]} · {AREAS[task.area]} · {LAYERS[task.layer]} · {OWNERS[task.owner]}
                    {task.assignee ? ` · ${task.assignee}` : ""}
                    {task.blockedReason ? ` · ${task.blockedReason}` : ""}
                  </div>
                  <div className="mt-1">
                    <TaskBadges task={task} />
                  </div>
                </Link>
                {task.status === "backlog" && task.dorOk && <QuickMove taskKey={task.key} to="ready" label={`→ ${t("move.quickReady")}`} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sp.task && (
        <TaskDrawer closeHref={href(sp, { task: "" })} pageHref={`/admin/control/${sp.task}`}>
          <TaskDetail taskKey={sp.task} locale={locale} taskHref={taskHref} />
        </TaskDrawer>
      )}
    </div>
  );
}
