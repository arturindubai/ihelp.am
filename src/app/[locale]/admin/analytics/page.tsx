import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { ExportForm } from "./ExportForm";

export default async function AnalyticsPage() {
  if (!(await pageUser("analytics"))) return <Forbidden />;
  const t = await getTranslations("admin.analytics");
  return (
    <div>
      <PageHead title={t("title")} sub={t("sub")} />
      <ExportForm />
    </div>
  );
}
