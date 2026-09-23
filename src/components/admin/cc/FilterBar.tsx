"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export interface FilterDef {
  key: string;
  label: string;
  options: Record<string, string>;
}

/** Компактная строка фильтров — выпадающие списки вместо стены чипов. Значение "" снимает фильтр */
export function FilterBar({ current, defs, epics }: { current: Record<string, string>; defs: FilterDef[]; epics: { key: string; title: string }[] }) {
  const t = useTranslations("admin.cc");
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (patch: Record<string, string>) => {
    const next = { ...current, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    start(() => router.push(`/admin/control${qs.toString() ? `?${qs}` : ""}`));
  };

  const hasFilters = defs.some((d) => current[d.key]) || current.epicKey || current.q;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2" style={{ opacity: pending ? 0.6 : 1 }}>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const q = (new FormData(e.currentTarget).get("q") as string) || "";
          go({ q });
        }}
      >
        <input name="q" defaultValue={current.q ?? ""} placeholder={t("search")} className="input h-9 w-40 py-1 text-sm" />
      </form>
      {defs.map((d) => (
        <select key={d.key} className="input h-9 w-auto max-w-[10rem] py-1 text-sm" value={current[d.key] ?? ""} onChange={(e) => go({ [d.key]: e.target.value })}>
          <option value="">{d.label}</option>
          {Object.entries(d.options).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      ))}
      <select className="input h-9 w-auto max-w-[10rem] py-1 text-sm" value={current.epicKey ?? ""} onChange={(e) => go({ epicKey: e.target.value })}>
        <option value="">{t("epic")}</option>
        <option value="none">{t("form.noEpic")}</option>
        {epics.map((e) => (
          <option key={e.key} value={e.key}>
            {e.title}
          </option>
        ))}
      </select>
      {hasFilters && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => go({ q: "", epicKey: "", ...Object.fromEntries(defs.map((d) => [d.key, ""])) })}>
          {t("reset")}
        </button>
      )}
    </div>
  );
}
