import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getTask } from "@/server/services/cc";
import { listEpics } from "@/server/services/epics";
import { AREAS, BLOCKED_ON_LABELS, COMMENT_KIND_LABELS, LAYERS, OWNERS, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { nextStatuses } from "@/lib/cc-flow";
import { Card } from "@/components/admin/fields";
import { CommentForm, QuickMove, STATUS_TONE, TaskEditor, TransitionPanel } from "@/components/admin/cc/TaskControls";
import { TaskEditorForm } from "@/components/admin/cc/TaskEditorForm";
import { Attachments } from "@/components/admin/cc/Attachments";
import { Collapsible } from "@/components/admin/cc/Collapsible";
import { RunWorkerButton } from "@/components/admin/cc/CcControls";
import { poolForTask } from "@/lib/workers";
import { cn, dateLabel, timeLabel } from "@/lib/format";

const REPO = process.env.REPO_URL || "https://github.com/arturindubai/ihelp.am";

const KIND_TONE: Record<string, string> = {
  note: "border-line",
  progress: "border-line",
  report: "border-ok",
  handoff: "border-brand",
  review: "border-warn",
  error: "border-bad",
  system: "border-line bg-surface/60",
  triage: "border-brand bg-brand-50/40",
};

/** Ссылка на документ: путь в репозитории ведёт на GitHub, адрес — как есть */
const docHref = (d: string) => (/^https?:\/\//.test(d) ? d : `${REPO}/blob/main/${d.replace(/^\.?\//, "")}`);

/**
 * Карточка задачи целиком — одна и та же на отдельной странице и в шторке поверх списка:
 * суть и критерии, связи в обе стороны, работа (кто держит, пульс, ветка, коммит), готовность,
 * переходы статуса, лента (отчёты, ошибки, решения, записи сторожа) вместе с историей, файлы
 */
export async function TaskDetail({ taskKey, locale, taskHref }: { taskKey: string; locale: string; taskHref: (key: string) => string }) {
  const [data, epics, t] = await Promise.all([getTask(taskKey), listEpics(), getTranslations("admin.cc")]);
  if (!data) return <p className="py-10 text-center text-muted">{t("gate.not_found")}</p>;
  const { task, blockers, blocking, readiness, health } = data;
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const ago = (d: Date | null) => {
    if (!d) return "—";
    const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
    return m < 60 ? t("minAgo", { m }) : m < 48 * 60 ? t("hoursAgo", { h: Math.round(m / 60) }) : t("daysAgo", { d: Math.round(m / 1440) });
  };
  const actor = (a: string) => (a === "watchdog" || a === "system" ? t(`actors.${a}`) : a);
  const valueOf = (field: string, v: string | null) => {
    if (!v) return "—";
    if (field === "status") return STATUSES[v] ?? v;
    if (field === "blockedOn") return BLOCKED_ON_LABELS[v] ?? v;
    if (field === "health") return t.has(`values.${v}`) ? t(`values.${v}` as "values.ok") : v;
    if (field === "priority") return PRIORITIES[v] ?? v;
    if (field === "stage") return STAGES[v] ?? v;
    if (field === "owner") return OWNERS[v] ?? v;
    return v;
  };

  // Лента: записи и история изменений вместе, по времени — так видно, кто что сделал и почему
  const feed = [
    ...task.comments.map((c) => ({ at: c.createdAt, id: c.id, comment: c, event: null })),
    ...task.events.map((e) => ({ at: e.createdAt, id: e.id, comment: null, event: e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const errors = task.comments.filter((c) => c.kind === "error").length;
  const moves = nextStatuses(task.status, "owner");
  const pool = poolForTask(task);
  const branchUrl = task.branch ? `${REPO}/compare/main...${encodeURIComponent(task.branch)}` : null;
  const chips = [
    health.stale && { tone: "bg-bad-50 text-bad", text: `🪦 ${t("health.stale")}` },
    health.phantom && { tone: "bg-bad-50 text-bad", text: `👻 ${t("health.phantom")}` },
    health.stuckReview && { tone: "bg-warn-50 text-warn", text: `⏳ ${t("health.stuckReview")}` },
    health.needsOwner && { tone: "bg-warn-50 text-warn", text: `✋ ${t("health.needsOwner")}` },
    health.waitingDeps && { tone: "bg-surface text-muted", text: `🔒 ${t("health.waitingDeps")}` },
    task.rework > 0 && { tone: "bg-warn-50 text-warn", text: `↩ ${t("health.rework", { n: task.rework })}` },
    task.reclaims > 0 && { tone: "bg-surface text-muted", text: t("health.reclaims", { n: task.reclaims }) },
    errors > 0 && { tone: "bg-bad-50 text-bad", text: `⚠ ${COMMENT_KIND_LABELS.error}: ${errors}` },
  ].filter(Boolean) as { tone: string; text: string }[];

  return (
    <div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted">{task.key}</span>
          <span className={cn("chip text-xs", STATUS_TONE[task.status])}>{STATUSES[task.status]}</span>
          {chips.map((c) => (
            <span key={c.text} className={cn("chip text-xs", c.tone)}>
              {c.text}
            </span>
          ))}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{task.title}</h1>
        <div className="text-sm text-muted">
          {STAGES[task.stage]} · {AREAS[task.area]} · {LAYERS[task.layer]} · {PRIORITIES[task.priority]} · {OWNERS[task.owner]}
          {task.estimate ? ` · ${task.estimate}` : ""} · {task.source === "code" ? t("form.sourceCode") : task.source === "intake" ? t("form.sourceIntake") : t("form.sourceUi")}
        </div>
        {pool && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RunWorkerButton pool={pool} taskKey={task.key} label={t("runWorker.button", { pool: t(`workers.pools.${pool}`) })} />
            <span className="text-xs text-muted">{t("runWorker.hint")}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card title={task.summary}>
            {task.epicRef && (
              <p className="mb-3 text-sm">
                <Link href={`/admin/control/epics/${task.epicRef.key}`} className="text-brand hover:underline">
                  {t("form.epicOf")}: {task.epicRef.title}
                </Link>
              </p>
            )}
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
            {[
              [t("form.design"), task.design],
              [t("form.qaNotes"), task.qaNotes],
              [t("form.deployNotes"), task.deployNotes],
            ].map(([title, body]) =>
              body ? (
                <div key={title}>
                  <h3 className="h3 mt-4 mb-2">{title}</h3>
                  <p className="whitespace-pre-line text-sm">{body}</p>
                </div>
              ) : null,
            )}
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
            {(blockers.length > 0 || blocking.length > 0 || task.docs.length > 0 || task.scope.length > 0) && (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {blockers.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("depends")}</div>
                    {blockers.map((b) => (
                      <Link key={b.key} href={taskHref(b.key)} scroll={false} className="block hover:underline">
                        <span className={["done", "cancelled"].includes(b.status) ? "text-ok" : "text-bad"}>●</span> <span className="font-mono text-xs">{b.key}</span> {b.title}
                        <span className="text-xs text-muted"> · {STATUSES[b.status]}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {blocking.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("blocking")}</div>
                    {blocking.map((b) => (
                      <Link key={b.key} href={taskHref(b.key)} scroll={false} className="block hover:underline">
                        <span className="font-mono text-xs">{b.key}</span> {b.title}
                        <span className="text-xs text-muted"> · {STATUSES[b.status]}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {task.docs.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("docs")}</div>
                    {task.docs.map((d) => (
                      <a key={d} href={docHref(d)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-brand hover:underline">
                        {d} <ExternalLink size={11} />
                      </a>
                    ))}
                  </div>
                )}
                {task.scope.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted">{t("form.scope")}</div>
                    {task.scope.map((p) => (
                      <div key={p} className="font-mono text-xs">
                        {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title={t("feed.title")}>
            {feed.length === 0 && <p className="text-sm text-muted">{t("feed.empty")}</p>}
            <ul className="space-y-2">
              {feed.map((f) =>
                f.comment ? (
                  <li key={f.id} className={cn("rounded-lg border-l-4 px-3 py-2 text-sm", KIND_TONE[f.comment.kind] ?? "border-line")}>
                    <div className="text-xs text-muted">
                      {actor(f.comment.author)} · {when(f.at)} · {t.has(`feed.kinds.${f.comment.kind}`) ? t(`feed.kinds.${f.comment.kind}` as "feed.kinds.note") : f.comment.kind}
                    </div>
                    <p className="whitespace-pre-line">{f.comment.text}</p>
                  </li>
                ) : (
                  <li key={f.id} className="px-3 text-xs text-muted">
                    {when(f.at)} · {actor(f.event!.actor)} · {t.has(`fields.${f.event!.field}`) ? t(`fields.${f.event!.field}` as "fields.status") : f.event!.field}: {valueOf(f.event!.field, f.event!.from)} →{" "}
                    <b className="text-ink">{valueOf(f.event!.field, f.event!.to)}</b>
                  </li>
                ),
              )}
            </ul>
            <CommentForm taskKey={task.key} />
          </Card>

          <Card title={t("form.files")}>
            <Attachments subject={{ taskKey: task.key }} items={task.attachments} />
          </Card>

          <Collapsible title={t("form.edit")}>
            <Card>
              <TaskEditorForm
                isNew={false}
                epics={epics.map((e) => ({ key: e.key, title: e.title }))}
                initial={{
                  key: task.key,
                  title: task.title,
                  summary: task.summary,
                  details: task.details ?? "",
                  requirements: task.requirements.join("\n"),
                  design: task.design ?? "",
                  qaNotes: task.qaNotes ?? "",
                  deployNotes: task.deployNotes ?? "",
                  needs: task.needs.join("\n"),
                  depends: task.depends.join("\n"),
                  docs: task.docs.join("\n"),
                  epicKey: task.epicKey ?? "",
                  area: task.area,
                  layer: task.layer,
                  priority: task.priority,
                  stage: task.stage,
                  owner: task.owner,
                  estimate: task.estimate ?? "",
                  scope: task.scope.join("\n"),
                }}
              />
            </Card>
          </Collapsible>
        </div>

        <div className="space-y-4">
          <Card title={`${t("move.title")} · ${STATUSES[task.status]}`}>
            {task.status === "blocked" && task.blockedReason && (
              <p className="mb-3 rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">
                {task.blockedOn ? `${BLOCKED_ON_LABELS[task.blockedOn] ?? task.blockedOn}: ` : ""}
                {task.blockedReason}
              </p>
            )}
            <TransitionPanel taskKey={task.key} status={task.status} layer={task.layer} moves={moves} />
            {(health.stale || health.phantom) && (
              <div className="mt-3">
                <QuickMove taskKey={task.key} to={health.phantom ? "backlog" : "ready"} text={health.phantom ? t("attention.phantomReason") : t("attention.returnReason")} label={t("attention.returnToQueue")} />
              </div>
            )}
          </Card>

          <Card title={t("work.title")}>
            <dl className="space-y-1.5 text-sm">
              {task.claimedBy ? (
                <>
                  <Row label={t("work.worker")} value={task.claimedBy} />
                  <Row label={t("work.pulse")} value={ago(task.heartbeatAt)} tone={health.stale ? "bad" : undefined} />
                  {task.claimUntil && <Row label={t("work.lease")} value={when(task.claimUntil)} tone={health.stale ? "bad" : undefined} />}
                  {task.session && <Row label={t("work.session")} value={task.session.slice(0, 12)} mono />}
                </>
              ) : task.assignee ? (
                <Row label={t("work.human")} value={task.assignee} />
              ) : (
                <p className="text-xs text-muted">{t("work.none")}</p>
              )}
              {task.startedAt && <Row label={t("work.started")} value={when(task.startedAt)} />}
              {task.branch && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">{t("work.branch")}</dt>
                  <dd className="text-right">
                    <span className="font-mono text-xs">{task.branch}</span>{" "}
                    {branchUrl && (
                      <a href={branchUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
                        {t("work.compare")}
                      </a>
                    )}
                  </dd>
                </div>
              )}
              {task.testedSha && (
                <Row label={t("work.tested")} value={`${task.testedBy ?? ""} · ${task.testedSha.slice(0, 10)}${task.testedAt ? ` · ${when(task.testedAt)}` : ""}`} />
              )}
              {task.deployedSha && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted">{t("work.commit")}</dt>
                  <dd>
                    <a href={`${REPO}/commit/${task.deployedSha}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand hover:underline">
                      {task.deployedSha.slice(0, 10)}
                    </a>
                  </dd>
                </div>
              )}
              {task.proof && (
                <div>
                  <dt className="text-muted">{t("work.proof")}</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-xs">{task.proof}</dd>
                </div>
              )}
              {task.reclaims > 0 && <Row label={t("work.reclaims")} value={String(task.reclaims)} />}
              {task.rework > 0 && <Row label={t("work.rework")} value={String(task.rework)} />}
            </dl>
          </Card>

          {(task.triagedAt || ["backlog", "blocked"].includes(task.status)) && (
            <Card title={t("triage.title")}>
              {task.triagedAt ? (
                <>
                  <p className="text-xs text-muted">{t("triage.by", { who: task.triagedBy ?? "—", date: when(task.triagedAt) })}</p>
                  {task.triageNote && <p className="mt-1 whitespace-pre-line text-sm">{task.triageNote}</p>}
                </>
              ) : (
                <p className="text-xs text-brand">{t("triage.waiting")}</p>
              )}
            </Card>
          )}

          {["backlog", "ready", "blocked"].includes(task.status) && (
            <Card title={t("dor.title")}>
              <p className={cn("mb-2 text-xs font-medium", readiness.ready ? "text-ok" : "text-bad")}>{readiness.ready ? t("dor.ok") : t("dor.notOk")}</p>
              <ul className="space-y-1 text-xs">
                {readiness.items.map((i) => (
                  <li key={i.key} className="flex gap-1.5">
                    <span className={i.ok ? "text-ok" : i.hard ? "text-bad" : "text-warn"}>{i.ok ? "✓" : i.hard ? "✗" : "!"}</span>
                    <span className={i.ok ? "text-muted" : ""}>
                      {t(`dor.items.${i.key}` as "dor.items.why")}
                      {!i.ok && i.hard ? ` · ${t("dor.hard")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={t("attrs")}>
            <TaskEditor taskKey={task.key} initial={{ owner: task.owner, priority: task.priority, stage: task.stage, assignee: task.assignee ?? "" }} />
            <p className="mt-3 text-xs text-muted">{t("updated", { date: when(task.updatedAt) })}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone, mono }: { label: string; value: string; tone?: "bad"; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={cn("text-right", tone === "bad" && "text-bad", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
