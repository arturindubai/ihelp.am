"use client";
import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn, dateLabel, amd } from "@/lib/format";
import { hm } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { tr } from "@/i18n/locales";
import { StatusBadge } from "@/components/account/StatusBadge";
import { OperatorActions } from "@/components/operator/OperatorActions";
import { operatorGetMoreAction, operatorMarkSeenAction } from "@/server/actions/operator";
import type { OperatorVisitDTO } from "@/lib/operatorVisitDTO";
import type { Tab } from "@/server/services/operatorService";
import { Link } from "@/i18n/navigation";

export function OperatorVisitList({
  tab,
  initialVisits,
  initialHasMore,
  isAdmin,
  locale,
}: {
  tab: Tab;
  initialVisits: OperatorVisitDTO[];
  initialHasMore: boolean;
  isAdmin: boolean;
  locale: string;
}) {
  const t = useTranslations("operator");
  const to = useTranslations("order");
  const [visits, setVisits] = useState(initialVisits);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, start] = useTransition();

  // Сбросить список при смене вкладки
  useEffect(() => {
    setVisits(initialVisits);
    setHasMore(initialHasMore);
  }, [tab, initialVisits, initialHasMore]);

  // Отметить видимые новые визиты как просмотренные
  useEffect(() => {
    const unseenIds = initialVisits.filter((v) => !v.operatorSeen).map((v) => v.id);
    if (unseenIds.length > 0) {
      operatorMarkSeenAction(unseenIds).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    start(async () => {
      const res = await operatorGetMoreAction(tab, visits.length);
      setVisits((prev) => [...prev, ...res.visits]);
      setHasMore(res.hasMore);
    });
  };

  const emptyMsg =
    tab === "today"
      ? t("noOrdersToday")
      : tab === "noMaster"
        ? t("noOrdersUnassigned")
        : tab === "history"
          ? t("noHistory")
          : t("noUpcoming");

  if (visits.length === 0 && !loadingMore) {
    return <p className="py-10 text-center text-muted">{emptyMsg}</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {visits.map((v) => (
          <VisitCard key={v.id} visit={v} locale={locale} isAdmin={isAdmin} t={t} to={to} />
        ))}
        {loadingMore &&
          Array.from({ length: 3 }).map((_, i) => (
            <li key={`skel-${i}`} className="card h-28 animate-pulse bg-surface" />
          ))}
      </ul>

      {hasMore && !loadingMore && (
        <button className="btn-outline mt-4 w-full" onClick={loadMore}>
          {t("showMore")}
        </button>
      )}
    </>
  );
}

function VisitCard({
  visit: v,
  locale,
  isAdmin,
  t,
  to,
}: {
  visit: OperatorVisitDTO;
  locale: string;
  isAdmin: boolean;
  t: ReturnType<typeof useTranslations<"operator">>;
  to: ReturnType<typeof useTranslations<"order">>;
}) {
  const serviceTitle = tr(v.order.service.title, locale);
  const clientName = v.order.user.name;
  const clientPhone = v.order.user.phone;
  const masterName = v.master ? tr(v.master.name, locale) : null;
  const masterPhone = v.master?.phone ?? null;
  const addr = v.order.addressSnapshot;

  // Адресная строка
  const addrLine = addr?.street
    ? [addr.district, `${addr.street} ${addr.building ?? ""}`.trim()].filter(Boolean).join(", ")
    : null;

  // Параметры услуги из config
  const cfg = v.order.config as { options?: { option: unknown }[] } | null;
  const options = cfg?.options?.map((o) => tr(o.option, locale)).filter(Boolean) ?? [];
  const paramsLine = options.join(" · ");

  const scheduledDate = v.scheduledAt ? new Date(v.scheduledAt) : null;

  return (
    <li className="card p-4">
      {/* Шапка: дата + номер + бейдж «Новая» */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            {scheduledDate ? (
              <>
                {dateLabel(scheduledDate, locale, { day: "numeric", month: "short", weekday: "short" })}{" "}
                {hm(scheduledDate)}
              </>
            ) : (
              to("unscheduled")
            )}{" "}
            · <span className="text-ink">#{v.order.number}</span>
            {!v.operatorSeen && (
              <span className="chip bg-brand text-inverse text-xs">{t("newBadge")}</span>
            )}
          </div>
          <div className="mt-0.5 font-medium">{serviceTitle}</div>
        </div>
        <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0 shrink-0" />
      </div>

      {/* Клиент */}
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

        {/* Адрес */}
        {addrLine ? (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap">📍 {addrLine}</div>
        ) : (
          <div className="text-muted">📍 {t("noAddress")}</div>
        )}

        {/* Параметры услуги */}
        {paramsLine && <div className="text-muted">{paramsLine}</div>}

        {/* Сумма и способ оплаты */}
        <div>
          {v.order.paymentMethod === "CARD" ? "💳" : "💵"}{" "}
          <span className="font-semibold">{amd(v.order.pricePerVisit)}</span>{" "}
          <span className="text-muted">·</span>{" "}
          <span className="text-muted">{to(`payMethod.${v.order.paymentMethod}`)}</span>
        </div>

        {/* Комментарий и «Не звонить» */}
        {(v.order.comment || v.order.noCall) && (
          <div className="rounded-lg bg-surface p-2 text-sm">
            {v.order.noCall && (
              <span className="chip mb-1 bg-warn-50 text-warn text-xs">{t("noCallChip")}</span>
            )}
            {v.order.comment && <div>📝 {v.order.comment}</div>}
          </div>
        )}

        {/* Мастер */}
        <div className="flex items-center gap-1">
          {masterName ? (
            <>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{masterName}</span>
              {masterPhone && (
                <>
                  {" "}
                  ·{" "}
                  <a href={`tel:${masterPhone}`} className="text-brand">
                    📞 {formatPhone(masterPhone)}
                  </a>
                </>
              )}
            </>
          ) : (
            <span className={cn("chip bg-warn-50 text-warn")}>{t("noMasterChip")}</span>
          )}
        </div>

        {/* Ссылка «Открыть заказ» — только для admin/owner */}
        {isAdmin && (
          <div>
            <Link href={`/admin/orders/${v.order.id}`} className="text-brand text-sm">
              {t("openOrder")} →
            </Link>
          </div>
        )}
      </div>

      <OperatorActions
        visitId={v.id}
        masterId={v.masterId}
        status={v.status}
        scheduledAt={v.scheduledAt}
      />
    </li>
  );
}
