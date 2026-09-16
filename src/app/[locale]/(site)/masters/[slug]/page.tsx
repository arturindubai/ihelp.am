import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { tr } from "@/i18n/locales";
import { dateLabel } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { StarRow } from "@/components/Stars";

export default async function MasterPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const m = await db.master.findFirst({
    where: { slug, active: true },
    include: { skills: { where: { active: true } }, reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 30, include: { service: true } } },
  });
  if (!m) notFound();
  const [t, tc] = await Promise.all([getTranslations("master"), getTranslations("common")]);
  const langs = m.languages.map((l) => (tc.has(`langNames.${l}`) ? tc(`langNames.${l}`) : l)).join(", ");
  return (
    <div className="container-m pt-6">
      <div className="flex items-center gap-4">
        <img src={m.photo || "/img/master-1.svg"} alt="" className="size-24 rounded-full object-cover" />
        <div>
          <h1 className="h1">{tr(m.name, locale)}</h1>
          {m.reviewsCount ? (
            <div className="mt-1 flex items-center gap-2"><StarRow value={m.rating} /><span className="font-semibold">{m.rating.toFixed(1)}</span><span className="text-sm text-muted">{tc("reviews", { count: m.reviewsCount })}</span></div>
          ) : <span className="chip mt-1">{t("newMaster")}</span>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface p-3"><div className="text-lg font-bold">{m.rating ? m.rating.toFixed(1) : "—"}</div><div className="text-xs text-muted">{t("rating")}</div></div>
        <div className="rounded-xl bg-surface p-3"><div className="text-lg font-bold">{m.jobsCount}</div><div className="text-xs text-muted">{tc("jobs", { count: m.jobsCount }).replace(/^\d+\s/, "")}</div></div>
        <div className="rounded-xl bg-surface p-3"><div className="text-lg font-bold">{m.experienceYears}</div><div className="text-xs text-muted">{tc("yearsExp", { count: m.experienceYears }).replace(/^\d+\s/, "")}</div></div>
      </div>
      {tr(m.bio, locale) && (
        <section className="mt-6"><h2 className="h2 mb-2">{t("about")}</h2><p className="whitespace-pre-line text-muted">{tr(m.bio, locale)}</p></section>
      )}
      {langs && <p className="mt-3 text-sm"><span className="text-muted">{tc("languages")}:</span> {langs}</p>}
      {m.skills.length > 0 && (
        <section className="mt-6"><h2 className="h2 mb-2">{t("services")}</h2>
          <div className="flex flex-wrap gap-2">{m.skills.map((s) => <Link key={s.id} href={`/s/${s.slug}`} className="chip py-1.5">{tr(s.title, locale)}</Link>)}</div>
        </section>
      )}
      <section className="mt-6">
        <h2 className="h2 mb-2">{t("reviews")}</h2>
        {m.reviews.length === 0 ? <p className="text-sm text-muted">—</p> : (
          <ul className="divide-y divide-line">
            {m.reviews.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between"><span className="font-semibold">{r.authorName || "—"}</span><StarRow value={r.rating} size={14} /></div>
                <div className="text-xs text-muted">{dateLabel(r.createdAt, locale, { day: "numeric", month: "short", year: "numeric" })}{r.service && ` · ${tr(r.service.title, locale)}`}</div>
                {r.text && <p className="mt-1 text-sm">{r.text}</p>}
                {r.reply && <p className="mt-2 rounded-lg bg-surface p-2 text-sm text-muted">{r.reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
