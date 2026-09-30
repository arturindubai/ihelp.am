import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { getPricesData, getPriceAuditLog, getPriceAuditServices } from "@/server/services/prices";
import { Forbidden, PageHead } from "@/components/admin/ui";
import { PricesManager } from "@/components/admin/PricesManager";
import { PriceAuditLog } from "@/components/admin/PriceAuditLog";
import { cn } from "@/lib/format";

type Params = { locale: string };
type SearchParams = { tab?: string; serviceId?: string; from?: string; to?: string };

export default async function AdminPrices({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!(await pageUser("services"))) return <Forbidden />;
  const t = await getTranslations("admin");

  const tab = sp.tab === "history" ? "history" : "prices";

  const { rows, serviceCount } = await getPricesData(locale);

  let auditData: Awaited<ReturnType<typeof getPriceAuditLog>> | null = null;
  let auditServices: Awaited<ReturnType<typeof getPriceAuditServices>> = [];
  if (tab === "history") {
    const from = sp.from ? new Date(sp.from) : undefined;
    const to = sp.to ? new Date(`${sp.to}T23:59:59`) : undefined;
    [auditData, auditServices] = await Promise.all([
      getPriceAuditLog({ serviceId: sp.serviceId, from, to }),
      getPriceAuditServices(),
    ]);
  }

  return (
    <div className="max-w-[960px]">
      <PageHead
        title={t("prices.title")}
        sub={t("prices.sub", { count: rows.length, services: serviceCount })}
      />

      {/* Вкладки */}
      <div className="mb-4 flex gap-1 border-b border-line">
        <Link
          href={`/admin/prices`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            tab === "prices"
              ? "border-b-2 border-brand text-brand"
              : "text-muted hover:text-ink",
          )}
        >
          {t("prices.pricesTab")}
        </Link>
        <Link
          href={`/admin/prices?tab=history`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            tab === "history"
              ? "border-b-2 border-brand text-brand"
              : "text-muted hover:text-ink",
          )}
        >
          {t("prices.historyTab")}
        </Link>
      </div>

      {tab === "prices" && <PricesManager rows={rows} />}
      {tab === "history" && auditData && (
        <PriceAuditLog
          rows={auditData.rows}
          total={auditData.total}
          services={auditServices}
          filter={{ serviceId: sp.serviceId, from: sp.from, to: sp.to }}
        />
      )}
    </div>
  );
}
