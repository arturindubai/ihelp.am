import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ChevronDown, Check, CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMastersForService, getServiceReviews, loadServiceRaw, localizeService } from "@/server/services/catalog";
import { isFirstOrder } from "@/server/services/booking";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";
import { amd, dateLabel } from "@/lib/format";
import { RATING_THRESHOLD } from "@/lib/constants";
import { Icon } from "@/components/Icon";
import { Rating, StarRow } from "@/components/Stars";
import { ServiceConfigurator } from "@/components/service/ServiceConfigurator";
import { Img } from "@/components/Img";
import { PromoSlot } from "@/components/PromoSlot";
import { NotifyForm } from "@/components/catalog/NotifyForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const raw = await loadServiceRaw(slug);
  if (!raw) return {};
  const meta: Record<string, unknown> = {
    title: tr(raw.title, locale),
    description: tr(raw.subtitle, locale) || tr(raw.description, locale),
    alternates: { canonical: `/${locale}/s/${slug}` },
  };
  if (raw.comingSoon) meta.robots = { index: false, follow: false };
  return meta;
}

export default async function ServicePage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { locale, slug } = await params;
  const { plan } = await searchParams;
  setRequestLocale(locale);
  const raw = await loadServiceRaw(slug);
  if (!raw) notFound();
  const s = localizeService(raw, locale);
  const [user, settings, reviews, masters, t, tc] = await Promise.all([getCurrentUser(), getSettings(), getServiceReviews(raw.id), getMastersForService(raw.id), getTranslations("service"), getTranslations("common")]);
  const first = await isFirstOrder(user?.id);
  const minPrice = Math.min(...s.groups.filter((g) => g.isDuration).flatMap((g) => g.options.map((o) => o.price)), Infinity);

  if (raw.comingSoon) {
    const tcat = await getTranslations("catalog");
    const notifyStrings = {
      notifyTitle: tcat("notifyTitle"),
      notifySubtitle: tcat("notifySubtitle"),
      notifyPlaceholder: tcat("notifyPlaceholder"),
      notifyHint: tcat("notifyHint"),
      notifyButton: tcat("notifyButton"),
      notifySuccess: tcat("notifySuccess"),
      notifyAlready: tcat("notifyAlready"),
      notifyInvalid: tcat("notifyInvalid"),
      notifyTooMany: tcat("notifyTooMany"),
    };
    return (
      <div className="container-m">
        <div className="relative -mx-4">
          {s.bannerImage ? <div className="relative aspect-[16/9] w-full"><Img src={s.bannerImage} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" /></div> : <div className="h-14" />}
          <Link href="/" className="absolute top-3 left-3 grid size-9 place-items-center rounded-full bg-paper shadow" aria-label="back">
            <ArrowLeft size={18} />
          </Link>
        </div>

        <h1 className="h1 mt-3">{s.title}</h1>
        {s.description && <p className="mt-2 text-[15px] text-muted">{s.description}</p>}

        <div className="mt-10 pb-16">
          <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
            <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
              <CalendarClock size={64} className="opacity-35 text-brand" />
              <h2 className="text-xl font-semibold">{tcat("comingSoonTitle")}</h2>
              <p className="text-sm text-muted">{tcat("comingSoonText")}</p>
            </div>
            <div className="md:mt-0">
              <NotifyForm serviceSlug={s.slug} t={notifyStrings} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-m">
      <div className="relative -mx-4">
        {s.bannerImage ? <div className="relative aspect-[16/9] w-full"><Img src={s.bannerImage} fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" /></div> : <div className="h-14" />}
        <Link href={`/`} className="absolute top-3 left-3 grid size-9 place-items-center rounded-full bg-paper shadow" aria-label="back">
          <ArrowLeft size={18} />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="chip"><Check size={13} />{t("guarantee1")}</span>
        <span className="chip"><Check size={13} />{t("guarantee2")}</span>
        <span className="chip"><Check size={13} />{t("guarantee3")}</span>
      </div>

      <h1 className="h1 mt-3">{s.title}</h1>
      {s.reviewsCount >= RATING_THRESHOLD && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Rating value={s.rating} count={s.reviewsCount} label={tc("reviews", { count: s.reviewsCount })} />
        </div>
      )}
      {Number.isFinite(minPrice) && <p className="mt-1 text-sm font-medium">{t("startsAt", { price: amd(minPrice) })}</p>}
      {s.description && <p className="mt-2 text-[15px] text-muted">{s.description}</p>}

      <PromoSlot placement="SERVICE" locale={locale} />

      {(s.includesItems.length > 0 || s.excludesItems.length > 0) && (
        <section className="mt-4 card overflow-hidden">
          <div className="flex divide-x divide-line">
            {s.includesItems.length > 0 && (
              <div className={`p-4 bg-ok-50 ${s.excludesItems.length > 0 ? "flex-1" : "w-full"}`}>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ok">{t("includes")}</div>
                <ul className="space-y-1.5">
                  {s.includesItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 size-4 shrink-0 rounded-full bg-ok" />
                      <span className="text-[13px] leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.excludesItems.length > 0 && (
              <div className={`p-4 bg-bad-50 ${s.includesItems.length > 0 ? "flex-1" : "w-full"}`}>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-bad">{t("excludes")}</div>
                <ul className="space-y-1.5">
                  {s.excludesItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 size-4 shrink-0 rounded-full bg-bad" />
                      <span className="text-[13px] leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <ServiceConfigurator s={s} rules={settings.pricing} isFirstOrder={first} policy={s.policy ?? undefined} initialPlan={plan} />

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
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-inverse">{i + 1}</span>
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
                <Img src={m.photo || "/img/master-1.svg"} width={64} className="mx-auto size-16 rounded-full object-cover" />
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

    </div>
  );
}
