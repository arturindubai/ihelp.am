"use client";
import { useTranslations } from "next-intl";

export interface ServiceStats {
  orders30d: number;
  rating: number;
  reviewsCount: number;
}

export function StatsBlock({ stats }: { stats: ServiceStats | null }) {
  const t = useTranslations("admin.services.stats");
  const loading = stats === null;

  return (
    <div className="mb-4 flex flex-wrap gap-6 overflow-x-auto rounded-xl bg-brand-50 px-4 py-2 text-sm">
      <StatItem label={t("orders30d")} value={loading ? "..." : String(stats.orders30d)} muted={loading} />
      <StatItem
        label={t("rating")}
        value={loading ? "..." : stats.rating > 0 ? stats.rating.toFixed(1) : "—"}
        muted={loading}
      />
      <StatItem label={t("reviews")} value={loading ? "..." : String(stats.reviewsCount)} muted={loading} />
    </div>
  );
}

function StatItem({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={muted ? "text-muted" : "font-semibold text-ink"}>{value}</p>
    </div>
  );
}
