import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { designApproved, mockupPendingApprovals, mockupWaitingDesign, mockupWaitingRequirements } from "@/server/services/ccBoard";
import { mockupHold, type MockupHold } from "@/lib/cc-design";
import { workersOverview } from "@/server/services/workers";
import { PRIORITIES } from "@/lib/backlog-labels";
import { Card } from "@/components/admin/fields";
import { DesignReturnButton, MockupApproveButton } from "@/components/admin/cc/CcControls";
import { ImageGallery, type GalleryImage } from "@/components/admin/cc/ImageGallery";
import { FLOW_TONE, PRIORITY_TONE } from "./shared";
import { flowOf } from "@/lib/cc-lanes";
import { cn, dateLabel, timeLabel } from "@/lib/format";

/**
 * Вкладка «Дизайн»: очередь дизайнера со ссылкой на вкладку «Воркеры» для настроек пула,
 * дизайны на согласовании у владельца и утверждённые за две недели
 */
export async function DesignTab({ locale, taskHref }: { locale: string; taskHref: (key: string) => string }) {
  const [t, tb, tw, pending, waiting, approved, w, waitingReqs] = await Promise.all([
    getTranslations("admin.cc.designTab"),
    getTranslations("admin.cc.backlog"),
    getTranslations("admin.cc.workers"),
    mockupPendingApprovals(),
    mockupWaitingDesign(),
    designApproved(),
    workersOverview(),
    mockupWaitingRequirements(),
  ]);
  const queue = w.queues.designer;
  const queueSet = new Set(queue.map((q) => q.key));
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;

  const chainSteps = ["requirements", "mockup", "approval"] as const;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("subtitle")}</p>

      {/* Цепочка шагов макета */}
      <div className="flex items-center gap-2 text-sm">
        {chainSteps.map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted">→</span>}
            <span className={
              step === "requirements" && waitingReqs.length > 0 ? "font-semibold text-brand" :
              step === "mockup" && queue.length > 0 && waitingReqs.length === 0 ? "font-semibold text-brand" :
              step === "approval" && pending.length > 0 ? "font-semibold text-brand" :
              "text-muted"
            }>
              {t(`chainStep.${step}` as "chainStep.requirements")}
            </span>
          </span>
        ))}
      </div>

      {/* Шаг 1: задачи, ждущие требований от продакта */}
      <Card title={t("requirementsSection")}>
        <p className="mb-2 text-xs text-muted">{t("requirementsHint")}</p>
        {waitingReqs.length === 0 ? (
          <p className="py-2 text-xs text-muted">{t("requirementsEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {waitingReqs.slice(0, 8).map((x) => (
              <li key={x.key} className="flex items-baseline gap-2 py-1.5 text-sm">
                <Link href={taskHref(x.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{x.key}</span>
                  <span className="min-w-0 truncate">{x.title}</span>
                </Link>
                <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[x.priority])} title={x.priority}>
                  {x.priority.toUpperCase()}
                </span>
                <span className="chip shrink-0 bg-warn-50 text-[10px] text-warn">{tw("reasons.requirements" as "reasons.question", { detail: "" })}</span>
              </li>
            ))}
          </ul>
        )}
        {waitingReqs.length > 8 && <p className="pt-1 text-xs text-muted">{tw("more", { n: waitingReqs.length - 8 })}</p>}
      </Card>

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
      </Card>

      <Card title={t("waiting", { n: waiting.length })}>
        <p className="mb-2 text-xs text-muted">{t("waitingHint")}</p>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted">{t("waitingEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {waiting.map((x) => {
              const hold: MockupHold = mockupHold(x, queueSet.has(x.key));
              const holdTone =
                hold === "owner" ? "bg-warn-50 text-warn" :
                hold === "product" ? "bg-warn-50 text-warn" :
                hold === "active" ? "bg-ok-50 text-ok" :
                "bg-surface text-muted";
              return (
                <li key={x.key} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <Link href={taskHref(x.key)} scroll={false} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">{x.key}</span>
                    <span className="min-w-0 truncate">{x.title}</span>
                  </Link>
                  <span className={cn("chip shrink-0 text-[10px]", PRIORITY_TONE[x.priority])} title={PRIORITIES[x.priority]}>
                    {x.priority.toUpperCase()}
                  </span>
                  {hold !== "none" && (
                    <span className={cn("chip shrink-0 text-[10px]", holdTone)}>
                      {t(`waitingHold.${hold}` as "waitingHold.queue")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`${t("approvalSection")} · ${t("pending", { n: pending.length })}`}>
        <p className="mb-2 text-xs text-muted">{t("pendingHint")}</p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">{t("pendingEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((x) => {
              const imgs: GalleryImage[] = [
                ...(x.mockupUrl && /^\/uploads\//.test(x.mockupUrl) ? [{ url: x.mockupUrl, fileName: x.key }] : []),
                ...x.attachments.filter((a) => !x.mockupUrl || a.url !== x.mockupUrl).map((a) => ({ url: a.url, fileName: a.fileName })),
              ];
              return (
                <li key={x.key} className="py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={taskHref(x.key)} scroll={false} className="hover:underline">
                        <span className="font-mono text-xs text-muted">{x.key}</span> <span className="font-medium">{x.title}</span>
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className={cn("chip text-[10px]", PRIORITY_TONE[x.priority])} title={PRIORITIES[x.priority]}>
                          {x.priority.toUpperCase()}
                        </span>
                        {x.mockupRequired && <span className="chip bg-bad-50 text-[10px] text-bad">{t("gate")}</span>}
                        {x._count.attachments > 0 && <span className="chip bg-surface text-[10px]">{t("files", { n: x._count.attachments })}</span>}
                      </span>
                      {x.design?.trim() && <span className="mt-1 line-clamp-2 block text-xs text-muted">{t("designSnippet", { text: x.design.trim().slice(0, 220) })}</span>}
                      {x.mockupUrl && /^https?:\/\//.test(x.mockupUrl) && (
                        <a href={x.mockupUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-brand hover:underline">
                          <ExternalLink size={11} /> {x.mockupUrl.replace(/^https?:\/\//, "").slice(0, 60)}
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <MockupApproveButton taskKey={x.key} needs={x.needs} />
                      <DesignReturnButton taskKey={x.key} />
                    </div>
                  </div>
                  {imgs.length > 0 && (
                    <div className="mt-2">
                      <ImageGallery images={imgs} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("approved", { n: approved.length })}>
        {approved.length === 0 ? (
          <p className="text-sm text-muted">{t("approvedEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {approved.map((x) => {
              const imgs: GalleryImage[] = [
                ...(x.mockupUrl && /^\/uploads\//.test(x.mockupUrl) ? [{ url: x.mockupUrl, fileName: x.key }] : []),
                ...x.attachments.filter((a) => !x.mockupUrl || a.url !== x.mockupUrl).map((a) => ({ url: a.url, fileName: a.fileName })),
              ];
              const flow = flowOf(x);
              const tone = FLOW_TONE[flow] ?? "bg-surface text-muted";
              const firstDep = x.openDeps[0];
              const depFlow = firstDep ? flowOf(firstDep) : null;
              return (
                <li key={x.key} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
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
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={cn("chip text-[10px]", tone)}>{tb(`flows.${flow}` as "flows.done")}</span>
                    {flow === "working" && x.claimedBy && (
                      <span className="text-muted">{t("approvedAgent", { agent: x.claimedBy })}</span>
                    )}
                    {flow === "owner" && x.blockedReason && (
                      <Link href={taskHref(x.key)} scroll={false} className="truncate text-muted hover:underline" style={{ maxWidth: "24rem" }}>
                        {x.blockedReason.slice(0, 120)}
                      </Link>
                    )}
                    {flow === "blocked" && firstDep && depFlow && (
                      <>
                        <Link href={taskHref(firstDep.key)} scroll={false} className="font-mono text-brand hover:underline">
                          {firstDep.key}
                        </Link>
                        <span className="text-muted">({tb(`flows.${depFlow}` as "flows.done")})</span>
                      </>
                    )}
                  </div>
                  {imgs.length > 0 && (
                    <div className="mt-2">
                      <ImageGallery images={imgs} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
