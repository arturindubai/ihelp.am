import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { needsYou } from "@/server/services/ccBoard";
import { parseMultiQuestion } from "@/lib/cc-owner-q";
import { parseDuplicateOriginalKey } from "@/lib/cc-intake";
import { BLOCKED_ON_LABELS, PRIORITIES } from "@/lib/backlog-labels";
import { QuickMove } from "@/components/admin/cc/TaskControls";
import { silentLabel } from "@/components/admin/cc/TaskBadges";
import { ApprovalButtons, RunWorkerButton, YouQuestionsSection } from "@/components/admin/cc/CcControls";
import type { YouCard, YouPostponedTask } from "@/components/admin/cc/CcControls";
import { Card } from "@/components/admin/fields";
import { Empty, PRIORITY_TONE, RUN_TONE, TaskLine, ago } from "./shared";
import { cn } from "@/lib/format";
import type { WaitingDepEntry } from "@/lib/cc-chains";

type Href = (key: string) => string;

type NeedsYouData = Awaited<ReturnType<typeof needsYou>>;
type OwnerTask = NeedsYouData["owner"][number];

function classifyGroup(reason: string, hasVariants: boolean): YouCard["groupType"] {
  if (hasVariants) return "variant";
  if (/цена|прайс|стоимост|тариф|число|сколько|бюджет|лимит/i.test(reason)) return "price";
  if (/файл|документ|картинк|фото|загрузить|прислать|контент|логотип/i.test(reason)) return "data";
  if (/войти|логин|аккаунт|авторизац|ключ.*сервис|oauth|токен/i.test(reason)) return "auth";
  if (/утвердить|согласовать|одобрить|макет|бренд|дизайн|палитр|шрифт/i.test(reason)) return "approve";
  if (/правило|политика|условия|регламент|настройк|решение|выбор/i.test(reason)) return "rule";
  return "other";
}

/** Группирует задачи с одинаковым вопросом в одну карточку */
function groupOwnerQuestions(tasks: OwnerTask[], taskHref: Href, waitingDeps: WaitingDepEntry[]): YouCard[] {
  const byQuestion = new Map<string, OwnerTask[]>();
  for (const task of tasks) {
    const key = (task.fullReason ?? task.blockedReason ?? "").trim();
    const existing = byQuestion.get(key);
    if (existing) existing.push(task);
    else byQuestion.set(key, [task]);
  }

  return [...byQuestion.values()].map((group) => {
    const reason = group[0].fullReason ?? group[0].blockedReason ?? "";
    const multiQuestion = reason ? parseMultiQuestion(reason) : [{ question: reason, variants: null }];
    const hasVariants = multiQuestion.some((b) => b.variants !== null);
    const origKey = parseDuplicateOriginalKey(reason);
    const groupKeys = new Set(group.map((t) => t.key));
    const unblocksCount = waitingDeps.filter((w) => w.openDeps.some((d) => groupKeys.has(d.key))).length;
    return {
      id: group[0].key,
      question: multiQuestion[0].question,
      groupType: classifyGroup(reason, hasVariants),
      tasks: group.map((t) => ({ key: t.key, title: t.title, href: taskHref(t.key), priority: t.priority })),
      variants: multiQuestion.length === 1 ? (multiQuestion[0].variants ?? null) : null,
      multiQuestion: multiQuestion.length > 1 ? multiQuestion : null,
      isUrgent: group.some((t) => t.priority === "p0"),
      textMayCut: group.some((t) => t.textMayCut),
      origTaskKey: origKey ?? undefined,
      origTaskHref: origKey ? taskHref(origKey) : undefined,
      unblocksCount: unblocksCount > 0 ? unblocksCount : undefined,
    };
  });
}

/** «Нужен ты»: вопросы воркеров с группировкой, фильтрами, полными текстами; и прочие секции */
export async function YouTab({ taskHref }: { taskHref: Href }) {
  const [t, ty, data] = await Promise.all([getTranslations("admin.cc"), getTranslations("admin.cc.you"), needsYou()]);

  const needsAnswer = data.owner.filter((x) => !x.ownerAnswered);
  const ownerAnswered = data.owner.filter((x) => x.ownerAnswered);

  const cards = groupOwnerQuestions(needsAnswer, taskHref, data.waitingDeps);
  const postponed: YouPostponedTask[] = data.ownerPostponed.map((p) => ({
    key: p.key,
    title: p.title,
    href: taskHref(p.key),
    priority: p.priority,
    reason: p.blockedReason,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const nothing =
    cards.length === 0 &&
    postponed.length === 0 &&
    !data.stale.length &&
    !data.stuckReview.length &&
    !data.nocodeReview.length &&
    !data.failedRuns.length &&
    !data.returnedRuns.length &&
    !data.pausedUntil &&
    !data.techBlocked.length &&
    !data.alertMissing &&
    !ownerAnswered.length &&
    !data.waitingDeps.length;

  return (
    <div className="space-y-4">
      {nothing && <Empty>{ty("empty")}</Empty>}

      {data.alertMissing && (
        <Card>
          <p className="text-sm text-bad">
            <span className="font-medium">{ty("alertMissing")}</span>{" "}
            <Link href="/admin/settings" className="font-medium underline">
              {ty("alertMissingLink")}
            </Link>
          </p>
        </Card>
      )}

      {data.pausedUntil && (
        <Card>
          <p className="text-sm text-warn">
            ⛔ {ty("paused", { until: new Date(data.pausedUntil).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}{" "}
            <Link href="/admin/control?tab=workers" className="underline">
              {ty("toWorkers")}
            </Link>
          </p>
        </Card>
      )}

      {/* Интерактивные вопросы: фильтры, группы, карточки */}
      {(cards.length > 0 || postponed.length > 0) && (
        <Card>
          <YouQuestionsSection cards={cards} postponed={postponed} nocodeReviewCount={data.nocodeReview.length} />
        </Card>
      )}

      {/* Ответил, ждёт триажа */}
      {ownerAnswered.length > 0 && (
        <Card title={`✅ ${ty("ownerAnswered")} · ${ownerAnswered.length}`}>
          <ul className="divide-y divide-line">
            {ownerAnswered.map((x) => {
              const last = x.comments[0];
              return (
                <TaskLine
                  key={x.key}
                  k={x.key}
                  title={x.title}
                  priority={x.priority}
                  href={taskHref(x.key)}
                  sub={
                    <>
                      <span className="text-muted">
                        {BLOCKED_ON_LABELS[x.blockedOn ?? ""] ?? x.blockedOn}: {x.blockedReason}
                      </span>
                      {last && (
                        <span className="mt-0.5 line-clamp-2 block text-muted">
                          {last.author}: {last.text}
                        </span>
                      )}
                      <span className="block">{ty("since", { ago: ago(t, x.updatedAt) })}</span>
                    </>
                  }
                  right={<span className="text-xs text-muted">{ty("waitingTriage")}</span>}
                />
              );
            })}
          </ul>
        </Card>
      )}

      {data.waitingDeps.length > 0 && (
        <Card title={`⏳ ${ty("waitingDeps")} · ${data.waitingDeps.length}`}>
          <p className="mb-2 text-xs text-muted">{ty("waitingDepsHint")}</p>
          <ul className="divide-y divide-line">
            {data.waitingDeps.map((w) => {
              const visibleDeps = w.openDeps.slice(0, 3);
              const hiddenCount = w.openDeps.length - visibleDeps.length;
              return (
                <TaskLine
                  key={w.key}
                  k={w.key}
                  title={w.title}
                  href={taskHref(w.key)}
                  sub={
                    <ul className="mt-0.5 space-y-0.5">
                      {visibleDeps.map((d) => (
                        <li key={d.key}>
                          <span className="text-bad">●</span>{" "}
                          <span className="font-mono">{d.key}</span>{" "}
                          {d.title}
                          {" · "}
                          {BLOCKED_ON_LABELS[d.blockedOn ?? ""] ?? d.status}
                        </li>
                      ))}
                      {hiddenCount > 0 && (
                        <li>
                          <Link href={taskHref(w.key)} scroll={false} className="text-brand hover:underline">
                            {ty("waitingDepsMore", { n: hiddenCount })}
                          </Link>
                        </li>
                      )}
                    </ul>
                  }
                />
              );
            })}
          </ul>
        </Card>
      )}

      {data.stale.length > 0 && (
        <Card title={`🪦 ${ty("stale")} · ${data.stale.length}`}>
          <ul className="divide-y divide-line">
            {data.stale.map((x) => (
              <TaskLine
                key={x.key}
                k={x.key}
                title={x.title}
                href={taskHref(x.key)}
                sub={x.health.phantom ? t("health.phantom") : `${x.claimedBy ?? ""} · ${x.health.silentMin != null ? silentLabel(t, x.health.silentMin) : ""}`}
                right={<QuickMove taskKey={x.key} to={x.health.phantom ? "backlog" : "ready"} text={x.health.phantom ? t("attention.phantomReason") : t("attention.returnReason")} label={t("attention.returnToQueue")} />}
              />
            ))}
          </ul>
        </Card>
      )}

      {data.stuckReview.length > 0 && (
        <Card title={`⏳ ${ty("stuckReview")} · ${data.stuckReview.length}`}>
          <ul className="divide-y divide-line">
            {data.stuckReview.map((x) => (
              <TaskLine key={x.key} k={x.key} title={x.title} href={taskHref(x.key)} sub={ty("since", { ago: ago(t, x.updatedAt) })} />
            ))}
          </ul>
        </Card>
      )}

      {data.nocodeReview.length > 0 && (
        <Card title={`✅ ${ty("nocodeReview")} · ${data.nocodeReview.length}`}>
          <p className="mb-2 text-xs text-muted">{ty("nocodeReviewHint")}</p>
          <ul className="divide-y divide-line">
            {data.nocodeReview.map((x) => (
              <li key={x.key} className="flex flex-wrap items-start gap-3 py-3">
                <Link href={taskHref(x.key)} scroll={false} className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted">{x.key}</span>{" "}
                  <span className={cn("chip text-[10px]", PRIORITY_TONE[x.priority])}>{PRIORITIES[x.priority]}</span>
                  <span className="mt-0.5 block font-medium">{x.title}</span>
                  {x.ownerSummary && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs">{x.ownerSummary}</p>}
                  <span className="block text-xs text-muted">
                    {ago(t, x.updatedAt)}
                    {x._count.attachments ? ` · 📎 ${x._count.attachments}` : ""}
                  </span>
                </Link>
                <ApprovalButtons taskKey={x.key} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.returnedRuns.length > 0 && (
        <Card title={`↩ ${ty("returnedRuns")} · ${data.returnedRuns.length}`}>
          <p className="mb-2 text-xs text-muted">{ty("returnedRunsHint")}</p>
          <ul className="divide-y divide-line text-sm">
            {data.returnedRuns.map((r) => (
              <li key={r.id} className="py-2">
                <span className="font-mono text-xs">{r.agent}</span>{" "}
                {r.taskKey && (
                  <Link href={taskHref(r.taskKey)} scroll={false} className="font-mono text-xs text-brand hover:underline">
                    {r.taskKey}
                  </Link>
                )}{" "}
                <span className="text-xs text-muted">{ago(t, r.startedAt)}</span>
                {r.summary && <p className="line-clamp-2 text-xs text-muted">{r.summary}</p>}
              </li>
            ))}
          </ul>
          <Link href="/admin/control?tab=workers" className="mt-2 inline-block text-xs text-brand hover:underline">
            {ty("toWorkers")}
          </Link>
        </Card>
      )}

      {data.failedRuns.length > 0 && (
        <Card title={`✗ ${ty("failedRuns")} · ${data.failedRuns.length}`}>
          <ul className="divide-y divide-line text-sm">
            {data.failedRuns.map((r) => (
              <li key={r.id} className="py-2">
                <span className={cn("chip mr-2 text-[10px]", RUN_TONE[r.status])}>{t(`workers.status.${r.status}` as "workers.status.failed")}</span>
                <span className="font-mono text-xs">{r.agent}</span>{" "}
                {r.taskKey && (
                  <Link href={taskHref(r.taskKey)} scroll={false} className="font-mono text-xs text-brand hover:underline">
                    {r.taskKey}
                  </Link>
                )}{" "}
                <span className="text-xs text-muted">{ago(t, r.startedAt)}</span>
                {r.summary && <p className="line-clamp-2 text-xs text-muted">{r.summary}</p>}
              </li>
            ))}
          </ul>
          <Link href="/admin/control?tab=workers" className="mt-2 inline-block text-xs text-brand hover:underline">
            {ty("toWorkers")}
          </Link>
        </Card>
      )}

      {data.techBlocked.length > 0 && (
        <Card title={`🔧 ${ty("techBlocked")} · ${data.techBlocked.length}`}>
          <p className="mb-2 text-xs text-muted">{ty("techBlockedHint")}</p>
          <ul className="divide-y divide-line">
            {data.techBlocked.map((x) => (
              <TaskLine
                key={x.key}
                k={x.key}
                title={x.title}
                priority={x.priority}
                href={taskHref(x.key)}
                sub={
                  <>
                    <span className="text-muted">
                      {BLOCKED_ON_LABELS[x.blockedOn ?? ""] ?? x.blockedOn}
                      {x.blockedReason ? `: ${x.blockedReason}` : ""}
                    </span>
                    {x.blockedUntil && (
                      <span className="mt-0.5 block text-muted">
                        {ty("techBlockedUntil", { date: new Date(x.blockedUntil).toLocaleDateString("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", year: "numeric" }) })}
                      </span>
                    )}
                    <span className="block">{ty("since", { ago: ago(t, x.updatedAt) })}</span>
                  </>
                }
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
