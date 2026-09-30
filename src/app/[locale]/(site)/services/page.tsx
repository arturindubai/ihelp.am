import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHome } from "@/server/services/catalog";
import { ServiceTileGrid } from "@/components/catalog/ServiceTile";
import { CategoryTileGrid } from "@/components/catalog/CategoryTileGrid";
import { PromoSlot } from "@/components/PromoSlot";

export default async function Services({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, t, tc] = await Promise.all([getHome(locale), getTranslations("nav"), getTranslations("common")]);

  // Собираем все услуги из всех категорий одним плоским потоком без разделов
  const allServiceItems = data.categories.flatMap((cat) =>
    cat.subcategories.flatMap((g) => g.items),
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-4">
      <h1 className="h1">{t("services")}</h1>

      <PromoSlot placement="CATALOG" locale={locale} />

      <div className="mt-4">
        <CategoryTileGrid categories={data.categories} comingSoonLabel={tc("comingSoon")} />
      </div>

      {allServiceItems.length > 0 && (
        <div className="mt-6">
          <ServiceTileGrid
            groups={[{ section: null, items: allServiceItems }]}
            comingSoonLabel={tc("comingSoon")}
          />
        </div>
      )}
    </div>
  );
}
