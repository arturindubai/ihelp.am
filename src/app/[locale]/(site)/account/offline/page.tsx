"use client";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { WifiOff } from "lucide-react";
import { readVisitCache, CLIENT_CACHE_KEY, type CachedVisit, type VisitCacheData } from "@/lib/visitCache";
import { tr } from "@/i18n/locales";
import { dateLabel, timeLabel, durationLabel, amd } from "@/lib/format";
import { StatusBadge } from "@/components/account/StatusBadge";

export default function AccountOfflinePage() {
  const t = useTranslations("offline");
  const to = useTranslations("order");
  const router = useRouter();
  const locale = useLocale();
  const [cache, setCache] = useState<VisitCacheData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (navigator.onLine) {
      router.replace("/account/orders");
      return;
    }
    setCache(readVisitCache(CLIENT_CACHE_KEY));
    setReady(true);

    function handleOnline() {
      router.replace("/account/orders");
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="container-m pt-4 pb-10">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="h1 flex-1">{t("clientTitle")}</h1>
        <span className="chip flex items-center gap-1 text-muted">
          <WifiOff size={13} /> {t("viewOnly")}
        </span>
      </div>

      {cache ? (
        <>
          <p className="mb-4 text-sm text-muted">
            {t("cachedAt", { time: dateLabel(new Date(cache.cachedAt), locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
          </p>
          {cache.visits.length === 0 ? (
            <p className="py-10 text-center text-muted">{t("noVisits")}</p>
          ) : (
            <ul className="space-y-3">
              {cache.visits.map((v: CachedVisit) => (
                <li key={v.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {v.scheduledAt && (
                        <>
                          <div className="text-lg font-bold">{timeLabel(new Date(v.scheduledAt))}</div>
                          <div className="text-sm text-muted">{dateLabel(new Date(v.scheduledAt), locale)}</div>
                        </>
                      )}
                      <div className="mt-1 text-sm text-muted">{durationLabel(v.durationMin, locale)}</div>
                    </div>
                    <StatusBadge status={v.status} label={to(`visitStatus.${v.status}`)} className="mt-0" />
                  </div>
                  <div className="mt-2 font-medium">{tr(v.serviceTitle, locale)}</div>
                  {v.masterName && (
                    <div className="mt-1 text-sm text-muted">👤 {tr(v.masterName, locale)}</div>
                  )}
                  <div className="mt-2 text-sm font-semibold">{amd(v.price)}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="rounded-card bg-surface p-6 text-center text-muted">
          <WifiOff size={32} className="mx-auto mb-3 opacity-40" />
          <p>{t("noCache")}</p>
        </div>
      )}
    </div>
  );
}
