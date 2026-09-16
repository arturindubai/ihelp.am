import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { BannerManager } from "@/components/admin/ContentManagers";

export default async function AdminBanners() {
  if (!(await pageUser("banners"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const banners = await db.banner.findMany({ orderBy: { sort: "asc" } });
  return (
    <div className="max-w-3xl">
      <PageHead title={t("banners.title")} />
      <BannerManager banners={banners.map((b) => ({ id: b.id, data: { title: b.title as Record<string, string>, subtitle: b.subtitle as Record<string, string>, image: b.image, link: b.link, promoCode: b.promoCode, bg: b.bg, active: b.active, sort: b.sort } }))} />
    </div>
  );
}
