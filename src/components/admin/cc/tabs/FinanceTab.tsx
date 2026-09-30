import { getTranslations } from "next-intl/server";
import { getFinanceStats } from "@/server/services/finance";
import { Card } from "@/components/admin/fields";
import { FinancePeriodPicker } from "@/components/admin/cc/FinancePeriodPicker";
import { amd, cn } from "@/lib/format";
import { ymd, addDays } from "@/lib/time";
import { Link } from "@/i18n/navigation";
import type { CcSearch } from "./shared";
import type { MasterRankRow, CashSummary, PeriodStats } from "@/server/services/finance";

type Period = "today" | "7d" | "30d" | "custom";

const PERIODS: Period[] = ["today", "7d", "30d", "custom"];

function resolvePeriod(sp: CcSearch): { period: Period; from: string; to: string } {
  const today = ymd(new Date());
  const raw = sp.period as Period | undefined;
  const period: Period = PERIODS.includes(raw!) ? raw! : "today";

  if (period === "7d") return { period, from: addDays(today, -6), to: today };
  if (period === "30d") return { period, from: addDays(today, -29), to: today };
  if (period === "custom") {
    const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
    const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    return { period, ...ordered };
  }
  return { period: "today", from: today, to: today };
}

function periodLink(sp: CcSearch, period: Period): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v && k !== "period" && k !== "from" && k !== "to") next[k] = v;
  next.tab = "finance";
  next.period = period;
  return `/admin/control?${new URLSearchParams(next).toString()}`;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const pos = value >= 0;
  return (
    <span className={cn("text-xs font-medium", pos ? "text-ok" : "text-bad")}>
      {pos ? "↑" : "↓"} {Math.abs(value)}%
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function ChannelCard({ label, amount, total, count }: { label: string; amount: number; total: number; count: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{amd(amount)}</p>
      <p className="mt-1 text-xs text-muted">
        {pct}% · {count}
      </p>
    </div>
  );
}

function EmptyPeriod({ message }: { message: string }) {
  return <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted">{message}</p>;
}

function CashBlock({
  cash,
  t,
}: {
  cash: CashSummary;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (k: any, v?: any) => string;
}) {
  if (cash.masters.length === 0) return null;
  return (
    <div className="rounded-xl border border-warn-50 bg-warn-50 p-4">
      <h2 className="h3 mb-1">{t("finance.cashTitle")}</h2>
      <p className="mb-3 text-xs text-muted">{t("finance.cashHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-1.5 text-left font-medium">{t("finance.master")}</th>
              <th className="pb-1.5 text-right font-medium">{t("finance.cashOrders")}</th>
              <th className="pb-1.5 text-right font-medium">{t("finance.toCollect")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cash.masters.map((m) => (
              <tr key={m.masterId}>
                <td className="max-w-[12rem] truncate py-2" title={m.masterName ?? undefined}>
                  {m.masterName || t("finance.noName")}
                </td>
                <td className="py-2 text-right">{m.ordersCount}</td>
                <td className="py-2 text-right font-medium">{amd(m.toCollect)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-warn text-sm font-semibold">
              <td className="pt-2">{t("finance.total")}</td>
              <td className="pt-2 text-right">{cash.masters.reduce((s, m) => s + m.ordersCount, 0)}</td>
              <td className="pt-2 text-right">{amd(cash.totalToCollect)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MastersTable({
  masters,
  t,
}: {
  masters: MasterRankRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (k: any, v?: any) => string;
}) {
  if (masters.length === 0) return null;
  return (
    <>
      {/* Таблица на компьютере */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-1.5 text-left font-medium">#</th>
              <th className="pb-1.5 text-left font-medium">{t("finance.master")}</th>
              <th className="pb-1.5 text-right font-medium">{t("finance.revenue")}</th>
              <th className="pb-1.5 text-right font-medium">{t("finance.ordersCount")}</th>
              <th className="pb-1.5 text-right font-medium">{t("finance.avgCheck")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {masters.map((m, i) => (
              <tr key={m.masterId}>
                <td className="py-2 font-mono text-xs text-muted">{i + 1}</td>
                <td className="max-w-[12rem] truncate py-2" title={m.masterName ?? undefined}>
                  {m.masterName || t("finance.noName")}
                </td>
                <td className="py-2 text-right font-medium">{amd(m.revenue)}</td>
                <td className="py-2 text-right">{m.ordersCount}</td>
                <td className="py-2 text-right text-muted">{amd(m.avgCheck)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Карточки на телефоне */}
      <div className="space-y-2 lg:hidden">
        {masters.map((m, i) => (
          <div key={m.masterId} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
            <span className="w-5 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={m.masterName ?? undefined}>
              {m.masterName || t("finance.noName")}
            </span>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold">{amd(m.revenue)}</p>
              <p className="text-xs text-muted">{m.ordersCount} · ⌀ {amd(m.avgCheck)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StatsSection({ stats, t }: { stats: PeriodStats; t: (k: any, v?: any) => string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <KpiCard
        label={t("finance.revenue")}
        value={amd(stats.revenue)}
        sub={<Delta value={stats.revenueDelta} />}
      />
      <KpiCard label={t("finance.avgCheck")} value={stats.ordersCount > 0 ? amd(stats.avgCheck) : "—"} />
      <KpiCard label={t("finance.ordersCount")} value={stats.ordersCount} />
      <KpiCard
        label={t("finance.conversion")}
        value="—"
        sub={<span className="text-xs text-muted">{t("finance.conversionNa")}</span>}
      />
    </div>
  );
}

/**
 * Вкладка «Финансы» в Control Center: период, KPI-карточки, каналы, наличные, топ-мастеров.
 * Данные из DEV-133 (finance service). Части 3 (график) и 7 (транзакции) — DEV-135, DEV-136.
 */
export async function FinanceTab({ sp }: { sp: CcSearch }) {
  const t = await getTranslations("admin.cc");
  const { period, from, to } = resolvePeriod(sp);

  let data: Awaited<ReturnType<typeof getFinanceStats>> | null = null;
  let error = false;
  try {
    data = await getFinanceStats(from, to);
  } catch {
    error = true;
  }

  const isEmpty = data && data.stats.ordersCount === 0;

  return (
    <div className="space-y-4">
      {/* Панель периода */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex flex-nowrap gap-1">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={periodLink(sp, p)}
                className={cn(
                  "chip shrink-0",
                  period === p ? "bg-ink text-inverse" : "bg-surface text-ink hover:bg-surface",
                )}
              >
                {t(`finance.period.${p}`)}
              </Link>
            ))}
          </div>
        </div>
        {period === "custom" && (
          <FinancePeriodPicker current={Object.fromEntries(Object.entries(sp).filter(([, v]) => !!v) as [string, string][])} from={from} to={to} />
        )}
      </div>

      {/* Ошибка загрузки */}
      {error && (
        <p className="rounded-xl bg-bad-50 px-4 py-3 text-sm text-bad">{t("finance.loadError")}</p>
      )}

      {/* Данные */}
      {data && (
        <>
          {/* Пустое состояние */}
          {isEmpty ? (
            <EmptyPeriod message={t("finance.empty")} />
          ) : (
            <>
              {/* KPI */}
              <StatsSection stats={data.stats} t={t} />

              {/* Каналы */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
                <ChannelCard
                  label={t("finance.channel.oneTime")}
                  amount={data.stats.byChannel.oneTime}
                  total={data.stats.revenue}
                  count={0}
                />
                <ChannelCard
                  label={t("finance.channel.subscription")}
                  amount={data.stats.byChannel.subscription}
                  total={data.stats.revenue}
                  count={0}
                />
                <ChannelCard
                  label={t("finance.channel.package")}
                  amount={data.stats.byChannel.package}
                  total={data.stats.revenue}
                  count={0}
                />
              </div>
            </>
          )}

          {/* Наличные — показываем даже в пустом состоянии, если есть мастера */}
          {data.cash.masters.length > 0 && (
            <CashBlock cash={data.cash} t={t} />
          )}

          {/* Топ мастеров */}
          {data.masters.length > 0 && (
            <Card title={t("finance.mastersTitle")}>
              <MastersTable masters={data.masters} t={t} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
