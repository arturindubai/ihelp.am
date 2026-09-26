import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircle, ShieldCheck, Receipt, CalendarClock } from "lucide-react";
import { getHome } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { contactLink } from "@/lib/contacts";
import { getCurrentUser } from "@/server/auth";
import { tr } from "@/i18n/locales";
import { ServiceCard } from "@/components/ServiceCard";
import { HeroSection } from "@/components/home/HeroSection";
import { PromoCarousel } from "@/components/home/PromoCarousel";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, s, user, t, tc] = await Promise.all([getHome(locale), getSettings(), getCurrentUser(), getTranslations("home"), getTranslations("common")]);
  const wa = contactLink(s.brand, "whatsapp");
  return (
    <div className="container-w pt-4">
      <div className="mx-auto max-w-[560px] md:max-w-none">
        <p className="text-sm text-muted">{tr(s.brand.city, locale)}</p>

        <HeroSection
          heroTitle={t("heroTitle")}
          searchPlaceholder={t("heroSearch")}
          comingSoonLabel={tc("comingSoon")}
          categories={data.categories}
        />

        <PromoCarousel banners={data.banners} />

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
