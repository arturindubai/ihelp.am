import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { logTail } from "@/server/logbuffer";
import { Forbidden } from "@/components/admin/ui";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { cn, dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEVELS = ["error", "warn", "all"] as const;
const TONE: Record<string, string> = { error: "text-bad", warn: "text-warn", info: "text-muted" };

/** Логи, как Logs в LIA: последние ошибки и предупреждения приложения — чтобы ловить сбои без SSH */
export default async function LogsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ level?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const sp = await searchParams;
  const level = (LEVELS as readonly string[]).includes(sp.level ?? "") ? (sp.level as (typeof LEVELS)[number]) : "error";
  const [tl, tail] = await Promise.all([getTranslations("admin.cc.logs"), Promise.resolve(logTail(level))]);
  const lines = tail.lines.slice(0, 300);

  return (
    <div className="max-w-6xl">
      <CcHeader page="logs" locale={locale} />
      <p className="mb-3 text-sm text-muted">{tl("subtitle")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {LEVELS.map((l) => (
          <Link key={l} href={`/admin/control/logs${l === "error" ? "" : `?level=${l}`}`} className={cn("btn-sm", level === l ? "btn-primary" : "btn-outline")}>
            {tl(`levels.${l}`)}
          </Link>
        ))}
        {lines.length === 0 && level === "error" && <span className="text-sm text-ok">{tl("noErrors")} ✓</span>}
      </div>
      <div className="card overflow-hidden">
        {lines.length === 0 && <p className="py-10 text-center text-sm text-muted">{level === "error" ? tl("noErrors") : tl("empty")}</p>}
        <ul className="divide-y divide-line font-mono text-xs">
          {lines.map((l, i) => (
            <li key={`${l.at}-${i}`} className="flex gap-3 px-3 py-1.5">
              <span className="w-28 shrink-0 text-muted">
                {dateLabel(new Date(l.at), locale, { day: "numeric", month: "short" })} {timeLabel(new Date(l.at))}
              </span>
              <span className={cn("w-12 shrink-0 uppercase", TONE[l.level])}>{l.level}</span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words">{l.text}</pre>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted">{tl("footer", { since: `${dateLabel(new Date(tail.since), locale, { day: "numeric", month: "short" })} ${timeLabel(new Date(tail.since))}` })}</p>
    </div>
  );
}
