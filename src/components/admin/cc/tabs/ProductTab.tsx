import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { productApprovals, productTasksByStatus } from "@/server/services/ccBoard";
import { workersOverview } from "@/server/services/workers";
import { Card } from "@/components/admin/fields";
import { ApprovalButtons } from "@/components/admin/cc/CcControls";
import { PRIORITY_TONE, TaskLine, Empty } from "./shared";
import { cn } from "@/lib/format";

const REASON_TONE: Record<string, string> = {
  question: "bg-brand-50 text-brand",
  needs: "bg-warn-50 text-warn",
};

/**
 * Вкладка «Продакт»: очередь воркера-продакта, некод-задачи дорожки product на согласовании у владельца,
 * все задачи дорожки product по статусам
 */
export async function ProductTab({ locale, taskHref }: { locale: string; taskHref: (key: string) => string }) {
  const [t, tw, pending, byStatus, w] = await Promise.all([
    getTranslations("admin.cc.productTab"),
    getTranslations("admin.cc.workers"),
    productApprovals(),
    productTasksByStatus(),
    workersOverview(),
  ]);
  const queue = w.queues.product;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("subtitle")}</p>

      <Card
        title={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("queue", { n: queue.length })}</span>
            <Link href="/admin/control?tab=workers" className="text-xs font-normal text-brand hover:underline">
              {t("workersLink")}
            </Link>
          </span>
        }
      >
        <p className="mb-2 text-xs text-muted">{t("queueHint")}</p>
        {queue.length === 0 && <p className="py-2 text-xs text-muted">{t("queueEmpty")}</p>}
        <ul className="divide-y divide-line">
          {queue.slice(0, 8).map((q) => (
            <li key={q.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={taskHref(q.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                <span className="w-24 shrink-0 font-mono text-xs text-muted">{q.key}</span>
                <span className="min-w-0 truncate font-medium">{q.title}</span>
              </Link>
              <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[q.priority])}>{q.priority.toUpperCase()}</span>
              {q.reason && (
                <span className={cn("chip shrink-0 text-[10px]", REASON_TONE[q.reason] ?? "bg-surface text-muted")} title={q.detail}>
                  {tw(`reasons.${q.reason}` as "reasons.question", { detail: q.detail ?? "" })}
                </span>
              )}
            </li>
          ))}
        </ul>
        {queue.length > 8 && <p className="pt-1 text-xs text-muted">{tw("more", { n: queue.length - 8 })}</p>}
      </Card>

      <Card title={t("pending", { n: pending.length })}>
        <p className="mb-2 text-xs text-muted">{t("pendingHint")}</p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">{t("pendingEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((x) => {
              const lastReport = x.comments[0]?.text?.trim().slice(0, 180);
              return (
                <li key={x.key} className="py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={taskHref(x.key)} scroll={false} className="hover:underline">
                        <span className="font-mono text-xs text-muted">{x.key}</span>{" "}
                        <span className="font-medium">{x.title}</span>
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn("chip text-[10px]", PRIORITY_TONE[x.priority])}>{x.priority.toUpperCase()}</span>
                      </span>
                      {lastReport && <p className="mt-1 line-clamp-2 text-xs text-muted">{lastReport}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ApprovalButtons taskKey={x.key} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("allByStatus", { n: byStatus.total })}>
        {byStatus.total === 0 ? (
          <Empty>{t("allEmpty")}</Empty>
        ) : (
          <>
            {byStatus.groups.map((g) => (
              <div key={g.id}>
                <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted first:mt-0">{t(`groups.${g.id}` as "groups.backlog")}</p>
                <ul className="divide-y divide-line">
                  {g.tasks.map((task) => (
                    <TaskLine key={task.key} k={task.key} title={task.title} priority={task.priority} href={taskHref(task.key)} />
                  ))}
                </ul>
              </div>
            ))}
            {byStatus.doneTotal > 10 && (
              <p className="mt-2 text-xs text-muted">
                {t("doneLink", { n: 10 })}{" "}
                <Link href="/admin/control?tab=done" className="text-brand hover:underline">
                  →
                </Link>
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
