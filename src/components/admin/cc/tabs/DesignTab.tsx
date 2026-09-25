import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { designApproved, mockupPendingApprovals } from "@/server/services/ccBoard";
import { workersOverview } from "@/server/services/workers";
import { PRIORITIES } from "@/lib/backlog-labels";
import { Card } from "@/components/admin/fields";
import { PoolSettings } from "@/components/admin/cc/WorkersForm";
import { DesignReturnButton, MockupApproveButton, RunWorkerButton } from "@/components/admin/cc/CcControls";
import { PRIORITY_TONE } from "./shared";
import { cn, dateLabel, timeLabel } from "@/lib/format";

/**
 * Вкладка «Дизайн»: очередь дизайнера с блоком пула, дизайны на согласовании у владельца
 * («Утвердить» — в Библиотеку как канон, «Вернуть» — дизайнеру с замечанием) и утверждённые за две недели
 */
export async function DesignTab({ locale, taskHref }: { locale: string; taskHref: (key: string) => string }) {
  const [t, tw, pending, approved, w] = await Promise.all([getTranslations("admin.cc.designTab"), getTranslations("admin.cc.workers"), mockupPendingApprovals(), designApproved(), workersOverview()]);
  const pc = w.config.pools.designer;
  const running = w.running.filter((r) => r.pool === "designer");
  const queue = w.queues.designer;
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("subtitle")}</p>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span key="name">{t("pool")}</span>
              <span key="state" className={cn("chip text-[10px]", running.length ? "bg-brand-50 text-brand" : pc.enabled ? "bg-ok-50 text-ok" : "bg-surface text-muted")}>
                {running.length ? tw("poolRunning", { n: running.length }) : pc.enabled ? tw("poolIdle") : tw("poolOff")}
              </span>
            </span>
          }
          actions={<RunWorkerButton key="run" pool="designer" label={tw("runNow")} small />}
        >
          <p key="hint" className="mb-3 text-xs text-muted">{tw("poolHints.designer")}</p>
          <PoolSettings key="settings" pool="designer" initial={pc} />
          <div key="today" className="mt-2 text-xs text-muted">{tw("todayOf", { n: w.today.designer, cap: pc.dailyCap })}</div>
          <div key="queue" className="mt-3 border-t border-line pt-2">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{t("queue", { n: queue.length })}</div>
            {queue.length === 0 && <p className="py-2 text-xs text-muted">{t("queueEmpty")}</p>}
            <ul className="divide-y divide-line">
              {queue.slice(0, 12).map((q) => (
                <li key={q.key} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <Link href={taskHref(q.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">{q.key}</span>
                    <span className="min-w-0 truncate">{q.title}</span>
                  </Link>
                  <span className="chip shrink-0 bg-surface text-[10px] text-muted">{tw(`reasons.${q.reason}` as "reasons.question", { detail: q.detail ?? "" })}</span>
                </li>
              ))}
            </ul>
            {queue.length > 12 && <p className="pt-1 text-xs text-muted">{tw("more", { n: queue.length - 12 })}</p>}
          </div>
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
    </div>
  );
}
