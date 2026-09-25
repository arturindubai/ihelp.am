import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { releaseNotes } from "@/server/services/ccBoard";
import { Forbidden } from "@/components/admin/ui";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const REPO = process.env.REPO_URL || "https://github.com/arturindubai/ihelp.am";

/** Первое предложение описания — «что изменилось» простыми словами */
const firstSentence = (s: string) => {
  const m = /^(.{20,280}?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1] : s.trim().slice(0, 280);
};

/** Релизы, как Release Notes в LIA: что выложено — по неделям, новое сверху, у каждого изменения коммит и задача */
export default async function ReleasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const [t, weeks] = await Promise.all([getTranslations("admin.cc.releases"), releaseNotes(12)]);
  const range = (start: Date) => {
    const end = new Date(start.getTime() + 6 * 24 * 3600_000);
    return `${dateLabel(start, locale, { day: "numeric", month: "short" })} — ${dateLabel(end, locale, { day: "numeric", month: "short" })}`;
  };

  return (
    <div className="max-w-4xl">
      <CcHeader page="releases" locale={locale} />
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>
      {weeks.length === 0 && <p className="card py-10 text-center text-muted">{t("empty")}</p>}
      <div className="space-y-6">
        {weeks.map((w) => (
          <section key={w.start.toISOString()}>
            <h2 className="mb-2 font-semibold">
              {range(w.start)} <span className="text-sm font-normal text-muted">· {t("changes", { n: w.items.length })}</span>
            </h2>
            <ul className="space-y-2">
              {w.items.map((x) => (
                <li key={x.key} className="card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{x.title}</div>
                      <p className="mt-0.5 text-sm text-muted">{firstSentence(x.summary)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{dateLabel(x.doneAt!, locale, { day: "numeric", month: "short" })}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Link href={`/admin/control?task=${x.key}`} className="font-mono text-brand hover:underline">
                      {x.key}
                    </Link>
                    {x.epicRef && <span className="text-muted">{x.epicRef.title}</span>}
                    {x.deployedSha ? (
                      <a href={`${REPO}/commit/${x.deployedSha}`} target="_blank" rel="noreferrer" className="chip bg-surface font-mono text-[10px] text-brand">
                        {x.deployedSha.slice(0, 8)}
                      </a>
                    ) : (
                      <span className="chip bg-surface text-[10px] text-muted">{t("noCode")}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
