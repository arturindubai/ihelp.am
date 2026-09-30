"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { amd } from "@/lib/format";
import { cn } from "@/lib/format";
import { getFinanceTransactionsAction } from "@/server/actions/admin/finance";
import type { TransactionRow } from "@/lib/finance";
import type { CcSearch } from "./shared";

type PlanKind = "ONE_TIME" | "SUBSCRIPTION" | "PACKAGE";

interface MasterOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
}

interface Props {
  from: string;
  to: string;
  initial: {
    rows: TransactionRow[];
    hasMore: boolean;
    nextCursor: string | null;
  };
  masters: MasterOption[];
  services: ServiceOption[];
  sp: CcSearch;
}

function buildExportUrl(from: string, to: string, type?: string, masterId?: string, serviceId?: string): string {
  const p = new URLSearchParams({ from, to });
  if (type) p.set("type", type);
  if (masterId) p.set("masterId", masterId);
  if (serviceId) p.set("serviceId", serviceId);
  return `/api/admin/finance/export?${p.toString()}`;
}

/** Таблица операций с фильтрами, пагинацией и экспортом CSV */
export function FinanceTransactions({ from, to, initial, masters, services, sp }: Props) {
  const t = useTranslations("admin.cc.finance.tx");
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const [rows, setRows] = useState<TransactionRow[]>(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loadPending, setLoadPending] = useState(false);

  const type = (sp.txType as PlanKind | undefined) ?? undefined;
  const masterId = sp.txMaster ?? undefined;
  const serviceId = sp.txService ?? undefined;

  const go = (patch: Record<string, string>) => {
    const next = { ...sp, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    qs.set("tab", "finance");
    startNav(() => router.push(`/admin/control?${qs.toString()}`));
  };

  const handleLoadMore = async () => {
    if (!cursor || loadPending) return;
    setLoadPending(true);
    try {
      const result = await getFinanceTransactionsAction({ from, to, type, masterId, serviceId, cursor });
      if (result.ok) {
        setRows((prev) => [...prev, ...result.rows]);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
      }
    } finally {
      setLoadPending(false);
    }
  };

  const typeLabel = (k: PlanKind) => {
    if (k === "ONE_TIME") return t("typeLabel.ONE_TIME");
    if (k === "SUBSCRIPTION") return t("typeLabel.SUBSCRIPTION");
    return t("typeLabel.PACKAGE");
  };

  const payLabel = (m: "CASH" | "CARD") => (m === "CASH" ? t("paymentCash") : t("paymentCard"));

  return (
    <div className="space-y-3" style={{ opacity: navPending ? 0.6 : 1 }}>
      {/* Заголовок и кнопка экспорта */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h3">{t("title")}</h2>
        <a
          href={buildExportUrl(from, to, type, masterId, serviceId)}
          download
          className="btn-outline btn-sm flex items-center gap-1"
        >
          <span>↓</span> {t("exportCsv")}
        </a>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2">
        <select
          className="input h-9 w-auto text-sm"
          value={type ?? ""}
          onChange={(e) => go({ txType: e.target.value })}
        >
          <option value="">{t("typeAll")}</option>
          <option value="ONE_TIME">{t("typeOneTime")}</option>
          <option value="SUBSCRIPTION">{t("typeSubscription")}</option>
          <option value="PACKAGE">{t("typePackage")}</option>
        </select>

        {masters.length > 0 && (
          <select
            className="input h-9 w-auto max-w-[12rem] text-sm"
            value={masterId ?? ""}
            onChange={(e) => go({ txMaster: e.target.value })}
          >
            <option value="">{t("masterAll")}</option>
            {masters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}

        {services.length > 0 && (
          <select
            className="input h-9 w-auto max-w-[12rem] text-sm"
            value={serviceId ?? ""}
            onChange={(e) => go({ txService: e.target.value })}
          >
            <option value="">{t("serviceAll")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {(type || masterId || serviceId) && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => go({ txType: "", txMaster: "", txService: "" })}
          >
            ×
          </button>
        )}
      </div>

      {/* Пустое состояние */}
      {rows.length === 0 && (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted">{t("empty")}</p>
      )}

      {/* Таблица на компьютере */}
      {rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-1.5 text-left font-medium">{t("colDate")}</th>
                  <th className="pb-1.5 text-left font-medium">{t("colType")}</th>
                  <th className="pb-1.5 text-left font-medium">{t("colClient")}</th>
                  <th className="pb-1.5 text-left font-medium">{t("colMaster")}</th>
                  <th className="pb-1.5 text-left font-medium">{t("colService")}</th>
                  <th className="pb-1.5 text-right font-medium">{t("colAmount")}</th>
                  <th className="pb-1.5 text-right font-medium">{t("colPayment")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.visitId}>
                    <td className="py-2 font-mono text-xs text-muted">{r.date}</td>
                    <td className="py-2 text-xs">{typeLabel(r.type)}</td>
                    <td className="max-w-[10rem] truncate py-2" title={r.clientName}>{r.clientName || "—"}</td>
                    <td className="max-w-[10rem] truncate py-2 text-muted" title={r.masterName ?? undefined}>{r.masterName || "—"}</td>
                    <td className="max-w-[12rem] truncate py-2 text-muted" title={r.serviceName}>{r.serviceName}</td>
                    <td className="py-2 text-right font-medium">{amd(r.amount)}</td>
                    <td className={cn("py-2 text-right text-xs", r.paymentMethod === "CASH" ? "text-warn" : "text-ok")}>
                      {payLabel(r.paymentMethod)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Карточки на телефоне */}
          <div className="space-y-2 lg:hidden">
            {rows.map((r) => (
              <div key={r.visitId} className="rounded-xl bg-surface px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{r.clientName || "—"}</p>
                    <p className="truncate text-xs text-muted">{r.serviceName}</p>
                    <p className="text-xs text-muted">
                      {r.date} · {typeLabel(r.type)} · {r.masterName || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{amd(r.amount)}</p>
                    <p className={cn("text-xs", r.paymentMethod === "CASH" ? "text-warn" : "text-ok")}>
                      {payLabel(r.paymentMethod)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Кнопка «Загрузить ещё» */}
          {hasMore && (
            <button
              type="button"
              className="btn-outline btn-sm w-full"
              onClick={handleLoadMore}
              disabled={loadPending}
            >
              {loadPending ? t("loadMoreLoading") : t("loadMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
