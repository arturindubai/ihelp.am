import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { tr } from "@/i18n/locales";
import { cn, dateLabel } from "@/lib/format";
import { hm } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { StatusBadge } from "@/components/account/StatusBadge";
import { OperatorActions } from "@/components/operator/OperatorActions";
import { getOperatorVisits, getActiveMasters } from "@/server/services/operatorService";

type Tab = "today" | "all" | "noMaster";

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
  const tab: Tab = rawTab === "all" ? "all" : rawTab === "noMaster" ? "noMaster" : "today";

  const [t, to, visits, masters] = await Promise.all([
    getTranslations("operator"),
    getTranslations("order"),
    getOperatorVisits(tab),
    getActiveMasters(),
  ]);

  const tabs: [Tab, string][] = [
    ["today", t("today")],
    ["all", t("all")],
    ["noMaster", t("noMaster")],
  ];

  const emptyMsg =
    tab === "today" ? t("noOrdersToday") : tab === "noMaster" ? t("noOrdersUnassigned") : t("noOrders");

  return (
    <div className="container-m pt-4 pb-10">
      <div className="my-4 flex gap-1 rounded-xl bg-paper p-1">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/operator?tab=${k}`}
            className={cn(
              "flex-1 rounded-lg py-2 text-center text-sm font-medium",
              tab === k ? "bg-ink text-inverse" : "text-muted",
            )}
          >
            {l}
          </Link>
        ))}
      </div>

      {visits.length === 0 && <p className="py-10 text-center text-muted">{emptyMsg}</p>}

      <ul className="space-y-3">
        {visits.map((v) => {
          const serviceTitle = tr(v.order.service.title, locale);
          const clientName = v.order.user.name;
          const clientPhone = v.order.user.phone;
          const masterName = v.master ? tr(v.master.name, locale) : null;

          return (
            <li key={v.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm text-muted">
                    {v.scheduledAt ? (
                      <>
                        {dateLabel(v.scheduledAt, locale, { day: "numeric", month: "short", weekday: "short" })}{" "}
                        {hm(v.scheduledAt)}
                      </>
                    ) : (
                      to("unscheduled")
                    )}{" "}
                    · <span className="text-ink">#{v.order.number}</span>
                  </div>
                  <div className="mt-0.5 font-medium">{serviceTitle}</div>
                </div>
                <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0 shrink-0" />
              </div>

              <div className="mt-2 space-y-1 text-sm">
                <div>
                  👤{" "}
                  {clientName ? (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{clientName}</span>
                  ) : (
                    <span className="text-muted">{clientPhone}</span>
                  )}{" "}
                  ·{" "}
                  <a href={`tel:${clientPhone}`} className="text-brand">
                    📞 {formatPhone(clientPhone)}
                  </a>
                </div>
                <div>
                  {masterName ? (
                    masterName
                  ) : (
                    <span className="chip bg-warn-50 text-warn">{t("noMasterChip")}</span>
                  )}
                </div>
              </div>

              <OperatorActions
                visitId={v.id}
                masterId={v.masterId}
                status={v.status}
                masters={masters.map((m) => ({ id: m.id, name: m.name as Record<string, string> | string }))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
