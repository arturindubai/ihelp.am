"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/format";

export type I18n = { ru?: string; en?: string; am?: string };
const LANGS = [["ru", "RU"], ["en", "ENG"], ["am", "ARM"]] as const;

export function I18nInput({ label, value, onChange, multiline, required, placeholder }: { label?: string; value: I18n | null | undefined; onChange: (v: I18n) => void; multiline?: boolean; required?: boolean; placeholder?: string }) {
  const [lang, setLang] = useState<"ru" | "en" | "am">("ru");
  const v = value || {};
  const Input = multiline ? "textarea" : "input";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        {label && <label className="text-sm font-medium">{label}{required && " *"}</label>}
        <div className="ml-auto flex rounded-md bg-surface p-0.5 text-[11px] font-semibold">
          {LANGS.map(([k, l]) => (
            <button type="button" key={k} onClick={() => setLang(k)} className={cn("rounded px-1.5 py-0.5", lang === k ? "bg-paper shadow-sm" : "text-muted", k !== "ru" && !v[k] && "opacity-60")}>
              {l}{k !== "ru" && v[k] ? " ✓" : ""}
            </button>
          ))}
        </div>
      </div>
      <Input
        className={cn("input", multiline && "min-h-24 py-2")}
        value={v[lang] || ""}
        placeholder={lang !== "ru" ? v.ru || placeholder : placeholder}
        required={required && lang === "ru"}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...v, [lang]: e.target.value })}
      />
    </div>
  );
}

export function TextInput({ label, value, onChange, type = "text", hint, required, className, ...rest }: { label?: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string; hint?: string; required?: boolean; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && " *"}</label>}
      <input className="input" type={type} value={value ?? ""} required={required} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function NumInput({ label, value, onChange, hint, className, step }: { label?: string; value: number | null | undefined; onChange: (v: number | null) => void; hint?: string; className?: string; step?: number }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <input className="input" type="number" inputMode="decimal" step={step ?? 1} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-ok" : "bg-line")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-inverse shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function ImageInput({ label, value, onChange }: { label?: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const t = useTranslations("admin.common");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="size-20 rounded-xl border border-line object-cover" /> : <div className="grid size-20 place-items-center rounded-xl border border-dashed border-line text-muted"><ImagePlus size={22} /></div>}
        <div className="flex flex-col gap-1.5">
          <label className="btn-outline btn-sm cursor-pointer">
            {busy ? t("uploading") : t("upload")}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true); setErr(undefined);
              const fd = new FormData(); fd.append("file", f);
              const r = await fetch("/api/upload", { method: "POST", body: fd });
              const j = await r.json();
              setBusy(false);
              if (j.url) onChange(j.url); else setErr(j.error);
            }} />
          </label>
          {value && <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => onChange(null)}><X size={14} /> {t("removeImage")}</button>}
          {err && <span className="text-xs text-bad">{err}</span>}
        </div>
      </div>
    </div>
  );
}

export function RowTools({ onUp, onDown, onDelete }: { onUp?: () => void; onDown?: () => void; onDelete?: () => void }) {
  const t = useTranslations("admin.common");
  return (
    <div className="flex items-center gap-0.5">
      {onUp && <button type="button" className="btn-ghost btn-sm px-2" title={t("up")} onClick={onUp}><ArrowUp size={15} /></button>}
      {onDown && <button type="button" className="btn-ghost btn-sm px-2" title={t("down")} onClick={onDown}><ArrowDown size={15} /></button>}
      {onDelete && <button type="button" className="btn-ghost btn-sm px-2 text-bad" title={t("delete")} onClick={onDelete}><Trash2 size={15} /></button>}
    </div>
  );
}

export function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

export function Card({ title, children, actions, className }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card p-4", className)}>
      {(title || actions) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="h3">{title}</h2>{actions}</div>}
      {children}
    </section>
  );
}

export function SaveBar({ onSave, pending, saved, error, extra }: { onSave: () => void; pending: boolean; saved?: boolean; error?: string; extra?: React.ReactNode }) {
  const t = useTranslations("admin.common");
  return (
    <div className="pb-safe sticky bottom-0 z-20 -mx-4 mt-4 flex items-center gap-2 border-t border-line bg-paper/95 px-4 pt-3 backdrop-blur md:mx-0 md:rounded-xl md:border md:pb-3">
      {extra}
      <span className="ml-auto text-sm">{error ? <span className="text-bad">{error}</span> : saved ? <span className="text-ok">{t("saved")}</span> : null}</span>
      <button type="button" className="btn-primary min-w-32" disabled={pending} onClick={onSave}>{pending ? t("saving") : t("save")}</button>
    </div>
  );
}
