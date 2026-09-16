"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { saveUiStringAction } from "@/server/actions/admin/misc";
import { cn } from "@/lib/format";

type Row = { key: string; def: Record<"ru" | "en" | "am", string>; ov: Record<"ru" | "en" | "am", string> };
const L = [["ru", "RU"], ["en", "ENG"], ["am", "ARM"]] as const;

export function TranslationsEditor({ rows: initial }: { rows: Row[] }) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [missing, setMissing] = useState<"" | "en" | "am">("");
  const [savedKey, setSavedKey] = useState("");
  const [limit, setLimit] = useState(80);
  const sections = useMemo(() => [...new Set(initial.map((r) => r.key.split(".").slice(0, r.key.startsWith("admin.") ? 2 : 1).join(".")))], [initial]);
  const filtered = rows.filter((r) => {
    if (section && !r.key.startsWith(section + ".")) return false;
    if (missing && (r.def[missing] || r.ov[missing])) return false;
    if (q) { const s = q.toLowerCase(); return r.key.toLowerCase().includes(s) || Object.values(r.def).some((v) => v.toLowerCase().includes(s)) || Object.values(r.ov).some((v) => v.toLowerCase().includes(s)); }
    return true;
  });

  async function save(key: string, lang: "ru" | "en" | "am", value: string) {
    const row = rows.find((r) => r.key === key)!;
    if (row.ov[lang] === value) return;
    const v = value === row.def[lang] ? "" : value;
    await saveUiStringAction(lang, key, v);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ov: { ...r.ov, [lang]: v } } : r)));
    setSavedKey(`${key}:${lang}`);
    setTimeout(() => setSavedKey(""), 1500);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs flex-1" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="">{t("translations.section")}: {t("common.all")}</option>{sections.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input w-auto" value={missing} onChange={(e) => setMissing(e.target.value as "")}><option value="">—</option><option value="en">{t("translations.onlyMissing")} ENG</option><option value="am">{t("translations.onlyMissing")} ARM</option></select>
      </div>
      <p className="mb-2 text-xs text-muted">{filtered.length}</p>
      <div className="space-y-2">
        {filtered.slice(0, limit).map((r) => (
          <div key={r.key} className="card p-3">
            <div className="mb-2 font-mono text-[11px] text-muted">{r.key}</div>
            <div className="grid gap-2 md:grid-cols-3">
              {L.map(([lang, label]) => {
                const value = r.ov[lang] || r.def[lang];
                return (
                  <div key={lang} className="relative">
                    <span className={cn("absolute top-2 right-2 text-[10px] font-semibold", r.ov[lang] ? "text-brand" : "text-muted")}>{savedKey === `${r.key}:${lang}` ? "✓" : label}</span>
                    <textarea
                      key={value}
                      defaultValue={value}
                      placeholder={lang === "ru" ? "" : r.ov.ru || r.def.ru}
                      rows={Math.min(4, Math.ceil((value || r.def.ru).length / 40) || 1)}
                      className={cn("input min-h-10 py-2 pr-10 text-sm", !value && lang !== "ru" && "border-dashed")}
                      onBlur={(e) => save(r.key, lang, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {filtered.length > limit && <button className="btn-outline mt-3 w-full" onClick={() => setLimit((l) => l + 100)}>+100</button>}
    </div>
  );
}
