import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMastersForService, getServiceReviews, loadServiceRaw, localizeService } from "@/server/services/catalog";
import { isFirstOrder } from "@/server/services/booking";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { amd, dateLabel } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Rating, StarRow } from "@/components/Stars";
import { ServiceConfigurator } from "@/components/service/ServiceConfigurator";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const raw = await loadServiceRaw(slug);
  if (!raw) return {};
  return { title: tr(raw.title, locale), description: tr(raw.subtitle, locale) || tr(raw.description, locale) };
}

export default async function ServicePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const raw = await loadServiceRaw(slug);
  if (!raw) notFound();
  const s = localizeService(raw, locale);
  const [user, settings, reviews, masters, t, tc] = await Promise.all([getCurrentUser(), getSettings(), getServiceReviews(raw.id), getMastersForService(raw.id), getTranslations("service"), getTranslations("common")]);
  const first = await isFirstOrder(user?.id);
  const minPrice = Math.min(...s.groups.filter((g) => g.isDuration).flatMap((g) => g.options.map((o) => o.price)), Infinity);

  return (
    <div className="container-m">
      <div className="relative -mx-4">
        {s.bannerImage ? <img src={s.bannerImage} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="h-14" />}
        <Link href={`/`} className="absolute top-3 left-3 grid size-9 place-items-center rounded-full bg-white shadow" aria-label="back">
          <ArrowLeft size={18} />
        </Link>
      </div>
      <h1 className="h1 mt-4">{s.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Rating value={s.rating} count={s.reviewsCount} label={tc("reviews", { count: s.reviewsCount })} />
      </div>
      {Number.isFinite(minPrice) && <p className="mt-1 text-sm font-medium">{t("startsAt", { price: amd(minPrice) })}</p>}
      {s.description && <p className="mt-2 text-[15px] text-muted">{s.description}</p>}

      <ServiceConfigurator s={s} rules={settings.pricing} isFirstOrder={first} />

      {s.note?.body && (
        <div className="mt-2 rounded-2xl bg-ok-50 p-4">
          <div className="font-semibold">{s.note.title}</div>
          <p className="mt-1 text-sm text-ink/80">{s.note.body}</p>
        </div>
      )}

      {s.benefits.length > 0 && (
        <section className="mt-8">
          <h2 className="h2 mb-3">{t("benefits")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {s.benefits.map((b, i) => (
              <div key={i} className="rounded-xl bg-surface p-3">
                <Icon name={b.icon} size={22} className="text-brand" />
                <div className="mt-2 text-sm leading-snug font-medium">{b.title}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {s.howItWorks.length > 0 && (
        <section className="mt-8">
          <h2 className="h2 mb-3">{t("how")}</h2>
          <ol className="space-y-4">
            {s.howItWorks.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <div className="font-medium">{h.title}</div>
                  {h.body && <div className="text-sm text-muted">{h.body}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {masters.length > 0 && (
        <section className="mt-8">
          <h2 className="h2 mb-3">{t("masters")}</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {masters.map((m) => (
              <Link key={m.id} href={`/masters/${m.slug}`} className="card w-36 shrink-0 p-3 text-center">
                <img src={m.photo || "/img/master-1.svg"} alt="" className="mx-auto size-16 rounded-full object-cover" />
                <div className="mt-2 font-semibold">{tr(m.name, locale)}</div>
                <div className="text-xs text-muted">{m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new")}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="h2 mb-2">{t("reviews")}</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">{t("noReviews")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.authorName || "—"}</span>
                  <StarRow value={r.rating} size={14} />
                </div>
                <div className="text-xs text-muted">
                  {dateLabel(r.createdAt, locale, { day: "numeric", month: "short", year: "numeric" })}
                  {r.master && ` · ${tr(r.master.name, locale)}`}
                </div>
                {r.text && <p className="mt-1 text-sm">{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.faq.length > 0 && (
        <section className="mt-8">
          <h2 className="h2 mb-2">{t("faq")}</h2>
          <div className="divide-y divide-line">
            {s.faq.map((f, i) => (
              <details key={i} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                  {f.q}
                  <ChevronDown size={18} className="shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {s.policy && (
        <section className="mt-8">
          <h2 className="h2 mb-2">{t("policy")}</h2>
          <p className="text-sm whitespace-pre-line text-muted">{s.policy}</p>
        </section>
      )}
    </div>
  );
}
