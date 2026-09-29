import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { approvals } from "@/server/services/ccBoard";
import { attention } from "@/server/services/cc";
import { workersOverview } from "@/server/services/workers";
import { db } from "@/server/db";
import { PRIORITIES } from "@/lib/backlog-labels";
import { LANES } from "@/lib/cc-lanes";
import { Card } from "@/components/admin/fields";
import { QuickMove } from "@/components/admin/cc/TaskControls";
import { silentLabel } from "@/components/admin/cc/TaskBadges";
import { ApprovalButtons, ApproveAllButton, CommentButton, RejectAllButton, ReturnAllButton, RunWorkerButton } from "@/components/admin/cc/CcControls";
import { Empty, LANE_DOT, PRIORITY_TONE, RUN_TONE, TaskLine, ago } from "./shared";
import { cn } from "@/lib/format";

type Href = (key: string) => string;

/** «В разработке»: задачи в работе — кто держит, пульс, ветка, сколько возвратов; брошенные — вернуть в очередь */
export async function DevTab({ taskHref }: { taskHref: Href }) {
  const [t, td, attn, tasks] = await Promise.all([
    getTranslations("admin.cc"),
    getTranslations("admin.cc.devTab"),
    attention(),
    db.task.findMany({ where: { status: "in_progress" }, orderBy: [{ priority: "asc" }, { startedAt: "asc" }], select: { key: true, title: true, priority: true, branch: true, startedAt: true, rework: true, reclaims: true } }),
  ]);
  const health = new Map([...attn.working, ...attn.stale].map((x) => [x.key, x]));
  const runs = await db.workerRun.findMany({ where: { status: "running" }, select: { agent: true, taskKey: true } });
  if (!tasks.length) return <Empty>{td("empty")}</Empty>;
  return (
    <Card title={`${td("title")} · ${tasks.length}`}>
      <ul className="divide-y divide-line">
        {tasks.map((x) => {
          const h = health.get(x.key);
          const worker = runs.find((r) => r.taskKey === x.key);
          const bad = h?.health.stale || h?.health.phantom;
          return (
            <TaskLine
              key={x.key}
              k={x.key}
              title={x.title}
              priority={x.priority}
              href={taskHref(x.key)}
              tone={bad ? "bg-bad-50/40" : undefined}
              sub={
                <>
                  👤 {h?.claimedBy ?? "—"}
                  {worker ? ` · ${td("worker")}` : ""}
                  {h?.health.silentMin != null ? ` · ${td("pulse", { ago: silentLabel(t, h.health.silentMin) })}` : ""}
                  {x.startedAt ? ` · ${td("started", { ago: ago(t, x.startedAt) })}` : ""}
                  {x.branch ? ` · ⎇ ${x.branch}` : ""}
                  {x.rework ? ` · ↩ ${x.rework}` : ""}
                </>
              }
              right={bad ? <QuickMove taskKey={x.key} to={h?.health.phantom ? "backlog" : "ready"} text={h?.health.phantom ? t("attention.phantomReason") : t("attention.returnReason")} label={t("attention.returnToQueue")} /> : undefined}
            />
          );
        })}
      </ul>
    </Card>
  );
}

/** «Деплоер»: очередь проверки — ждут тестировщика, протестированы и ждут выкладки, кого сейчас держат */
export async function DeployerTab({ taskHref }: { taskHref: Href }) {
  const [td, data] = await Promise.all([getTranslations("admin.cc.deployerTab"), workersOverview()]);
  const tw = await getTranslations("admin.cc.workers");
  const sections = [
    { id: "deploy", title: td("toDeploy"), items: data.queues.deployer, pool: "deployer" },
    { id: "test", title: td("toTest"), items: data.queues.tester, pool: "tester" },
  ];
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {data.config.deployWindow === null ? tw("windowAny") : data.deployWindowOpen ? tw("windowOpen") : tw("windowClosed", { from: data.config.deployWindow[0], to: data.config.deployWindow[1] })} · {td("hint")}
      </p>
      {sections.map((s) => (
        <Card key={s.id} title={`${s.title} · ${s.items.length}`} actions={s.items.length ? <RunWorkerButton pool={s.pool} label={tw("runNow")} small /> : undefined}>
          {s.items.length === 0 && <p className="text-sm text-muted">{td(`empty.${s.id}`)}</p>}
          <ul className="divide-y divide-line">
            {s.items.map((x) => (
              <TaskLine
                key={x.key}
                k={x.key}
                title={x.title}
                priority={x.priority}
                href={taskHref(x.key)}
                right={<span className="chip bg-surface text-[10px] text-muted">{tw(`reasons.${x.reason}`, { detail: x.detail ?? "" })}</span>}
              />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** «Согласования»: не-код на проверке (документы, решения, контент) — принять, вернуть или отклонить; «Принять все» по дорожке. Макеты — на вкладке «Дизайн» */
export async function ApprovalsTab({ taskHref }: { taskHref: Href }) {
  const [t, ta, tb, items] = await Promise.all([getTranslations("admin.cc"), getTranslations("admin.cc.approvals"), getTranslations("admin.cc.backlog"), approvals()]);
  if (!items.length) return <Empty>{ta("empty")}</Empty>;
  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <>
          <p className="text-xs text-muted">{ta("hint")}</p>
          {LANES.filter((l) => items.some((x) => x.lane === l)).map((l) => {
            const list = items.filter((x) => x.lane === l);
            return (
              <Card
                key={l}
                title={
                  <span className="flex items-center gap-2">
                    <span key="dot" className={cn("size-2 rounded-full", LANE_DOT[l])} />
                    <span key="name">
                      {tb(`lanes.${l}`)} · {list.length}
                    </span>
                  </span>
                }
                actions={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ApproveAllButton keys={list.map((x) => x.key)} label={ta("approveAll")} />
                    <ReturnAllButton keys={list.map((x) => x.key)} label={ta("returnAll")} />
                    <RejectAllButton keys={list.map((x) => x.key)} label={ta("rejectAll")} />
                  </span>
                }
              >
                <ul className="divide-y divide-line">
                  {list.map((x) => {
                    const report = x.comments[0];
                    return (
                      <li key={x.key} className="flex flex-wrap items-start gap-3 py-3">
                        <Link href={taskHref(x.key)} scroll={false} className="min-w-0 flex-1">
                          <span className="font-mono text-xs text-muted">{x.key}</span>{" "}
                          <span className={cn("chip text-[10px]", PRIORITY_TONE[x.priority])}>{PRIORITIES[x.priority]}</span>
                          <span className="mt-0.5 block font-medium">{x.title}</span>
                          {x.ownerSummary && (
                            <span className="mt-1 block whitespace-pre-line text-xs font-medium">
                              {x.ownerSummary}
                            </span>
                          )}
                          {report && (
                            <span className="mt-1 line-clamp-3 block whitespace-pre-line text-xs text-muted">
                              {report.author}: {report.text}
                            </span>
                          )}
                          <span className="block text-xs text-muted">
                            {ago(t, x.updatedAt)}
                            {x._count.attachments ? ` · 📎 ${x._count.attachments}` : ""}
                          </span>
                        </Link>
                        <div className="flex flex-col items-end gap-1 self-start">
                          {x.nextSteps.length > 0 && (
                            <div className="mb-1 w-full rounded-lg bg-surface p-3 text-sm">
                              <p className="font-medium text-muted">{ta("afterAccept")}</p>
                              <ul className="mt-1 list-disc pl-4 text-ink">
                                {x.nextSteps.slice(0, 5).map((s, i) => (
                                  <li key={i} className="break-words">{s}</li>
                                ))}
                              </ul>
                              {x.nextSteps.length > 5 && (
                                <p className="mt-1 text-xs text-muted">{ta("afterAcceptMore", { count: x.nextSteps.length - 5 })}</p>
                              )}
                            </div>
                          )}
                          <ApprovalButtons taskKey={x.key} />
                          <CommentButton taskKey={x.key} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
