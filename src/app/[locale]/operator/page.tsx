import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/format";
import { getCurrentUser, ADMIN_ROLES } from "@/server/auth";
import { getOperatorVisits, type Tab } from "@/server/services/operatorService";
import { toVisitDTO } from "@/lib/operatorVisitDTO";
import { OperatorVisitList } from "@/components/operator/OperatorVisitList";
import { LogoutButton } from "@/components/operator/LogoutButton";

export default async function OperatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab: rawTab = "today" } = await searchParams;
  setRequestLocale(locale);

  const tab: Tab =
    rawTab === "upcoming"
      ? "upcoming"
      : rawTab === "history"
        ? "history"
        : rawTab === "noMaster"
          ? "noMaster"
          : "today";

  const [t, user, { visits, hasMore }] = await Promise.all([
    getTranslations("operator"),
    getCurrentUser(),
    getOperatorVisits(tab),
  ]);

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role as "ADMIN" | "OWNER");

  const tabs: [Tab, string][] = [
    ["today", t("today")],
    ["upcoming", t("upcoming")],
    ["history", t("history")],
    ["noMaster", t("noMaster")],
  ];

  return (
    <div className="container-m pt-4 pb-10">
      {/* Шапка */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin" className="text-sm text-brand">
              {t("openAdmin")}
            </Link>
          )}
          <LogoutButton label={t("logout")} />
        </div>
      </div>

      {/* Таб-бар (прокрутка на узких экранах) */}
      <div className="mb-4 overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl bg-paper p-1">
          {tabs.map(([k, l]) => (
            <Link
              key={k}
              href={`/operator?tab=${k}`}
              className={cn(
                "rounded-lg px-3 py-2 text-center text-sm font-medium whitespace-nowrap",
                tab === k ? "bg-ink text-inverse" : "text-muted",
              )}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      <OperatorVisitList
        tab={tab}
        initialVisits={visits.map(toVisitDTO)}
        initialHasMore={hasMore}
        isAdmin={isAdmin}
        locale={locale}
      />
    </div>
  );
}
