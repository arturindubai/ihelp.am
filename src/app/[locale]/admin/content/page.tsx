import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getAdminContent } from "@/server/services/pages/admin";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { FeatureManager, FaqManager } from "@/components/admin/ContentManagers";

export default async function AdminContent() {
  if (!(await pageUser("content"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const [features, faq] = await getAdminContent();
  return (
    <div className="max-w-3xl space-y-8">
      <PageHead title={t("content.title")} />
      <div>
        <h2 className="h2 mb-3">{t("content.features")}</h2>
        <FeatureManager features={features.map((f) => ({ id: f.id, data: { icon: f.icon, title: f.title as Record<string, string>, body: (f.body ?? null) as Record<string, string> | null, active: f.active, sort: f.sort } }))} />
      </div>
      <div>
        <h2 className="h2 mb-3">{t("content.faq")}</h2>
        <FaqManager items={faq.map((f) => ({ id: f.id, data: { q: f.q as Record<string, string>, a: f.a as Record<string, string>, active: f.active, sort: f.sort } }))} />
      </div>
    </div>
  );
}
