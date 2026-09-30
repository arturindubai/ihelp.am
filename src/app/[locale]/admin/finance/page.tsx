import { getTranslations } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { PageHead, Forbidden } from "@/components/admin/ui";
import { FinanceTab } from "@/components/admin/cc/tabs/FinanceTab";
import type { CcSearch } from "@/components/admin/cc/tabs/shared";

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<CcSearch> }) {
  if (!(await pageUser("finance"))) return <Forbidden />;
  const t = await getTranslations("admin");
  const sp = await searchParams;
  return (
    <div className="max-w-4xl">
      <PageHead title={t("nav.finance")} />
      <FinanceTab sp={sp} />
    </div>
  );
}
