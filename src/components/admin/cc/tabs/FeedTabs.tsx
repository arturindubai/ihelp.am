import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { activityFeed, doneFeed } from "@/server/services/ccBoard";
import { listEpics } from "@/server/services/epics";
import { listMessages, MESSAGE_ROLES } from "@/server/services/ccMessages";
import { roleOf } from "@/lib/cc-flow";
import { BLOCKED_ON_LABELS, COMMENT_KIND_LABELS, EPIC_STATUSES, PRIORITIES, STAGES, STATUSES } from "@/lib/backlog-labels";
import { Card } from "@/components/admin/fields";
import { MessageActions, MessageComposer } from "@/components/admin/cc/CcControls";
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

/** «Сообщения», как Notify в LIA: написать роли или всем воркерам; входящие владельцу — прочитано, в бэклог, ответить */
export async function NotifyTab({ locale, taskHref }: { locale: string; taskHref: Href }) {
  const [tn, messages] = await Promise.all([getTranslations("admin.cc.notify"), listMessages(80)]);
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const inbox = messages.filter((m) => m.toRole === "owner");
  const outbox = messages.filter((m) => m.toRole !== "owner");
  // Ответ уходит роли отправителя: dev-2 → разработчикам, triage → триажу; человеку из админки ответить нечем
  const replyRole = (from: string) => {
    const r = roleOf(from);
    return (MESSAGE_ROLES as readonly string[]).includes(r) && r !== "owner" && /^[a-z]/.test(from) ? r : null;
  };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card title={`${tn("inbox")} · ${inbox.filter((m) => !m.readAt).length}`}>
          {inbox.length === 0 && <p className="text-sm text-muted">{tn("inboxEmpty")}</p>}
          <ul className="divide-y divide-line">
            {inbox.map((m) => (
              <li key={m.id} className={cn("py-3 text-sm", !m.readAt && "bg-brand-50/40 -mx-4 px-4")}>
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
                <p className="mt-1 whitespace-pre-line">{m.text}</p>
                <MessageActions id={m.id} unread={!m.readAt} replyTo={replyRole(m.fromAgent)} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <Card title={tn("compose")}>
          <MessageComposer roles={MESSAGE_ROLES.filter((r) => r !== "owner")} />
        </Card>
        <Card title={tn("outbox")}>
          {outbox.length === 0 && <p className="text-sm text-muted">{tn("outboxEmpty")}</p>}
          <ul className="divide-y divide-line">
            {outbox.slice(0, 30).map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <div className="text-xs text-muted">
                  {m.fromAgent} → <b className="text-ink">{tn(`roles.${m.toRole}` as "roles.owner")}</b> · {when(m.createdAt)} · {m.readAt ? tn("readBy", { who: m.readBy ?? "" }) : tn("unread")}
                </div>
                <p className="line-clamp-3 whitespace-pre-line">{m.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
