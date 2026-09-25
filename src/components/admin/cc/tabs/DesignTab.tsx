import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { designApproved, mockupPendingApprovals } from "@/server/services/ccBoard";
import { workersOverview } from "@/server/services/workers";
import { PRIORITIES } from "@/lib/backlog-labels";
import { Card } from "@/components/admin/fields";
import { DesignReturnButton, MockupApproveButton, RunWorkerButton, StopRunButton } from "@/components/admin/cc/CcControls";
import { PoolSettings } from "@/components/admin/cc/WorkersForm";
import { PRIORITY_TONE, ago } from "./shared";
import { cn, dateLabel, timeLabel } from "@/lib/format";

/**
 * Вкладка «Дизайн»: блок пула дизайнера, очередь дизайнера с причинами, дизайны на согласовании у владельца
 * («Утвердить» — в Библиотеку как канон, «Вернуть» — дизайнеру с замечанием) и утверждённые за две недели
 */
export async function DesignTab({ locale, taskHref }: { locale: string; taskHref: (key: string) => string }) {
  const [t, tw, tcc, pending, approved, w] = await Promise.all([
    getTranslations("admin.cc.designTab"),
    getTranslations("admin.cc.workers"),
    getTranslations("admin.cc"),
    mockupPendingApprovals(),
    designApproved(),
    workersOverview(),
  ]);
  const queue = w.queues.designer;
  const pc = w.config.pools.designer;
  const running = w.running.filter((r) => r.pool === "designer");
  const paused = !!w.config.pausedUntil && Date.parse(w.config.pausedUntil) > Date.now();
  const capOut = w.today.designer >= pc.dailyCap;
  const runKeys = (r: { taskKey: string | null; keys: string[] }) => (r.taskKey ? [r.taskKey] : r.keys);
  const minutes = (a: Date) => Math.max(1, Math.round((Date.now() - a.getTime()) / 60_000));
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("subtitle")}</p>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{tw("pools.designer")}</span>
            <span className="chip bg-surface text-[10px] text-muted">{pc.model}</span>
            <span className={cn("chip text-[10px]", running.length ? "bg-brand-50 text-brand" : !pc.enabled || pc.mode === "manual" ? "bg-surface text-muted" : paused || capOut ? "bg-warn-50 text-warn" : "bg-ok-50 text-ok")}>
              {running.length
                ? tw("poolRunning", { n: running.length })
                : !pc.enabled
                  ? tw("poolOff")
                  : pc.mode === "manual"
                    ? tw("modes.manual")
                    : paused
                      ? tw("poolPaused")
                      : capOut
                        ? tw("poolCapOut", { n: w.today.designer, cap: pc.dailyCap })
                        : tw("poolIdle")}
            </span>
          </span>
        }
        actions={<RunWorkerButton key="run" pool="designer" label={tw("runNow")} small />}
      >
        <p className="mb-3 text-xs text-muted">{tw("poolHints.designer")}</p>
        <PoolSettings pool="designer" initial={pc} />
        <div className="mt-2 text-xs text-muted">
          {tw("todayOf", { n: w.today.designer, cap: pc.dailyCap })}
          {w.lastStart.designer && ` · ${tw("lastStart", { ago: ago(tcc, w.lastStart.designer) })}`}
        </div>
        {running.length > 0 && (
          <ul className="mt-3 space-y-1.5">
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
                <span className="text-muted">{tw("minutes", { m: minutes(r.startedAt) })}</span>
                <span className="flex-1" />
                {r.stopRequested ? <span className="text-bad">{tw("stopping")}</span> : <StopRunButton runId={r.id} />}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 border-t border-line pt-2">
          <div className="mb-1 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted">
            <span>{tw("queue", { n: queue.length })}</span>
          </div>
          {queue.length === 0 && <p className="py-2 text-xs text-muted">{tw("queueEmpty.designer")}</p>}
          <ul className="divide-y divide-line">
            {queue.slice(0, 8).map((q) => (
              <li key={q.key} className="flex items-baseline gap-2 py-1.5 text-sm">
                <Link href={taskHref(q.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{q.key}</span>
                  <span className="min-w-0 truncate">{q.title}</span>
                </Link>
                <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[q.priority])} title={PRIORITIES[q.priority]}>
                  {q.priority.toUpperCase()}
                </span>
                {q.reason && (
                  <span
                    className={cn(
                      "chip shrink-0 text-[10px]",
                      q.reason === "question" ? "bg-brand-50 text-brand" : q.reason === "mockup" ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn",
                    )}
                    title={q.detail}
                  >
                    {tw(`reasons.${q.reason}` as "reasons.question", { detail: q.detail ?? "" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {queue.length > 8 && <p className="pt-1 text-xs text-muted">{tw("more", { n: queue.length - 8 })}</p>}
        </div>
      </Card>

      <Card title={`${t("pending", { n: pending.length })}`}>
        <p className="mb-2 text-xs text-muted">{t("pendingHint")}</p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">{t("pendingEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((x) => (
              <li key={x.key} className="flex flex-wrap items-start gap-3 py-3">
                <Link href={taskHref(x.key)} scroll={false} className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted">{x.key}</span> <span className="font-medium">{x.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className={cn("chip text-[10px]", PRIORITY_TONE[x.priority])} title={PRIORITIES[x.priority]}>
                      {x.priority.toUpperCase()}
                    </span>
                    {x.mockupRequired && <span className="chip bg-bad-50 text-[10px] text-bad">{t("gate")}</span>}
                    {x._count.attachments > 0 && <span className="chip bg-surface text-[10px]">{t("files", { n: x._count.attachments })}</span>}
                  </span>
                  {x.design?.trim() && <span className="mt-1 line-clamp-2 block text-xs text-muted">{t("designSnippet", { text: x.design.trim().slice(0, 220) })}</span>}
                  {x.mockupUrl && (
                    <a href={x.mockupUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-brand hover:underline">
                      <ExternalLink size={11} /> {x.mockupUrl.replace(/^https?:\/\//, "").slice(0, 60)}
                    </a>
                  )}
                </Link>
                <div className="flex flex-col items-end gap-1.5">
                  <MockupApproveButton taskKey={x.key} />
                  <DesignReturnButton taskKey={x.key} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("approved", { n: approved.length })}>
        {approved.length === 0 ? (
          <p className="text-sm text-muted">{t("approvedEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {approved.map((x) => (
              <li key={x.key} className="flex flex-wrap items-baseline gap-2 py-1.5">
                <Link href={taskHref(x.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{x.key}</span>
                  <span className="min-w-0 truncate">{x.title}</span>
                </Link>
                <span className="text-xs text-muted">
                  {x.mockupApprovedBy} · {when(x.mockupApprovedAt!)}
                </span>
                <Link href={`/admin/control/library?doc=design-${x.key.toLowerCase()}`} className="text-xs text-brand hover:underline">
                  {t("canon")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
