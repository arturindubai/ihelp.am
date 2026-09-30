"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Форма выбора произвольного диапазона дат для вкладки Финансы */
export function FinancePeriodPicker({
  current,
  from,
  to,
}: {
  current: Record<string, string>;
  from: string;
  to: string;
}) {
  const t = useTranslations("admin.cc.finance");
  const router = useRouter();
  const [pending, start] = useTransition();

  const apply = (newFrom: string, newTo: string) => {
    const next = { ...current, period: "custom", from: newFrom, to: newTo };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && k !== "tab") qs.set(k, v);
    start(() => router.push(`/admin/finance?${qs.toString()}`));
  };

  return (
    <form
      className="flex items-center gap-2"
      style={{ opacity: pending ? 0.6 : 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const f = (fd.get("from") as string) || from;
        const tt = (fd.get("to") as string) || to;
        apply(f, tt);
      }}
    >
      <input type="date" name="from" defaultValue={from} className="input h-9 text-sm" required />
      <span className="text-muted">—</span>
      <input type="date" name="to" defaultValue={to} className="input h-9 text-sm" required />
      <button type="submit" className="btn-outline btn-sm">
        {t("apply")}
      </button>
    </form>
  );
}
