import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { workersOverview } from "@/server/services/workers";
import { POOLS } from "@/lib/workers";
import { PageHead, Forbidden, Stat } from "@/components/admin/ui";
import { Card } from "@/components/admin/fields";
import { WorkersForm } from "@/components/admin/cc/WorkersForm";
import { cn, dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  running: "bg-brand-50 text-brand",
  done: "bg-ok-50 text-ok",
  failed: "bg-bad-50 text-bad",
  timeout: "bg-bad-50 text-bad",
  limit: "bg-warn-50 text-warn",
  stopped: "bg-surface text-muted",
};

/** Воркеры: настройки пулов, что работает сейчас, сколько запусков сегодня и журнал запусков */
export default async function WorkersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const [t, data] = await Promise.all([getTranslations("admin.cc"), workersOverview()]);
  const when = (d: Date) => `${dateLabel(d, locale, { day: "numeric", month: "short" })}, ${timeLabel(d)}`;
  const minutes = (a: Date, b: Date | null) => Math.max(1, Math.round(((b ?? new Date()).getTime() - a.getTime()) / 60_000));

  return (
    <div className="max-w-5xl">
      <PageHead
        title={
          <span className="flex items-center gap-2">
            <Link href="/admin/control" className="btn-ghost btn-sm px-2" aria-label={t("back")}>
              <ArrowLeft size={18} />
            </Link>
            {t("workers.title")}
          </span>
        }
        sub={t("workers.subtitle")}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label={t("workers.runningNow")} value={data.running} tone={data.running ? "ok" : undefined} />
        <Stat label={t("workers.readyDev")} value={data.readyDev} hint={t("workers.readyDevHint")} />
        <Stat label={t("workers.reviewQueue")} value={data.reviewTotal} hint={t("workers.reviewQueueHint", { n: data.reviewTested })} />
        <Stat label={t("workers.today")} value={POOLS.map((p) => data.today[p]).join(" · ")} hint={POOLS.map((p) => t(`workers.pools.${p}`)).join(" · ")} />
      </div>

      <Card title={t("workers.settings")} className="mb-4">
        <WorkersForm initial={data.config} />
      </Card>

      <Card title={t("workers.runs")}>
        {data.runs.length === 0 && <p className="text-sm text-muted">{t("workers.noRuns")}</p>}
        <ul className="divide-y divide-line">
          {data.runs.map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("chip text-[10px]", STATUS_TONE[r.status] ?? "bg-surface text-muted")}>{t(`workers.status.${r.status}` as "workers.status.done")}</span>
                <span className="font-mono text-xs">{r.agent}</span>
                {r.taskKey && (
                  <Link href={`/admin/control?task=${r.taskKey}`} className="font-mono text-xs text-brand hover:underline">
                    {r.taskKey}
                  </Link>
                )}
                <span className="text-xs text-muted">
                  {when(r.startedAt)} · {t("workers.minutes", { m: minutes(r.startedAt, r.finishedAt) })} · {r.model}
                  {r.turns ? ` · ${t("workers.turns", { n: r.turns })}` : ""}
                </span>
              </div>
              {r.summary && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted">{r.summary}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-4 text-xs text-muted">{t("workers.footer")}</p>
    </div>
  );
}
