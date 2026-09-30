"use client";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useCallback } from "react";
import type { PriceAuditRow, ServiceOption } from "@/server/services/prices";

type Props = {
  rows: PriceAuditRow[];
  total: number;
  services: ServiceOption[];
  filter: { serviceId?: string; from?: string; to?: string };
};

export function PriceAuditLog({ rows, total, services, filter }: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();

  const navigate = useCallback(
    (updates: Record<string, string | undefined>) => {
      const sp = new URLSearchParams();
      sp.set("tab", "history");
      const merged = { serviceId: filter.serviceId, from: filter.from, to: filter.to, ...updates };
      if (merged.serviceId) sp.set("serviceId", merged.serviceId);
      if (merged.from) sp.set("from", merged.from);
      if (merged.to) sp.set("to", merged.to);
      router.push(`${pathname}?${sp.toString()}` as Parameters<typeof router.push>[0]);
    },
    [filter, pathname, router],
  );

  const handleReset = () => {
    router.push(`${pathname}?tab=history` as Parameters<typeof router.push>[0]);
  };

  const hasFilter = !!(filter.serviceId || filter.from || filter.to);

  return (
    <div>
      {/* Панель фильтров */}
      <div className="card mb-3 flex flex-wrap items-end gap-3 px-3 py-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">{t("prices.historyFilterService")}</label>
          <select
            className="input text-sm"
            value={filter.serviceId ?? ""}
            onChange={(e) => navigate({ serviceId: e.target.value || undefined })}
          >
            <option value="">{t("prices.historyAllServices")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">{t("prices.historyFilterFrom")}</label>
          <input
            type="date"
            className="input text-sm"
            value={filter.from ?? ""}
            onChange={(e) => navigate({ from: e.target.value || undefined })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">{t("prices.historyFilterTo")}</label>
          <input
            type="date"
            className="input text-sm"
            value={filter.to ?? ""}
            onChange={(e) => navigate({ to: e.target.value || undefined })}
          />
        </div>
        {hasFilter && (
          <button type="button" className="btn-ghost btn-sm self-end" onClick={handleReset}>
            {t("prices.historyReset")}
          </button>
        )}
        <span className="ml-auto self-end text-xs text-muted">
          {t("prices.historyCount", { count: total })}
        </span>
      </div>

      {/* Таблица */}
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted">{t("prices.historyEmpty")}</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("prices.historyColDate")}</th>
                <th className="px-3 py-2 font-medium">{t("prices.historyColUser")}</th>
                <th className="px-3 py-2 font-medium">{t("prices.historyColService")}</th>
                <th className="px-3 py-2 font-medium">{t("prices.historyColOption")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("prices.historyColOld")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("prices.historyColNew")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface/40">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {new Date(row.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Yerevan",
                    })}
                  </td>
                  <td className="px-3 py-2">{row.userName ?? "—"}</td>
                  <td className="px-3 py-2">{row.serviceTitle}</td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={row.optionTitle}>
                    {row.optionTitle}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {row.oldPrice} ֏
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    <span className={row.newPrice > row.oldPrice ? "text-ok" : row.newPrice < row.oldPrice ? "text-warn" : ""}>
                      {row.newPrice} ֏
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
