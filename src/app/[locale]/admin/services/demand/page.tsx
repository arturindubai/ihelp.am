import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getSettings } from "@/server/settings";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { getInterestStats } from "@/server/services/serviceInterest";
import { DemandClient } from "./DemandClient";

export default async function DemandPage() {
  if (!(await pageUser("services"))) return <Forbidden />;
  const t = await getTranslations("admin.demand");
  const [rows, settings] = await Promise.all([getInterestStats(), getSettings()]);
  return (
    <div>
      <PageHead title={t("title")} sub={t("sub")} />
      <DemandClient rows={rows} notifyMode={settings.notify.interestNotifyMode} />
    </div>
  );
}
