import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageUser } from "@/server/adminPage";
import { Forbidden } from "@/components/admin/ui";
import { FinanceTab } from "@/components/admin/cc/tabs/FinanceTab";
import type { CcSearch } from "@/components/admin/cc/tabs/shared";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("finance"))) return <Forbidden />;
  const t = await getTranslations("admin.nav");

  const raw = await searchParams;
  const sp: CcSearch = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") sp[k] = v;
    else if (Array.isArray(v) && v.length > 0) sp[k] = v[0];
  }

  return (
    <div className="max-w-6xl">
      <h1 className="mb-5 text-2xl font-bold">{t("finance")}</h1>
      <FinanceTab sp={sp} />
    </div>
  );
}
