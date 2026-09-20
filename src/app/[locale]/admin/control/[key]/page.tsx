import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { getTask } from "@/server/services/cc";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { CommentForm, TaskEditor } from "@/components/admin/cc/TaskControls";
import { dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const FIELD_LABELS: Record<string, Record<string, string>> = { status: STATUSES, owner: OWNERS, priority: PRIORITIES, stage: STAGES };

export default async function TaskPage({ params }: { params: Promise<{ locale: string; key: string }> }) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const data = await getTask(decodeURIComponent(key));
  if (!data) notFound();
  const { task, blockers, blocking } = data;
  const t = await getTranslations("admin.cc");
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const value = (field: string, v?: string | null) => (v ? (FIELD_LABELS[field]?.[v] ?? v) : "—");

  return (
    <div className="max-w-4xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            <span className="font-mono text-base text-muted">{task.key}</span>
            {task.title}
          </span>
        }
        sub={`${STAGES[task.stage]} · ${AREAS[task.area]} · ${LAYERS[task.layer]} · ${PRIORITIES[task.priority]} · ${OWNERS[task.owner]}${task.estimate ? ` · ${task.estimate}` : ""}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card title={task.summary}>
            {task.details && <p className="whitespace-pre-line text-sm">{task.details}</p>}
            <h3 className="h3 mt-4 mb-2">{t("requirements")}</h3>
            <ul className="space-y-1.5 text-sm">
              {task.requirements.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted">{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {task.needs.length > 0 && (
              <>
                <h3 className="h3 mt-4 mb-2">{t("needs")}</h3>
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {task.needs.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            {(blockers.length > 0 || blocking.length > 0 || task.docs.length > 0) && (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {blockers.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("depends")}</div>
                    {blockers.map((b) => (
                      <Link key={b.key} href={`/admin/control/${b.key}`} className="block">
                        <span className={b.status === "done" ? "text-ok" : "text-bad"}>●</span> <span className="font-mono text-xs">{b.key}</span> {b.title}
                      </Link>
                    ))}
                  </div>
                )}
                {blocking.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("blocking")}</div>
                    {blocking.map((b) => (
                      <Link key={b.key} href={`/admin/control/${b.key}`} className="block">
                        <span className="font-mono text-xs">{b.key}</span> {b.title}
                      </Link>
                    ))}
                  </div>
                )}
                {task.docs.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("docs")}</div>
                    {task.docs.map((d) => (
                      <div key={d} className="font-mono text-xs">
                        {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title={t("comments")}>
            {task.comments.length === 0 && <p className="text-sm text-muted">{t("noComments")}</p>}
            <ul className="space-y-3">
              {task.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="text-xs text-muted">
                    {c.author} · {when(c.createdAt)}
                    {c.kind === "report" ? " · отчёт агента" : ""}
                  </div>
                  <p className="whitespace-pre-line">{c.text}</p>
                </li>
              ))}
            </ul>
            <CommentForm taskKey={task.key} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={STATUSES[task.status]}>
            {task.claimedBy && task.claimUntil && (
              <p className="mb-3 rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">{t("claimed", { agent: task.claimedBy, until: when(task.claimUntil) })}</p>
            )}
            <TaskEditor
              taskKey={task.key}
              initial={{
                status: task.status,
                owner: task.owner,
                priority: task.priority,
                stage: task.stage,
                assignee: task.assignee ?? "",
                blockedReason: task.blockedReason ?? "",
              }}
            />
            <p className="mt-3 text-xs text-muted">{t("updated", { date: when(task.updatedAt) })}</p>
          </Card>

          <Card title={t("history")}>
            {task.events.length === 0 && <p className="text-sm text-muted">{t("noHistory")}</p>}
            <ul className="space-y-2 text-xs">
              {task.events.map((e) => (
                <li key={e.id}>
                  <span className="text-muted">{when(e.createdAt)} · {e.actor}</span>
                  <div>
                    {t(`fields.${e.field}` as "fields.status")}: {value(e.field, e.from)} → <b>{value(e.field, e.to)}</b>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
