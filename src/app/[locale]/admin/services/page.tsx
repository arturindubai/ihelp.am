import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { Forbidden } from "@/components/admin/ui";
import { CatalogList } from "@/components/admin/CatalogList";
import { getAdminCatalog } from "@/server/services/adminCatalog";

export default async function AdminServices({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("services"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const categories = await getAdminCatalog(locale);
  return (
    <div>
      <CatalogList categories={categories} pageTitle={t("services.catalogTitle")} />
    </div>
  );
}
