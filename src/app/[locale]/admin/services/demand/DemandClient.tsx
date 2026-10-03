"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { saveInterestNotifyModeAction } from "@/server/actions/admin/interest";
import type { InterestRow, SearchQueryRow } from "@/server/services/serviceInterest";

type Props = {
  rows: InterestRow[];
  searchQueries: SearchQueryRow[];
  notifyMode: "immediate" | "digest";
};

export function DemandClient({ rows, searchQueries, notifyMode: initialMode }: Props) {
  const t = useTranslations("admin.demand");
  const [mode, setMode] = useState<"immediate" | "digest">(initialMode);
  const [saving, setSaving] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  async function handleModeChange(next: "immediate" | "digest") {
    setSaving(true);
    await saveInterestNotifyModeAction(next);
    setMode(next);
    setSaving(false);
  }

  async function handleExport(slug?: string) {
    setDownloaded(false);
    const url = slug ? `/api/admin/services/demand/export?slug=${encodeURIComponent(slug)}` : `/api/admin/services/demand/export`;
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slug ? `interest_${slug}.csv` : "interest_all.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    setDownloaded(true);
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{t("notifyTitle")}</div>
            <div className="text-sm text-muted">{t("notifyHint")}</div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="notifyMode" value="immediate" checked={mode === "immediate"} disabled={saving} onChange={() => handleModeChange("immediate")} className="accent-brand" />
              {t("modeImmediate")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="notifyMode" value="digest" checked={mode === "digest"} disabled={saving} onChange={() => handleModeChange("digest")} className="accent-brand" />
              {t("modeDigest")}
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("tableHint", { count: rows.length })}</p>
        <button onClick={() => handleExport()} className="btn-outline btn-sm flex items-center gap-2">
          <Download size={15} />
          {downloaded ? t("exported") : t("exportAll")}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">{t("empty")}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("colCategory")}</th>
                <th className="px-3 py-2 font-medium">{t("colService")}</th>
                <th className="px-3 py-2 font-medium text-right">{t("colTotal")}</th>
                <th className="px-3 py-2 font-medium text-right">{t("col7d")}</th>
                <th className="px-3 py-2 font-medium text-right">{t("col30d")}</th>
                <th className="px-3 py-2 font-medium">{t("colLast")}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.serviceSlug} className="hover:bg-surface/40">
                  <td className="px-3 py-2 text-muted">{r.categoryLabel}</td>
                  <td className="px-3 py-2 font-medium">{r.label || r.serviceSlug}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                  <td className="px-3 py-2 text-right">{r.last7}</td>
                  <td className="px-3 py-2 text-right">{r.last30}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">
                    {r.lastAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Yerevan" }).format(r.lastAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/services/demand/${r.serviceSlug}`} className="btn-ghost btn-sm text-xs">
                      {t("contacts")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Поисковые запросы без результата */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">{t("searchQueriesTitle")}</h2>
        <p className="mb-3 text-xs text-muted">{t("searchQueriesHint")}</p>
        {searchQueries.length === 0 ? (
          <div className="card p-6 text-center text-muted text-sm">{t("searchQueriesEmpty")}</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("sqColQuery")}</th>
                  <th className="px-3 py-2 font-medium">{t("sqColLocale")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("sqColCount")}</th>
                  <th className="px-3 py-2 font-medium">{t("colLast")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {searchQueries.map((r) => (
                  <tr key={`${r.query}:${r.locale}`} className="hover:bg-surface/40">
                    <td className="px-3 py-2 font-medium">{r.query}</td>
                    <td className="px-3 py-2 text-muted">{r.locale}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.count}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">
                      {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Yerevan" }).format(r.lastAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
