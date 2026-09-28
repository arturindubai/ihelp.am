"use client";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { saveUiStringAction } from "@/server/actions/admin/misc";
import { importTranslationsAction } from "@/server/actions/admin/translations";
import { cn } from "@/lib/format";

type Row = { key: string; def: Record<"ru" | "en" | "am", string>; ov: Record<"ru" | "en" | "am", string> };
type LangStats = { total: number; missing: number; missingKeys: string[] };
type ReportStats = { ru: LangStats; en: LangStats; am: LangStats };

const L = [["ru", "RU"], ["en", "ENG"], ["am", "ARM"]] as const;
const PAGE_SIZE = 20;
const MISSING_PREVIEW = 100;

export function TranslationsEditor({
  rows: initial,
  reportStats,
  telegramCount,
}: {
  rows: Row[];
  reportStats: ReportStats;
  telegramCount: number;
}) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<"editor" | "report">("editor");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-line">
        {(["editor", "report"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
              tab === id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {id === "editor" ? t("translations.tabEditor") : t("translations.tabReport")}
          </button>
        ))}
      </div>

      {tab === "editor" ? (
        <EditorTab rows={initial} />
      ) : (
        <ReportTab rows={initial} reportStats={reportStats} telegramCount={telegramCount} />
      )}
    </div>
  );
}

function EditorTab({ rows: initial }: { rows: Row[] }) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [missing, setMissing] = useState<"" | "en" | "am">("");
  const [savedKey, setSavedKey] = useState("");
  const [page, setPage] = useState(1);
  const sections = useMemo(() => [...new Set(initial.map((r) => r.key.split(".").slice(0, r.key.startsWith("admin.") ? 2 : 1).join(".")))], [initial]);
  const filtered = rows.filter((r) => {
    if (section && !r.key.startsWith(section + ".")) return false;
    if (missing && (r.def[missing] || r.ov[missing])) return false;
    if (q) { const s = q.toLowerCase(); return r.key.toLowerCase().includes(s) || Object.values(r.def).some((v) => v.toLowerCase().includes(s)) || Object.values(r.ov).some((v) => v.toLowerCase().includes(s)); }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetPage<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
    return (v: T) => { setter(v); setPage(1); };
  }

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
        <input className="input max-w-xs flex-1" placeholder={t("common.search")} value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
        <select className="input w-auto" value={section} onChange={(e) => resetPage(setSection)(e.target.value)}><option value="">{t("translations.section")}: {t("common.all")}</option>{sections.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input w-auto" value={missing} onChange={(e) => resetPage(setMissing)(e.target.value as "")}><option value="">—</option><option value="en">{t("translations.onlyMissing")} ENG</option><option value="am">{t("translations.onlyMissing")} ARM</option></select>
      </div>
      <p className="mb-2 text-xs text-muted">{filtered.length}</p>
      <div className="space-y-2">
        {pageRows.map((r) => (
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
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button className="btn-outline btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>{t("common.prev")}</button>
          <span className="text-muted">{t("common.page", { n: safePage })} / {totalPages}</span>
          <button className="btn-outline btn-sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</button>
        </div>
      )}
    </div>
  );
}

function ReportTab({
  rows,
  reportStats,
  telegramCount,
}: {
  rows: Row[];
  reportStats: ReportStats;
  telegramCount: number;
}) {
  const t = useTranslations("admin");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importLang, setImportLang] = useState<"en" | "am">("en");

  function langLabel(lang: "ru" | "en" | "am"): string {
    if (lang === "ru") return t("translations.langRu");
    if (lang === "en") return t("translations.langEn");
    return t("translations.langAm");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleExport(lang: "en" | "am") {
    const out: Record<string, string> = {};
    for (const row of rows) {
      out[row.key] = row.ov[lang] || row.def[lang] || "";
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `messages.${lang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const text = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setImportError(t("translations.importError"));
      return;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      setImportError(t("translations.importError"));
      return;
    }
    const flat = data as Record<string, unknown>;
    if (Object.values(flat).some((v) => typeof v === "object" && v !== null)) {
      setImportError(t("translations.importError"));
      return;
    }
    const result = await importTranslationsAction(importLang, flat);
    if (!result.ok) {
      setImportError(t("translations.importError"));
      return;
    }
    showToast(t("translations.importedN", { n: result.imported }));
    if (result.skipped > 0) showToast(t("translations.skippedN", { n: result.skipped }));
    if (importRef.current) importRef.current.value = "";
  }

  const langs: Array<"ru" | "en" | "am"> = ["ru", "en", "am"];

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("translations.reportTitle")}</h2>

      {/* Сводная таблица */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface/60 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t("translations.colLang")}</th>
              <th className="px-3 py-2 font-medium">{t("translations.colTotal")}</th>
              <th className="px-3 py-2 font-medium">{t("translations.colTranslated")}</th>
              <th className="px-3 py-2 font-medium">{t("translations.colMissing")}</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {langs.map((lang) => {
              const stats = reportStats[lang];
              const translated = stats.total - stats.missing;
              const isRu = lang === "ru";
              const status = isRu || stats.missing === 0 ? "ready" : translated === 0 ? "empty" : "partial";

              return (
                <tr
                  key={lang}
                  className={cn("cursor-pointer transition-colors hover:bg-surface/50", !isRu && stats.missing > 0 && "cursor-pointer")}
                  onClick={() => !isRu && stats.missing > 0 && setExpanded(expanded === lang ? null : lang)}
                >
                  <td className="px-3 py-3 font-medium">{langLabel(lang)}</td>
                  <td className="px-3 py-3 text-muted">{stats.total}</td>
                  <td className="px-3 py-3">{translated}</td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      status === "ready" && "bg-ok-50 text-ok",
                      status === "partial" && "bg-warn-50 text-warn",
                      status === "empty" && "bg-bad-50 text-bad",
                    )}>
                      {status === "ready" && t("translations.statusReady")}
                      {status === "partial" && `${stats.missing} — ${t("translations.statusPartial")}`}
                      {status === "empty" && t("translations.statusEmpty")}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {!isRu && (
                      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-outline btn-sm"
                          onClick={() => handleExport(lang as "en" | "am")}
                        >
                          {t("translations.exportJson")}
                        </button>
                        <button
                          className="btn-outline btn-sm"
                          onClick={() => { setImportLang(lang as "en" | "am"); importRef.current?.click(); }}
                        >
                          {t("translations.importBtn")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Скрытый input для импорта */}
      <input
        ref={importRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />

      {importError && (
        <p className="text-sm text-bad">{importError}</p>
      )}

      {/* Список пропущенных ключей */}
      {langs.filter((l) => l !== "ru").map((lang) => {
        if (expanded !== lang) return null;
        const stats = reportStats[lang];
        const preview = stats.missingKeys.slice(0, MISSING_PREVIEW);
        return (
          <div key={lang} className="card p-3">
            <div className="mb-2 text-sm font-medium">{t("translations.missingKeys")} — {langLabel(lang)}</div>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {preview.map((key) => {
                const ruValue = rows.find((r) => r.key === key)?.def.ru || "";
                return (
                  <div key={key} className="grid grid-cols-2 gap-2 py-0.5 text-xs border-b border-line/50 last:border-0">
                    <span className="font-mono text-muted truncate">{key}</span>
                    <span className="text-ink truncate" title={ruValue}>{ruValue}</span>
                  </div>
                );
              })}
            </div>
            {stats.missing > MISSING_PREVIEW && (
              <p className="mt-2 text-xs text-muted">
                {t("translations.showingOf", { n: MISSING_PREVIEW, total: stats.missing })}
              </p>
            )}
          </div>
        );
      })}

      {/* Информационный баннер */}
      <div className="rounded-xl bg-surface p-4 text-sm text-muted space-y-2">
        <div className="font-medium text-ink">{t("translations.externalTitle")}</div>
        <div>{t("translations.externalMail")}</div>
        <div>{t("translations.externalNotify", { n: telegramCount })}</div>
        <div>{t("translations.externalDb")}</div>
      </div>

      {/* Тост */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl bg-ink px-4 py-2 text-sm text-inverse shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
