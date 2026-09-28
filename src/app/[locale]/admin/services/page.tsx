import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getAdminServices } from "@/server/services/pages/admin";
import { tr } from "@/i18n/locales";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { CatalogList } from "@/components/admin/CatalogList";

export default async function AdminServices({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("services"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const cats = await getAdminServices();
  return (
    <div className="max-w-4xl">
      <PageHead title={t("services.title")} />
      <CatalogList
        categories={cats.map((c) => ({
          id: c.id, slug: c.slug, title: c.title as Record<string, string>, description: (c.description as Record<string, string>) || null, image: c.image, sort: c.sort, active: c.active, comingSoon: c.comingSoon,
          services: c.services.map((s) => ({ id: s.id, slug: s.slug, title: tr(s.title, locale), image: s.image, active: s.active, orders: s._count.orders, rating: s.rating, reviews: s.reviewsCount })),
        }))}
      />
    </div>
  );
}
