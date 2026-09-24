import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { workersOverview } from "@/server/services/workers";
import { POOLS, type Pool } from "@/lib/workers";
import { Card } from "@/components/admin/fields";
import { PoolSettings, WorkersMaster } from "@/components/admin/cc/WorkersForm";
import { RunLog, RunWorkerButton, StopRunButton } from "@/components/admin/cc/CcControls";
import { Collapsible } from "@/components/admin/cc/Collapsible";
import { PRIORITY_TONE, RUN_TONE, ago } from "./shared";
import { PRIORITIES } from "@/lib/backlog-labels";
import { cn, dateLabel, timeLabel } from "@/lib/format";

const QUEUE_TONE: Record<string, string> = {
  next: "bg-ok-50 text-ok",
  ok: "bg-ok-50 text-ok",
  deploy: "bg-ok-50 text-ok",
  test: "bg-brand-50 text-brand",
  retest: "bg-warn-50 text-warn",
  held: "bg-brand-50 text-brand",
  deps: "bg-surface text-muted",
  scope: "bg-warn-50 text-warn",
  needs: "bg-warn-50 text-warn",
  people: "bg-surface text-muted",
  nobranch: "bg-bad-50 text-bad",
};

const SHOW = 8;

/**
 * Вкладка «Воркеры», как Worker Pool в LIA: главный выключатель, пулы с настройками, очередью и «Запустить сейчас»,
 * работающие сейчас со стоп-кнопкой, журнал запусков с логом, ходами и токенами, состояние диспетчера
 */
export async function WorkersTab({ locale, taskHref }: { locale: string; taskHref: (key: string) => string }) {
  const [t, data] = await Promise.all([getTranslations("admin.cc"), workersOverview()]);
  const tw = await getTranslations("admin.cc.workers");
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const minutes = (a: Date, b: Date | null) => Math.max(1, Math.round(((b ?? new Date()).getTime() - a.getTime()) / 60_000));
  const tickAge = data.tick ? (Date.now() - Date.parse(data.tick.at)) / 60_000 : null;
  const queueOf = (p: Pool) => data.queues[p] as { key: string; title: string; priority: string; reason?: string; detail?: string; intake?: boolean }[];
  const runKeys = (r: { taskKey: string | null; keys: string[] }) => (r.taskKey ? [r.taskKey] : r.keys);

  return (
    <div className="space-y-4">
      <Card title={tw("master")}>
        <WorkersMaster key="master" initial={data.config} running={data.running.length} />
        <div key="tick" className={cn("mt-3 rounded-lg px-3 py-2 text-xs", tickAge === null || tickAge > 3 ? "bg-warn-50 text-warn" : "bg-surface text-muted")}>
          {tickAge === null ? tw("dispatcherNever") : tw("dispatcherTick", { ago: ago(t, data.tick!.at) })}
          {tickAge !== null && tickAge > 3 && ` ${tw("dispatcherLate")}`}
          {data.requests.length > 0 && ` · ${tw("pendingRequests", { list: data.requests.map((r) => `${tw(`pools.${r.pool}`)}${r.key ? ` ${r.key}` : ""}`).join(", ") })}`}
        </div>
        {data.tick && data.tick.lines.length > 0 && (
          <div key="log" className="mt-2">
            <Collapsible title={tw("dispatcherLog", { ago: ago(t, data.tick.linesAt) })}>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-[11px] leading-snug">{data.tick.lines.join("\n")}</pre>
            </Collapsible>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {POOLS.map((p) => {
          const pc = data.config.pools[p];
          const queue = queueOf(p);
          const running = data.running.filter((r) => r.pool === p);
          const takeable = p === "dev" ? data.readyDev : p === "nocode" ? data.readyNocode : p === "tester" ? queue.filter((q) => q.reason === "test" || q.reason === "retest").length : p === "deployer" ? queue.filter((q) => q.reason === "deploy").length : queue.length;
          return (
            <Card
              key={p}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span key="name">{tw(`pools.${p}`)}</span>
                  <span key="model" className="chip bg-surface text-[10px] text-muted">
                    {pc.model}
                  </span>
                  <span key="state" className={cn("chip text-[10px]", running.length ? "bg-brand-50 text-brand" : !pc.enabled || pc.mode === "manual" ? "bg-surface text-muted" : "bg-ok-50 text-ok")}>
                    {running.length ? tw("poolRunning", { n: running.length }) : !pc.enabled ? tw("poolOff") : pc.mode === "manual" ? tw("modes.manual") : tw("poolIdle")}
                  </span>
                </span>
              }
              // Ключ нужен: Card кладёт actions рядом с заголовком, а если кнопка приходит с сервера отложенной частью, React проверяет её как элемент списка
              actions={<RunWorkerButton key="run" pool={p} label={tw("runNow")} small />}
            >
              <p key="hint" className="mb-3 text-xs text-muted">{tw(`poolHints.${p}`)}</p>
              <PoolSettings key="settings" pool={p} initial={pc} />
              <div key="today" className="mt-2 text-xs text-muted">
                {tw("todayOf", { n: data.today[p], cap: pc.dailyCap })}
                {data.lastStart[p] && ` · ${tw("lastStart", { ago: ago(t, data.lastStart[p]) })}`}
                {p === "deployer" && ` · ${data.deployWindowOpen ? tw("windowOpen") : tw("windowClosed", { from: data.config.deployWindow[0], to: data.config.deployWindow[1] })}`}
              </div>

              {running.length > 0 && (
                <ul key="running" className="mt-3 space-y-1.5">
                  {running.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2 py-1.5 text-xs">
                      <span className="size-2 animate-pulse rounded-full bg-brand" />
                      <span className="font-mono">{r.agent}</span>
                      {runKeys(r).map((k) => (
                        <Link key={k} href={taskHref(k)} scroll={false} className="font-mono text-brand hover:underline">
                          {k}
                        </Link>
                      ))}
                      {!runKeys(r).length && <span>{tw("sweep")}</span>}
                      <span className="text-muted">{tw("minutes", { m: minutes(r.startedAt, null) })}</span>
                      <span className="flex-1" />
                      {r.stopRequested ? <span className="text-bad">{tw("stopping")}</span> : <StopRunButton runId={r.id} />}
                    </li>
                  ))}
                </ul>
              )}

              <div key="queue" className="mt-3 border-t border-line pt-2">
                <div className="mb-1 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted">
                  <span>{tw("queue", { n: queue.length })}</span>
                  <span className="normal-case">{tw("takeable", { n: takeable })}</span>
                </div>
                {queue.length === 0 && <p className="py-2 text-xs text-muted">{tw(`queueEmpty.${p}`)}</p>}
                <ul className="divide-y divide-line">
                  {queue.slice(0, SHOW).map((q) => (
                    <li key={q.key} className="flex items-baseline gap-2 py-1.5 text-sm">
                      <Link href={taskHref(q.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                        <span className="w-20 shrink-0 font-mono text-xs text-muted">{q.key}</span>
                        <span className="min-w-0 truncate">{q.title}</span>
                      </Link>
                      <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[q.priority])} title={PRIORITIES[q.priority]}>
                        {q.priority.toUpperCase()}
                      </span>
                      {q.intake && <span className="chip shrink-0 bg-cta/10 text-[10px] text-cta">{tw("intake")}</span>}
                      {q.reason && (
                        <span className={cn("chip shrink-0 text-[10px]", QUEUE_TONE[q.reason])} title={q.detail}>
                          {tw(`reasons.${q.reason}`, { detail: q.detail ?? "" })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {queue.length > SHOW && <p className="pt-1 text-xs text-muted">{tw("more", { n: queue.length - SHOW })}</p>}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title={tw("runs")}>
        {data.runs.length === 0 && <p key="empty" className="text-sm text-muted">{tw("noRuns")}</p>}
        <ul key="runs" className="divide-y divide-line">
          {data.runs.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <div key="head" className="flex flex-wrap items-center gap-2">
                <span className={cn("chip text-[10px]", RUN_TONE[r.status] ?? "bg-surface text-muted")}>{tw(`status.${r.status}` as "status.done")}</span>
                <span className="font-mono text-xs">{r.agent}</span>
                <span className="text-xs text-muted">{tw(`pools.${r.pool}` as "pools.dev")}</span>
                {runKeys(r).map((k) => (
                  <Link key={k} href={taskHref(k)} scroll={false} className="font-mono text-xs text-brand hover:underline">
                    {k}
                  </Link>
                ))}
                {r.pool === "triage" && !runKeys(r).length && <span className="text-xs">{tw("sweep")}</span>}
                <span className="text-xs text-muted">
                  {when(r.startedAt)} · {tw("minutes", { m: minutes(r.startedAt, r.finishedAt) })} · {r.model}
                  {r.turns ? ` · ${tw("turns", { n: r.turns })}` : ""}
                  {r.tokensIn || r.tokensOut ? ` · ${tw("tokens", { in: Math.round((r.tokensIn ?? 0) / 1000), out: Math.round((r.tokensOut ?? 0) / 1000) })}` : ""}
                  {r.costUsd ? ` · ≈$${r.costUsd.toFixed(2)}` : ""}
                  {r.requestedBy ? ` · ${tw("requestedBy", { who: r.requestedBy })}` : ""}
                </span>
              </div>
              <RunLog key="log" summary={r.summary} log={r.log} />
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-muted">{tw("footer")}</p>
    </div>
  );
}
