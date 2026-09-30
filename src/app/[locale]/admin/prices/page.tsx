import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { getPricesData } from "@/server/services/prices";
import { Forbidden, PageHead } from "@/components/admin/ui";
import { PricesManager } from "@/components/admin/PricesManager";

export default async function AdminPrices({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await pageUser("services"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const { rows, serviceCount } = await getPricesData(locale);
  return (
    <div className="max-w-[960px]">
      <PageHead
        title={t("prices.title")}
        sub={t("prices.sub", { count: rows.length, services: serviceCount })}
      />
      <PricesManager rows={rows} />
    </div>
  );
}
