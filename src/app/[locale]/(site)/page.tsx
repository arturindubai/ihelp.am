import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { getHome } from "@/server/services/catalog";
import { getSettings } from "@/server/settings";
import { contactLink } from "@/lib/contacts";
import { getCurrentUser } from "@/server/auth";
import { tr } from "@/i18n/locales";
import { HeroSection } from "@/components/home/HeroSection";
import { PromoCarousel } from "@/components/home/PromoCarousel";
import { PromoSlot } from "@/components/PromoSlot";
import { PopularServices } from "@/components/home/PopularServices";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Promises } from "@/components/home/Promises";
import { FaqSection } from "@/components/home/FaqSection";
import { ReviewsSection } from "@/components/home/ReviewsSection";
import { StickyOrderButton } from "@/components/home/StickyOrderButton";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, s, t, tc] = await Promise.all([getCurrentUser(), getSettings(), getTranslations("home"), getTranslations("common")]);
  const data = await getHome(locale, user?.id);
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
          slogan={t("slogan")}
        />

        <PromoSlot placement="HERO_HOME" locale={locale} />
        <PromoCarousel banners={data.banners} />

        <PopularServices services={data.services} />

        <div className="md:grid md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4"><HowItWorks /></div>
          <div className="md:col-span-8"><Promises features={data.features} /></div>
        </div>

        <ReviewsSection reviews={data.reviews} />

        <FaqSection faq={data.faq} />

        {wa && (
          <a href={wa.href} target="_blank" className="mt-6 flex items-center gap-3 rounded-2xl bg-cta p-4 text-inverse">
            <MessageCircle size={32} />
            <div className="flex-1">
              <div className="font-semibold">{t("ctaTitle")}</div>
              <div className="text-sm opacity-80">{t("ctaSubtitle")}</div>
            </div>
            <span className="rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink">{t("writeUs")}</span>
          </a>
        )}
        {!user && <div className="h-2" />}
      </div>
      <StickyOrderButton label={t("stickyOrder")} />
    </div>
  );
}
