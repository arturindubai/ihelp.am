"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { addDays, ymd } from "@/lib/time";

function defaultRange() {
  const to = ymd(new Date());
  const from = addDays(to, -29);
  return { from, to };
}

export function ExportForm() {
  const t = useTranslations("admin.analytics");
  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const url = `/api/admin/analytics/export?from=${from}&to=${to}`;
      const res = await fetch(url);
      if (!res.ok) {
        alert(await res.text());
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `analytics_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setLoading(false);
    }
  }

  const valid = from && to && from <= to;

  return (
    <div className="card max-w-lg p-6">
      <p className="mb-4 text-sm text-muted">{t("hint")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("from")}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("to")}
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="input"
          />
        </label>
        <button
          onClick={handleDownload}
          disabled={!valid || loading}
          className="btn-primary flex items-center gap-2"
        >
          <Download size={16} />
          {loading ? t("loading") : t("download")}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">{t("columns")}</p>
    </div>
  );
}
