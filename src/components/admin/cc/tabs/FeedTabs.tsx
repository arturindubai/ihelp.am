import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { activityFeed, doneFeed } from "@/server/services/ccBoard";
import { listEpics } from "@/server/services/epics";
import { autoMarkQuestionMessages, convertOrphanQuestions, listOwnerInbox } from "@/server/services/ccMessages";
import { BLOCKED_ON_LABELS, COMMENT_KIND_LABELS, EPIC_STATUSES, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { Card } from "@/components/admin/fields";
import { MarkAllReadButton, MessageActions } from "@/components/admin/cc/CcControls";
import { Empty, RUN_TONE, ago } from "./shared";
import { cn, dateLabel, timeLabel } from "@/lib/format";

type Href = (key: string) => string;
const REPO = process.env.REPO_URL || "https://github.com/arturindubai/ihelp.am";

/** «Планы»: эпики с прогрессом по задачам — сколько сделано из скольких, статус эпика */
export async function PlansTab() {
  const [tp, epics] = await Promise.all([getTranslations("admin.cc.plans"), listEpics()]);
  if (!epics.length) return <Empty>{tp("empty")}</Empty>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {epics.map((e) => {
        const pct = e.taskTotal ? Math.round((e.taskDone / e.taskTotal) * 100) : 0;
        return (
          <Link key={e.key} href={`/admin/control/epics/${e.key}`} className="card block p-4 hover:border-brand">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{e.title}</div>
              <span className="chip shrink-0 bg-surface text-[10px] text-muted">{EPIC_STATUSES[e.status] ?? e.status}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{e.summary}</p>
            <div className="mt-3 flex items-baseline justify-between text-xs">
              <span>{tp("progress", { done: e.taskDone, total: e.taskTotal })}</span>
              <span className="text-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** «Активность»: кто что взял, сдал, вернул, одобрил и куда ушла задача — одной лентой, как Activity & receipts в LIA */
export async function ActivityTab({ locale, taskHref }: { locale: string; taskHref: Href }) {
  const [t, ta, items] = await Promise.all([getTranslations("admin.cc"), getTranslations("admin.cc.activity"), activityFeed(150)]);
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const value = (field: string | undefined, v: string | null | undefined) => {
    if (!v) return "—";
    if (field === "status") return STATUSES[v] ?? v;
    if (field === "blockedOn") return BLOCKED_ON_LABELS[v] ?? v;
    if (field === "priority") return PRIORITIES[v] ?? v;
    if (field === "stage") return STAGES[v] ?? v;
    return v;
  };
  if (!items.length) return <Empty>{ta("empty")}</Empty>;
  return (
    <Card title={ta("title")}>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex gap-3 py-2 text-sm">
            <span className="w-28 shrink-0 text-xs text-muted">{when(i.at)}</span>
            <div className="min-w-0 flex-1">
              <span className="font-medium">{i.actor === "watchdog" ? t("actors.watchdog") : i.actor}</span>{" "}
              {i.kind === "event" ? (
                <span className="text-muted">
                  {t.has(`fields.${i.field}`) ? t(`fields.${i.field}` as "fields.status") : i.field}: {value(i.field, i.from)} → <b className="text-ink">{value(i.field, i.to)}</b>
                </span>
              ) : i.kind === "run" ? (
                <span className={cn("chip text-[10px]", RUN_TONE[i.to ?? ""] ?? "bg-surface text-muted")}>
                  ▶ {ta("run", { pool: t(`workers.pools.${i.text}` as "workers.pools.dev") })} · {t(`workers.status.${i.to}` as "workers.status.done")}
                </span>
              ) : (
                <span className="chip bg-surface text-[10px] text-muted">{COMMENT_KIND_LABELS[i.kind] ?? i.kind}</span>
              )}{" "}
              {i.key && (
                <Link href={taskHref(i.key)} scroll={false} className="text-brand hover:underline">
                  <span className="font-mono text-xs">{i.key}</span> {i.title}
                </Link>
              )}
              {i.text && i.kind !== "run" && <p className="line-clamp-2 whitespace-pre-line text-xs text-muted">{i.text}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** «Сделано»: закрытое за две недели по дням — с коммитом и тем, что проверено после выкладки */
export async function DoneTab({ locale, taskHref }: { locale: string; taskHref: Href }) {
  const [td, data] = await Promise.all([getTranslations("admin.cc.doneTab"), doneFeed(14)]);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <b>{td("today", { n: data.today })}</b> <span className="text-muted">· {td("hint")}</span>
      </p>
      {data.groups.length === 0 && <Empty>{td("empty")}</Empty>}
      {data.groups.map((g) => (
        <Card key={g.date} title={`${dateLabel(new Date(`${g.date}T12:00:00Z`), locale, { weekday: "long", day: "numeric", month: "long" })} · ${g.items.length}`}>
          <ul className="divide-y divide-line">
            {g.items.map((x) => (
              <li key={x.key} className="flex flex-wrap items-baseline gap-2 py-2 text-sm">
                <Link href={taskHref(x.key)} scroll={false} className="min-w-0 flex-1 hover:underline">
                  <span className="font-mono text-xs text-muted">{x.key}</span> {x.title}
                  {x.proof && <span className="block line-clamp-1 text-xs text-muted">{x.proof}</span>}
                </Link>
                {x.deployedSha ? (
                  <a href={`${REPO}/commit/${x.deployedSha}`} target="_blank" rel="noreferrer" className="chip bg-surface font-mono text-[10px] text-brand">
                    {x.deployedSha.slice(0, 8)}
                  </a>
                ) : (
                  <span className="chip bg-surface text-[10px] text-muted">{td("noCode")}</span>
                )}
                <span className="text-xs text-muted">{timeLabel(x.doneAt!)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/**
 * «Сообщения» — только уведомления владельцу (что выложено, что принято, что изменилось).
 * Вопросы воркеров (сообщения, у которых задача заблокирована на владельце) на эту вкладку не попадают —
 * они уже видны в «Нужен ты». Форма «Написать воркерам» и «Отправленные» перенесены на вкладку «Воркеры».
 */
export async function NotifyTab({ locale, taskHref }: { locale: string; taskHref: Href }) {
  // Шаг 1: сообщения с taskKey, где задача уже заблокирована на owner/product → прочитано со ссылкой
  await autoMarkQuestionMessages("system");
  // Шаг 2: сообщения-вопросы (содержат «?») без карточки → задача блокируется на owner (только backlog/ready)
  await convertOrphanQuestions("system");

  const [tn, ownerMsgs] = await Promise.all([getTranslations("admin.cc.notify"), listOwnerInbox(100)]);
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;

  // Показываем только уведомления владельцу (не вопросы)
  const inbox = ownerMsgs.filter((m) => !m.isQuestion);
  const unreadCount = inbox.filter((m) => !m.readAt).length;
  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span>{tn("inbox")}</span>
            {unreadCount > 0 && <span className="chip bg-brand text-[10px] text-on-action">{unreadCount}</span>}
          </span>
        }
        actions={<MarkAllReadButton unreadCount={unreadCount} />}
      >
        {inbox.length === 0 && <p className="text-sm text-muted">{tn("inboxEmpty")}</p>}
        <ul className={cn("divide-y divide-line", inbox.length > 80 && "overflow-y-auto max-h-[600px]")}>
          {inbox.map((m) => (
            <li key={m.id} className={cn("py-3 text-sm", !m.readAt && "-mx-4 bg-brand-50/40 px-4")}>
              <div className="text-xs text-muted">
                {!m.readAt && <span className="mr-1 inline-block size-2 rounded-full bg-brand" />}
                <b className="text-ink">{m.fromAgent}</b> · {when(m.createdAt)}
                {m.taskKey && (
                  <>
                    {" · "}
                    <Link href={taskHref(m.taskKey)} scroll={false} className="font-mono text-brand hover:underline">
                      {m.taskKey}
                    </Link>
                  </>
                )}
                {m.readAt && ` · ${tn("readBy", { who: m.readBy ?? "" })}`}
              </div>
              <p className="mt-1 line-clamp-4 whitespace-pre-line">{m.text}</p>
              <MessageActions id={m.id} unread={!m.readAt} replyTo={null} notifyOnly />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
