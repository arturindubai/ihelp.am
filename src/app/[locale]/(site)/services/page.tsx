import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHome } from "@/server/services/catalog";
import { getCurrentUser } from "@/server/auth";
import { ServiceCard } from "@/components/ServiceCard";
import { CategoryTileGrid } from "@/components/catalog/CategoryTileGrid";
import { PromoSlot } from "@/components/PromoSlot";

export default async function Services({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [user, data, t, tc] = await Promise.all([getCurrentUser(), getHome(locale), getTranslations("nav"), getTranslations("common")]);
  const autoMode = !!(user && (user.phone || (user.email && user.emailVerifiedAt)));

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4">
      <h1 className="h1">{t("services")}</h1>

      <PromoSlot placement="CATALOG" locale={locale} />

      <div className="mt-4">
        <CategoryTileGrid categories={data.categories} comingSoonLabel={tc("comingSoon")} autoMode={autoMode} />
      </div>

      {data.services.length > 0 && (
        <div className="mt-6 space-y-3">
          {data.services.map((s) => (
            <ServiceCard key={s.slug} s={s} showAddButton />
          ))}
        </div>
      )}
    </div>
  );
}
