import { pageUser } from "@/server/adminPage";
import { getAdminBanners, getAdminAiStatus } from "@/server/services/pages/admin";
import { Forbidden } from "@/components/admin/ui";
import { BannerManager } from "@/components/admin/BannerManager";

export default async function AdminBanners() {
  if (!(await pageUser("banners"))) return <Forbidden />;
  const [banners, aiStatus] = await Promise.all([getAdminBanners(), getAdminAiStatus()]);
  return (
    <div className="max-w-3xl">
      <BannerManager
        aiStatus={aiStatus}
        banners={banners.map((b) => ({
          id: b.id,
          data: {
            title: b.title as Record<string, string>,
            subtitle: b.subtitle as Record<string, string> | null,
            image: b.image,
            link: b.link,
            promoCode: b.promoCode,
            bg: b.bg,
            active: b.active,
            sort: b.sort,
            placement: b.placement as "CAROUSEL_HOME" | "HERO_HOME" | "CATALOG" | "SERVICE" | "CHECKOUT" | "SUCCESS" | "EMAIL" | "MASTER_CABINET",
            bannerType: b.bannerType as "PROMO" | "ANNOUNCEMENT" | "UPSELL" | "CROSS_SELL",
            startsAt: b.startsAt ? b.startsAt.toISOString() : null,
            endsAt: b.endsAt ? b.endsAt.toISOString() : null,
            audience: b.audience as "ALL" | "LOGGED_IN" | "GUESTS",
            segment: b.segment as "ALL" | "NEW" | "RETURNING",
            views: b.views,
            clicks: b.clicks,
          },
        }))}
      />
    </div>
  );
}
