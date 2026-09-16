import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { pageUser } from "@/server/adminPage";
import { tr } from "@/i18n/locales";
import { ymd } from "@/lib/time";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { PromoManager } from "@/components/admin/PromoManager";

export default async function AdminPromos({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("promos"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const [promos, services] = await Promise.all([db.promoCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }), db.service.findMany({ orderBy: { sort: "asc" } })]);
  return (
    <div className="max-w-4xl">
      <PageHead title={t("promos.title")} />
      <PromoManager
        services={services.map((s) => ({ id: s.id, name: tr(s.title, locale) }))}
        promos={promos.map((p) => ({ id: p.id, usedCount: p.usedCount, data: { code: p.code, description: p.description, type: p.type, value: p.value, maxDiscount: p.maxDiscount, minOrder: p.minOrder, validFrom: p.validFrom ? ymd(p.validFrom) : null, validTo: p.validTo ? ymd(p.validTo) : null, usageLimit: p.usageLimit, perUserLimit: p.perUserLimit, firstOrderOnly: p.firstOrderOnly, stackable: p.stackable, serviceIds: p.serviceIds, planKinds: p.planKinds, active: p.active } }))}
      />
    </div>
  );
}
