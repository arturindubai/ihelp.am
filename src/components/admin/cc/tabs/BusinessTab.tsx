import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { businessTasksByStatus, businessNeedsOwner, businessApprovals } from "@/server/services/ccBoard";
import { Card } from "@/components/admin/fields";
import { ApprovalButtons } from "@/components/admin/cc/CcControls";
import { PRIORITY_TONE, TaskLine, Empty } from "./shared";
import { cn } from "@/lib/format";

/**
 * Вкладка «Бизнес»: задачи бизнес-дорожки — юридика, партнёры, аккаунты, деньги, контент.
 * Показывает ожидающие ответа владельца, некод на согласовании и все задачи дорожки по статусам.
 */
export async function BusinessTab({ taskHref }: { taskHref: (key: string) => string }) {
  const [t, byStatus, needsOwner, pendingApprovals] = await Promise.all([
    getTranslations("admin.cc.businessTab"),
    businessTasksByStatus(),
    businessNeedsOwner(),
    businessApprovals(),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("subtitle")}</p>

      {needsOwner.length > 0 && (
        <Card title={t("needsOwner", { n: needsOwner.length })}>
          <p className="mb-2 text-xs text-muted">{t("needsOwnerHint")}</p>
          <ul className="divide-y divide-line">
            {needsOwner.map((x) => (
              <li key={x.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={taskHref(x.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted">{x.key}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{x.title}</span>
                    {x.blockedReason && <span className="block text-xs text-muted line-clamp-1">{x.blockedReason}</span>}
                  </span>
                </Link>
                <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[x.priority])}>{x.priority.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pendingApprovals.length > 0 && (
        <Card title={t("pending", { n: pendingApprovals.length })}>
          <p className="mb-2 text-xs text-muted">{t("pendingHint")}</p>
          <ul className="divide-y divide-line">
            {pendingApprovals.map((x) => {
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
        </Card>
      )}

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
