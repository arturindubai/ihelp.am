import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { boardTasks, type BoardTask } from "@/server/services/ccBoard";
import { readyForAutoDev } from "@/server/services/workers";
import { listEpics } from "@/server/services/epics";
import { db } from "@/server/db";
import { AREAS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { FLOWS, LANES, SIZES, countBy } from "@/lib/cc-lanes";
import { executorOf } from "@/lib/workers";
import { TaskBadges } from "@/components/admin/cc/TaskBadges";
import { FilterBar } from "@/components/admin/cc/FilterBar";
import { TaskBoard } from "@/components/admin/cc/TaskBoard";
import { FLOW_TONE, LANE_DOT, PRIORITY_TONE, ccHref, type CcSearch } from "./shared";
import { cn } from "@/lib/format";

const VIEWS = ["lanes", "flow", "flat", "board"] as const;

/**
 * Бэклог, как в LIA: каждая открытая задача, сгруппированная по дорожке (кто исполняет) — сразу видно,
 * что ждёт триажа, что в очереди, что у деплоера и что ждёт владельца. Чипы дорожек и этапов со счётчиками,
 * виды «по дорожкам / по этапу / списком», поиск, закрытые, приоритет, размер и эпик
 */
export async function BacklogTab({ sp, taskHref }: { sp: CcSearch; taskHref: (key: string) => string }) {
  const [t, tb, all, epics, claimable, doneTotal] = await Promise.all([
    getTranslations("admin.cc"),
    getTranslations("admin.cc.backlog"),
    boardTasks({ closed: !!sp.closed }),
    listEpics(),
    readyForAutoDev(),
    db.task.count({ where: { status: "done" } }),
  ]);
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as (typeof VIEWS)[number]) : "lanes";
  const q = sp.q?.trim().toLowerCase();

  let base = all;
  if (q) base = base.filter((x) => `${x.key} ${x.title} ${x.summary} ${x.details ?? ""}`.toLowerCase().includes(q));
  if (sp.priority) base = base.filter((x) => x.priority === sp.priority);
  if (sp.size) base = base.filter((x) => x.size === sp.size);
  if (sp.epicKey) base = base.filter((x) => (sp.epicKey === "none" ? !x.epicKey : x.epicKey === sp.epicKey));
  const laneCounts = countBy(sp.flow ? base.filter((x) => x.flow === sp.flow) : base, (x) => x.lane);
  const flowCounts = countBy(sp.lane ? base.filter((x) => x.lane === sp.lane) : base, (x) => x.flow);
  const tasks = base.filter((x) => (!sp.lane || x.lane === sp.lane) && (!sp.flow || x.flow === sp.flow));

  const open = all.filter((x) => !["done", "cancelled"].includes(x.status));
  const byStatus = countBy(open, (x) => x.status);
  const stale = open.filter((x) => x.health.stale || x.health.phantom).length;
  // Привязка к исполнителю: какой воркер делает следующий шаг по задаче
  const tw = await getTranslations("admin.cc.workers");
  const blocked = open.filter((x) => x.status === "blocked").length;
  const here = (patch: CcSearch) => ccHref({ ...sp, task: "" }, patch);
  const flows = FLOWS.filter((f) => sp.closed || !["done", "cancelled"].includes(f));

  const groups: { id: string; title: React.ReactNode; items: BoardTask[] }[] =
    view === "flat"
      ? [{ id: "all", title: null, items: tasks }]
      : view === "board"
        ? []
      : view === "flow"
        ? flows.map((f) => ({ id: f, title: <span className={cn("chip text-xs", FLOW_TONE[f])}>{tb(`flows.${f}`)}</span>, items: tasks.filter((x) => x.flow === f) }))
        : LANES.map((l) => ({
            id: l,
            title: (
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", LANE_DOT[l])} />
                {tb(`lanes.${l}`)}
              </span>
            ),
            items: tasks.filter((x) => x.lane === l),
          }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2 text-xs">
        <b>{tb("strip.total", { n: open.length })}</b>
        <span className="text-ok">{tb("strip.claimable", { n: claimable })}</span>
        <span className={blocked ? "text-warn" : "text-muted"}>{tb("strip.blocked", { n: blocked })}</span>
        <span className={stale ? "text-bad" : "text-muted"}>{tb("strip.stale", { n: stale })}</span>
        <span className="text-muted">·</span>
        {["backlog", "ready", "in_progress", "review", "blocked"].map((s) => (
          <span key={s} className="text-muted">
            {STATUSES[s]} {byStatus[s] ?? 0}
          </span>
        ))}
        <span className="text-muted">
          · {STATUSES.done} {doneTotal}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link href={here({ lane: "" })} className={cn("chip gap-1.5 text-xs", !sp.lane ? "bg-ink text-inverse" : "bg-surface text-ink")}>
          {tb("allLanes")} <b>{Object.values(laneCounts).reduce((a, b) => a + b, 0)}</b>
        </Link>
        {LANES.map((l) => (
          <Link key={l} href={here({ lane: sp.lane === l ? "" : l })} className={cn("chip gap-1.5 text-xs", sp.lane === l ? "bg-ink text-inverse" : "bg-surface text-ink")}>
            <span className={cn("size-2 rounded-full", LANE_DOT[l])} />
            {tb(`lanes.${l}`)} <b>{laneCounts[l] ?? 0}</b>
          </Link>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Link href={here({ flow: "" })} className={cn("chip text-xs", !sp.flow ? "bg-ink text-inverse" : "bg-surface text-ink")}>
          {tb("allFlows")}
        </Link>
        {flows.map((f) => (
          <Link key={f} href={here({ flow: sp.flow === f ? "" : f })} className={cn("chip gap-1 text-xs", sp.flow === f ? "bg-ink text-inverse" : FLOW_TONE[f])}>
            {tb(`flows.${f}`)} <b>{flowCounts[f] ?? 0}</b>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <FilterBar
            current={Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "task" && v)) as Record<string, string>}
            defs={[
              { key: "priority", label: t("priority"), options: PRIORITIES },
              { key: "size", label: tb("size"), options: Object.fromEntries(SIZES.map((s) => [s, tb(`sizes.${s}`)])) },
            ]}
            epics={epics.map((e) => ({ key: e.key, title: e.title }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Link href={here({ closed: sp.closed ? "" : "1" })} className={cn("chip text-xs", sp.closed ? "bg-ink text-inverse" : "bg-surface text-muted")}>
            {sp.closed ? "☑" : "☐"} {tb("showClosed")}
          </Link>
          <div className="flex gap-0.5 rounded-lg bg-surface p-0.5 text-xs">
            {VIEWS.map((v) => (
              <Link key={v} href={here({ view: v === "lanes" ? "" : v })} className={cn("rounded-md px-2.5 py-1", view === v ? "bg-paper font-medium shadow-sm" : "text-muted")}>
                {tb(`views.${v}`)}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {tasks.length === 0 && <p className="card py-10 text-center text-muted">{t("empty")}</p>}

      {view === "board" && <TaskBoard tasks={tasks} taskHref={taskHref} />}

      <div className="space-y-4">
        {view !== "board" &&
          groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.id} className="card overflow-hidden">
              {g.title && (
                <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-3 py-2 text-sm font-semibold">
                  {g.title} <span className="font-normal text-muted">{g.items.length}</span>
                </div>
              )}
              <ul className="divide-y divide-line">
                {g.items.map((task) => (
                  <li key={task.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5", task.attention && "bg-bad-50/40", task.status === "cancelled" && "opacity-50")}>
                    <Link href={taskHref(task.key)} scroll={false} className="flex min-w-0 flex-1 gap-3">
                      <span className="w-24 shrink-0 pt-0.5 font-mono text-xs text-muted">{task.key}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{task.title}</span>
                        <span className="block text-xs text-muted">
                          {STAGES[task.stage]} · {AREAS[task.area]}
                          {task.epic ? ` · ${task.epic}` : ""}
                          {task.blockedReason ? ` · ${task.blockedReason}` : ""}
                        </span>
                        <span className="mt-1 block">
                          <TaskBadges task={task} />
                        </span>
                      </span>
                    </Link>
                    <span className="flex shrink-0 flex-wrap items-center gap-1">
                      <span className={cn("chip text-[10px]", FLOW_TONE[task.flow])}>{tb(`flows.${task.flow}`)}</span>
                      <span className={cn("chip text-[10px]", PRIORITY_TONE[task.priority])} title={PRIORITIES[task.priority]}>
                        {task.priority.toUpperCase()}
                      </span>
                      {task.size !== "none" && <span className="chip bg-surface text-[10px] text-muted">{task.size}</span>}
                      {executorOf(task) && (
                        <span className="chip bg-surface text-[10px] text-muted" title={tb("executor")}>
                          → {tw(`pools.${executorOf(task)!}`)}
                        </span>
                      )}
                      {view !== "lanes" && <span className={cn("size-2 rounded-full", LANE_DOT[task.lane])} title={tb(`lanes.${task.lane}`)} />}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
