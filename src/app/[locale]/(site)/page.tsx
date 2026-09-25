import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircle, ShieldCheck, Receipt, CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getHome } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { contactLink } from "@/lib/contacts";
import { getCurrentUser } from "@/server/auth";
import { tr } from "@/i18n/locales";
import { ServiceCard } from "@/components/ServiceCard";
import { Img } from "@/components/Img";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, s, user, t, tc] = await Promise.all([getHome(locale), getSettings(), getCurrentUser(), getTranslations("home"), getTranslations("common")]);
  const wa = contactLink(s.brand, "whatsapp");
  return (
    <div className="container-w pt-4">
      <div className="mx-auto max-w-[560px] md:max-w-none">
        <p className="text-sm text-muted">{tr(s.brand.city, locale)}</p>
        <h1 className="h1 mt-0.5">{t("title")}</h1>

        {data.banners.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4">
            {data.banners.map((b) => {
              const inner = (
                <div className="relative flex h-40 w-[86vw] max-w-[440px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-4 text-inverse" style={{ background: b.bg || "var(--color-ink)" }}>
                  {b.image && <Img src={b.image} fill sizes="(max-width: 512px) 86vw, 440px" className="object-cover opacity-60" />}
                  <div className="relative">
                    <div className="text-2xl leading-tight font-bold">{b.title}</div>
                    {b.subtitle && <div className="mt-1 text-sm opacity-85">{b.subtitle}</div>}
                    {b.promoCode && <span className="mt-2 inline-block rounded-md bg-paper px-2 py-0.5 text-xs font-bold text-ink">{b.promoCode}</span>}
                  </div>
                </div>
              );
              return b.link ? <Link key={b.id} href={b.link}>{inner}</Link> : <div key={b.id}>{inner}</div>;
            })}
          </div>
        )}

        <section className="mt-6">
          <h2 className="h2 mb-3">{t("categories")}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {data.categories.map((c) => {
              const tile = (
                <div className={`flex flex-col items-center gap-1.5 text-center ${c.comingSoon ? "opacity-60" : ""}`}>
                  <div className="relative">
                    <Img src={c.image || "/img/cat-cleaning.svg"} width={76} className="size-[76px] rounded-2xl" />
                    {c.comingSoon && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-inverse">{tc("comingSoon")}</span>}
                  </div>
                  <span className="text-[13px] leading-tight font-medium">{c.title}</span>
                </div>
              );
              return c.href ? <Link key={c.slug} href={c.href}>{tile}</Link> : <div key={c.slug}>{tile}</div>;
            })}
          </div>
        </section>

        {data.services.length > 0 && (
          <section className="mt-8">
            <h2 className="h2">{t("popular")}</h2>
            <div className="divide-y divide-line">
              {data.services.map((sv) => (
                <ServiceCard key={sv.slug} s={sv} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-surface p-4">
          <h2 className="h2 mb-3">{t("howTitle")}</h2>
          <ol className="space-y-3">
            {[t("how1"), t("how2"), t("how3")].map((x, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-inverse">{i + 1}</span>
                <span className="pt-0.5">{x}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-6">
          <h2 className="h2 mb-3">{t("whyTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              [ShieldCheck, t("why1")],
              [Receipt, t("why2")],
              [CalendarClock, t("why3")],
            ].map(([I, text], i) => {
              const Ico = I as typeof ShieldCheck;
              return (
                <div key={i} className="card flex items-center gap-3 p-3">
                  <Ico className="shrink-0 text-brand" size={22} />
                  <span className="text-sm">{text as string}</span>
                </div>
              );
            })}
          </div>
        </section>

        {wa && (
          <a href={wa.href} target="_blank" className="mt-6 flex items-center gap-3 rounded-2xl bg-cta p-4 text-inverse">
            <MessageCircle size={32} />
            <div className="flex-1">
              <div className="font-semibold">{t("whatsapp")}</div>
              <div className="text-sm opacity-80">{t("whatsappSub")}</div>
            </div>
            <span className="rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink">{t("writeUs")}</span>
          </a>
        )}
        {!user && <div className="h-2" />}
      </div>
    </div>
  );
}
