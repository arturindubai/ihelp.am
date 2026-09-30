"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DailyChannelRow } from "@/lib/finance";
import { amd } from "@/lib/format";

// Размеры SVG-графика
const PAD_L = 44;   // левый отступ (метки Y)
const PAD_R = 8;    // правый отступ
const PAD_T = 8;    // верхний отступ
const PAD_B = 28;   // нижний отступ (метки X)
const CHART_H = 180;
const INNER_H = CHART_H - PAD_T - PAD_B;
const BOTTOM = PAD_T + INNER_H;
const COL_W = 22;   // ширина столбца (бар + зазор)
const BAR_W = 12;   // ширина бара

type BarRow = {
  label: string;    // ISO-дата (YYYY-MM-DD) или начало недели
  oneTime: number;
  subscription: number;
  pkg: number;
  total: number;
};

type TooltipState = {
  clientX: number;
  clientY: number;
  row: BarRow;
} | null;

function fmtLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`;
}

function shortAmd(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}

/** Группировка дней в недели (Monday-based) при периоде > 60 дней */
function groupByWeek(daily: DailyChannelRow[]): BarRow[] {
  const weeks: Record<string, BarRow> = {};
  for (const row of daily) {
    const [y, m, d] = row.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();                // 0=вс..6=сб
    const diff = dow === 0 ? -6 : 1 - dow; // смещение к понедельнику
    const mon = new Date(y, m - 1, d + diff);
    const key = [
      mon.getFullYear(),
      String(mon.getMonth() + 1).padStart(2, "0"),
      String(mon.getDate()).padStart(2, "0"),
    ].join("-");
    if (!weeks[key]) weeks[key] = { label: key, oneTime: 0, subscription: 0, pkg: 0, total: 0 };
    weeks[key].oneTime += row.oneTime;
    weeks[key].subscription += row.subscription;
    weeks[key].pkg += row.package;
    weeks[key].total += row.total;
  }
  return Object.values(weeks).sort((a, b) => a.label.localeCompare(b.label));
}

function toBarRows(daily: DailyChannelRow[]): BarRow[] {
  return daily.map((r) => ({
    label: r.date,
    oneTime: r.oneTime,
    subscription: r.subscription,
    pkg: r.package,
    total: r.total,
  }));
}

export function FinanceChart({ daily }: { daily: DailyChannelRow[] }) {
  const t = useTranslations("admin.cc");
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const data = daily.length > 60 ? groupByWeek(daily) : toBarRows(daily);
  const maxTotal = Math.max(...data.map((r) => r.total), 1);

  if (data.length === 0 || data.every((r) => r.total === 0)) return null;

  const svgW = PAD_L + data.length * COL_W + PAD_R;
  const yTicks = [0.25, 0.5, 0.75, 1.0].map((f) => Math.round(maxTotal * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));

  function bh(v: number) {
    return Math.round((v / maxTotal) * INNER_H);
  }

  const showTip = (e: React.MouseEvent | React.TouchEvent, row: BarRow) => {
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    setTooltip({ clientX, clientY, row });
  };

  return (
    <div className="space-y-3">
      {/* Прокручиваемая область — горизонтальный скролл на телефоне */}
      <div className="overflow-x-auto" onScroll={() => setTooltip(null)}>
        <svg
          width={Math.max(svgW, 280)}
          height={CHART_H}
          aria-hidden="true"
          className="block select-none"
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Нижняя ось */}
          <line x1={PAD_L} x2={svgW - PAD_R} y1={BOTTOM} y2={BOTTOM} stroke="var(--color-line)" strokeWidth={1} />

          {/* Горизонтальная сетка и метки Y */}
          {yTicks.map((tick) => {
            const y = PAD_T + INNER_H - bh(tick);
            return (
              <g key={tick}>
                <line
                  x1={PAD_L} x2={svgW - PAD_R}
                  y1={y} y2={y}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--color-muted)">
                  {shortAmd(tick)}
                </text>
              </g>
            );
          })}

          {/* Столбцы */}
          {data.map((row, i) => {
            const bx = PAD_L + i * COL_W + Math.round((COL_W - BAR_W) / 2);
            const h1 = bh(row.oneTime);
            const h2 = bh(row.subscription);
            const h3 = bh(row.pkg);

            // Позиции сегментов: разовые снизу, подписки посередине, пакеты сверху
            const y1 = BOTTOM - h1;
            const y2 = y1 - h2;
            const y3 = y2 - h3;

            return (
              <g
                key={row.label}
                onMouseEnter={(e) => showTip(e, row)}
                onTouchStart={(e) => showTip(e, row)}
              >
                {/* Невидимая зона для ховера */}
                <rect x={PAD_L + i * COL_W} y={PAD_T} width={COL_W} height={INNER_H} fill="transparent" />

                {/* Разовые заказы — снизу (bg-brand) */}
                {h1 > 0 && (
                  <rect x={bx} y={y1} width={BAR_W} height={h1} fill="var(--color-brand)" />
                )}
                {/* Подписки — середина (bg-ok) */}
                {h2 > 0 && (
                  <rect x={bx} y={y2} width={BAR_W} height={h2} fill="var(--color-ok)" />
                )}
                {/* Пакеты визитов — сверху (bg-warn) */}
                {h3 > 0 && (
                  <rect x={bx} y={y3} width={BAR_W} height={h3} fill="var(--color-warn)" />
                )}

                {/* Метка X */}
                {i % labelEvery === 0 && (
                  <text
                    x={bx + BAR_W / 2}
                    y={BOTTOM + 16}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-muted)"
                  >
                    {fmtLabel(row.label)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <LegendItem color="var(--color-brand)" label={t("finance.channel.oneTime")} />
        <LegendItem color="var(--color-ok)" label={t("finance.channel.subscription")} />
        <LegendItem color="var(--color-warn)" label={t("finance.channel.package")} />
      </div>

      {/* Тултип — фиксированная позиция, поверх всего */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 min-w-[140px] rounded-lg border border-line bg-paper px-3 py-2 shadow-lg"
          style={{ left: tooltip.clientX + 14, top: tooltip.clientY - 100 }}
        >
          <p className="mb-1.5 text-xs font-semibold text-ink">{fmtLabel(tooltip.row.label)}</p>
          {tooltip.row.pkg > 0 && (
            <TooltipRow color="var(--color-warn)" label={t("finance.channel.package")} amount={tooltip.row.pkg} />
          )}
          {tooltip.row.subscription > 0 && (
            <TooltipRow color="var(--color-ok)" label={t("finance.channel.subscription")} amount={tooltip.row.subscription} />
          )}
          {tooltip.row.oneTime > 0 && (
            <TooltipRow color="var(--color-brand)" label={t("finance.channel.oneTime")} amount={tooltip.row.oneTime} />
          )}
          <p className="mt-1.5 border-t border-line pt-1.5 text-xs font-semibold text-ink">
            {amd(tooltip.row.total)}
          </p>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="text-muted">{label}</span>
    </div>
  );
}

function TooltipRow({ color, label, amount }: { color: string; label: string; amount: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="truncate text-muted">{label}</span>
      <span className="ml-auto pl-2 font-medium text-ink">{amd(amount)}</span>
    </div>
  );
}
