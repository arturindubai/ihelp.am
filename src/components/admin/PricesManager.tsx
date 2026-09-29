"use client";
import { useState, useMemo, useTransition, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/format";
import type { PriceRow } from "@/server/services/prices";
import { savePriceAction, bulkPriceAction } from "@/server/actions/prices";

type Props = { rows: PriceRow[] };

type DisplayRow =
  | { kind: "sep"; categoryId: string; title: string }
  | { kind: "data"; row: PriceRow };

export function PricesManager({ rows }: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Локальные цены (перекрывают props после сохранения)
  const [localPrices, setLocalPrices] = useState<Record<string, number>>({});

  // Inline-редактирование
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Выбор строк
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Массовое изменение
  const [bulkType, setBulkType] = useState<"percent" | "flat">("percent");
  const [bulkValue, setBulkValue] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmMode, setConfirmMode] = useState(false);
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState(false);

  const getPrice = useCallback((optionId: string) => {
    return localPrices[optionId] ?? rows.find((r) => r.optionId === optionId)?.price ?? 0;
  }, [localPrices, rows]);

  const displayRows = useMemo((): DisplayRow[] => {
    const result: DisplayRow[] = [];
    let lastCatId = "";
    for (const row of rows) {
      if (row.categoryId !== lastCatId) {
        result.push({ kind: "sep", categoryId: row.categoryId, title: row.categoryTitle });
        lastCatId = row.categoryId;
      }
      result.push({ kind: "data", row });
    }
    return result;
  }, [rows]);

  const allDataIds = useMemo(() => rows.map((r) => r.optionId), [rows]);
  const allSelected = allDataIds.length > 0 && allDataIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allDataIds));
  };

  const toggleRow = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  const computePreview = (optionId: string): number | null => {
    const val = parseFloat(bulkValue);
    if (isNaN(val)) return null;
    const cur = getPrice(optionId);
    if (bulkType === "percent") return Math.max(0, Math.round(cur * (1 + val / 100)));
    return Math.max(0, cur + Math.round(val));
  };

  const flashRow = (optionId: string) => {
    const existing = flashTimers.current.get(optionId);
    if (existing) clearTimeout(existing);
    setFlashIds((prev) => new Set([...prev, optionId]));
    const t = setTimeout(() => {
      setFlashIds((prev) => { const s = new Set(prev); s.delete(optionId); return s; });
      flashTimers.current.delete(optionId);
    }, 800);
    flashTimers.current.set(optionId, t);
  };

  const startEdit = (row: PriceRow) => {
    if (savingId) return;
    setEditingId(row.optionId);
    setEditValue(String(getPrice(row.optionId)));
    setErrorIds((prev) => { const s = new Set(prev); s.delete(row.optionId); return s; });
  };

  const cancelEdit = () => { setEditingId(null); setEditValue(""); };

  const commitEdit = async (optionId: string) => {
    const parsed = parseInt(editValue, 10);
    if (isNaN(parsed) || parsed < 0) { cancelEdit(); return; }
    setEditingId(null);
    setSavingId(optionId);
    const res = await savePriceAction(optionId, parsed);
    setSavingId(null);
    if (res.ok) {
      setLocalPrices((prev) => ({ ...prev, [optionId]: parsed }));
      flashRow(optionId);
      startTransition(() => router.refresh());
    } else {
      setErrorIds((prev) => new Set([...prev, optionId]));
    }
  };

  const colCount = previewMode && someSelected ? 6 : 5;

  const handleBulkApply = () => {
    const val = parseFloat(bulkValue);
    if (isNaN(val)) return;
    setBulkError(false);
    setConfirmMode(true);
  };

  const handleBulkConfirm = () => {
    const val = parseFloat(bulkValue);
    if (isNaN(val)) return;
    const ids = Array.from(selectedIds);
    startBulkTransition(async () => {
      const res = await bulkPriceAction(ids, bulkType, val);
      if (res.ok && res.updatedPrices) {
        setLocalPrices((prev) => ({ ...prev, ...res.updatedPrices }));
        setSelectedIds(new Set());
        setPreviewMode(false);
        setConfirmMode(false);
        setBulkValue("");
        setBulkError(false);
        startTransition(() => router.refresh());
      } else {
        setBulkError(true);
        setConfirmMode(false);
      }
    });
  };

  const cancelBulk = () => {
    setSelectedIds(new Set());
    setPreviewMode(false);
    setConfirmMode(false);
    setBulkValue("");
    setBulkError(false);
  };

  const bulkUnit = bulkType === "percent" ? "%" : " ֏";
  const bulkDisplayValue = bulkValue ? `${bulkValue}${bulkUnit}` : "0" + bulkUnit;

  if (rows.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-muted">{t("prices.empty")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk bar: sticky, появляется при выборе строк */}
      {someSelected && (
        <div className="sticky top-14 z-20 mb-3 md:top-0">
          <div className="card border-[1.5px] border-brand bg-paper px-3 py-2 shadow-[0_2px_8px_0_color-mix(in_srgb,var(--color-brand)_12%,transparent)]">
            {!confirmMode ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-semibold text-brand">
                  {t("prices.selected", { count: selectedIds.size })}
                </span>
                <span className="hidden text-line sm:inline">|</span>
                {/* Переключатель типа */}
                <div className="flex rounded-md bg-surface p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBulkType("percent")}
                    className={cn("rounded px-2 py-1", bulkType === "percent" ? "bg-paper shadow-sm" : "text-muted")}
                  >
                    {t("prices.bulkPercent")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkType("flat")}
                    className={cn("rounded px-2 py-1", bulkType === "flat" ? "bg-paper shadow-sm" : "text-muted")}
                  >
                    {t("prices.bulkFlat")}
                  </button>
                </div>
                <input
                  type="number"
                  className="input w-20 text-sm"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="0"
                />
                <button
                  type="button"
                  className="text-sm font-medium text-brand underline underline-offset-2 hover:no-underline"
                  onClick={() => setPreviewMode((v) => !v)}
                >
                  {t("prices.bulkPreview")}
                </button>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={cancelBulk}>
                    {t("prices.bulkCancel")}
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={handleBulkApply} disabled={!bulkValue}>
                    {t("prices.bulkApply")}
                  </button>
                </div>
              </div>
            ) : (
              /* Полоса подтверждения */
              <div className="rounded-lg border border-warn bg-warn-50 px-3 py-2">
                <p className="mb-2 text-sm text-warn">
                  {t("prices.confirmMsg", { count: selectedIds.size, value: bulkValue, unit: bulkUnit })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmMode(false)}>
                    {t("prices.bulkCancel")}
                  </button>
                  <button
                    type="button"
                    className="btn-sm min-h-9 rounded-lg bg-warn px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    onClick={handleBulkConfirm}
                    disabled={bulkPending}
                  >
                    {bulkPending ? "…" : t("prices.bulkConfirm")}
                  </button>
                </div>
              </div>
            )}
            {bulkError && (
              <p className="mt-1 text-xs text-bad">{t("common.error")}</p>
            )}
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
            <tr>
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 font-medium">{t("prices.colService")}</th>
              <th className="px-3 py-2 font-medium">{t("prices.colParam")}</th>
              <th className="px-3 py-2 font-medium">{t("prices.colOption")}</th>
              <th className="px-3 py-2 text-right font-medium tabular-nums">{t("prices.colPrice")}</th>
              {previewMode && someSelected && (
                <th className="px-3 py-2 text-right font-medium text-ok">{t("prices.colNewPrice")}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {displayRows.map((dr, idx) => {
              if (dr.kind === "sep") {
                return (
                  <tr key={`sep-${dr.categoryId}`} className="bg-surface">
                    <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      {dr.title}
                    </td>
                  </tr>
                );
              }

              const { row } = dr;
              const price = getPrice(row.optionId);
              const isEditing = editingId === row.optionId;
              const isSaving = savingId === row.optionId;
              const hasError = errorIds.has(row.optionId);
              const isFlashing = flashIds.has(row.optionId);
              const isSelected = selectedIds.has(row.optionId);
              const previewPrice = (previewMode && isSelected) ? computePreview(row.optionId) : null;

              return (
                <tr
                  key={row.optionId}
                  className={cn(
                    "transition-colors duration-100",
                    isFlashing && "bg-ok-50",
                    isSelected && !isFlashing && "bg-brand-50/40",
                  )}
                >
                  {/* Чекбокс */}
                  <td className="w-9 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(row.optionId)}
                      className="cursor-pointer"
                    />
                  </td>

                  {/* Услуга */}
                  <td className="px-3 py-2 font-medium">{row.serviceTitle}</td>

                  {/* Параметр (group title) */}
                  <td className="px-3 py-2 text-muted">{row.groupTitle}</td>

                  {/* Вариант / тариф */}
                  <td className="max-w-[200px] truncate px-3 py-2" title={row.optionTitle}>
                    {row.optionTitle}
                  </td>

                  {/* Цена */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {isEditing ? (
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          autoFocus
                          className="w-[90px] rounded-lg border border-brand bg-brand-50 px-2 py-1 text-right text-sm outline-none focus:border-brand"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(row.optionId);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => commitEdit(row.optionId)}
                          min={0}
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => commitEdit(row.optionId)}
                          className="chip bg-ok-50 text-ok hover:bg-ok/20"
                        >
                          ✓
                        </button>
                      </span>
                    ) : isSaving ? (
                      <span className="text-muted">…</span>
                    ) : hasError ? (
                      <button
                        className="chip bg-bad-50 text-bad"
                        onClick={() => startEdit(row)}
                      >
                        {t("common.error")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className={cn(
                          "rounded px-1.5 py-0.5 hover:bg-surface",
                          previewMode && isSelected && "text-muted line-through",
                        )}
                      >
                        {price} ֏
                      </button>
                    )}
                  </td>

                  {/* Новая цена (предпросмотр) */}
                  {previewMode && someSelected && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isSelected ? (
                        previewPrice === null || price === 0
                          ? <span className="text-muted">—</span>
                          : <span className="font-bold text-ok">{previewPrice} ֏</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
