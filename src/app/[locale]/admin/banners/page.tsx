import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { getSettings } from "@/server/settings";
import { Forbidden } from "@/components/admin/ui";
import { BannerManager } from "@/components/admin/BannerManager";

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AdminBanners() {
  if (!(await pageUser("banners"))) return <Forbidden />;
  const [banners, settings, usageRow] = await Promise.all([
    db.banner.findMany({ orderBy: { sort: "asc" } }),
    getSettings(),
    db.setting.findUnique({ where: { key: "_aiUsage" } }),
  ]);
  const month = monthKey();
  const usageData = (usageRow?.value as Record<string, { text: number; image: number }>) ?? {};
  const usageMonth = usageData[month] ?? { text: 0, image: 0 };
  const aiStatus = {
    hasAnthropicKey: !!settings.ai?.anthropicKey,
    hasHiggsfieldKey: !!settings.ai?.higgsfieldKey,
    usageCount: usageMonth.text + usageMonth.image,
  };
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
