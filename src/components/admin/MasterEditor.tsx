"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Plus, ExternalLink } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteMasterAction, saveMasterAction, type MasterPayload } from "@/server/actions/admin/masters";
import { tr } from "@/i18n/locales";
import { addDays, ymd } from "@/lib/time";
import { Card, I18nInput, ImageInput, NumInput, RowTools, SaveBar, TextInput, Toggle } from "./fields";

const LANGS = ["hy", "ru", "en"];

export function MasterEditor({ id, initial, services, stats }: { id: string | null; initial: MasterPayload; services: { id: string; title: string }[]; stats: { rating: number; reviews: number; jobs: number; linked: boolean; slug: string } | null }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [m, setM] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const up = (p: Partial<MasterPayload>) => { setM((x) => ({ ...x, ...p })); setSaved(false); };
  const days = t("masters.weekdays").split(",");

  const save = () => start(async () => {
    setError(undefined);
    const payload = { ...m, slug: m.slug || (m.name.en || m.name.ru || "master").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `master-${Date.now().toString(36)}` };
    const r = await saveMasterAction(id, payload);
    if (!r.ok) return setError(r.error === "slug" ? `${t("common.slug")}: ${t("common.slugHint")}` : r.error === "phone" ? t("masters.phone") : `${t("common.error")}: ${r.error}`);
    setSaved(true);
    if (!id) router.replace(`/admin/masters/${r.id}`);
    else router.refresh();
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/admin/masters" className="btn-ghost btn-sm px-2"><ArrowLeft size={18} /></Link>
        <h1 className="flex-1 truncate text-2xl font-bold">{tr(m.name, locale) || t("masters.newMaster")}</h1>
        {stats && <a href={`/${locale}/masters/${stats.slug}`} target="_blank" className="btn-outline btn-sm"><ExternalLink size={16} /> <span className="hidden sm:inline">{t("masters.publicProfile")}</span></a>}
      </div>
      {stats && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="card p-2"><div className="font-bold">{stats.reviews ? stats.rating.toFixed(2) : "—"}</div><div className="text-xs text-muted">{t("masters.rating")} ({stats.reviews})</div></div>
          <div className="card p-2"><div className="font-bold">{stats.jobs}</div><div className="text-xs text-muted">{t("masters.jobs")}</div></div>
          <div className="card p-2"><div className="font-bold">{stats.linked ? "✓" : "—"}</div><div className="text-xs text-muted">{stats.linked ? t("masters.linked") : t("masters.notLinked")}</div></div>
        </div>
      )}
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <I18nInput label={t("masters.name")} required value={m.name} onChange={(v) => up({ name: v })} />
            <TextInput label={t("common.slug")} hint={t("common.slugHint")} value={m.slug} onChange={(v) => up({ slug: v })} />
            <div className="md:col-span-2"><I18nInput label={t("masters.bio")} multiline value={m.bio} onChange={(v) => up({ bio: v })} /></div>
            <ImageInput label={t("common.image")} value={m.photo} onChange={(v) => up({ photo: v })} />
            <TextInput label={t("masters.phone")} hint={t("masters.phoneHint")} type="tel" value={m.phone} onChange={(v) => up({ phone: v })} />
            <NumInput label={t("masters.experience")} value={m.experienceYears} onChange={(v) => up({ experienceYears: v ?? 0 })} />
            <NumInput label={t("common.sort")} value={m.sort} onChange={(v) => up({ sort: v ?? 0 })} />
            <div>
              <label className="label">{t("masters.languages")}</label>
              <div className="flex gap-3">{LANGS.map((l) => <label key={l} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={m.languages.includes(l)} onChange={(e) => up({ languages: e.target.checked ? [...m.languages, l] : m.languages.filter((x) => x !== l) })} /> {tc(`langNames.${l}`)}</label>)}</div>
            </div>
            <div className="pt-5"><Toggle label={t("common.active")} checked={m.active} onChange={(v) => up({ active: v })} /></div>
          </div>
        </Card>
        <Card title={t("masters.skills")}>
          <div className="grid gap-1 sm:grid-cols-2">
            {services.map((s) => <label key={s.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" className="size-4" checked={m.skills.includes(s.id)} onChange={(e) => up({ skills: e.target.checked ? [...m.skills, s.id] : m.skills.filter((x) => x !== s.id) })} /> {s.title}</label>)}
          </div>
        </Card>
        <Card title={t("masters.hours")}>
          <div className="divide-y divide-line">
            {days.map((name, i) => {
              const key = String(i + 1);
              const win = m.workingHours[key] || [];
              const on = win.length > 0;
              return (
                <div key={key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-28 text-sm font-medium">{name}</span>
                  <Toggle label={on ? "" : t("masters.dayOff")} checked={on} onChange={(v) => up({ workingHours: { ...m.workingHours, [key]: v ? [["09:00", "19:00"]] : [] } })} />
                  {win.map(([a, b], wi) => (
                    <span key={wi} className="flex items-center gap-1">
                      <input type="time" className="input min-h-9 w-28 py-1" value={a} onChange={(e) => up({ workingHours: { ...m.workingHours, [key]: win.map((w, j) => (j === wi ? [e.target.value, w[1]] : w)) as [string, string][] } })} />
                      –
                      <input type="time" className="input min-h-9 w-28 py-1" value={b} onChange={(e) => up({ workingHours: { ...m.workingHours, [key]: win.map((w, j) => (j === wi ? [w[0], e.target.value] : w)) as [string, string][] } })} />
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title={t("masters.timeOff")}>
          <div className="space-y-2">
            {m.timeOff.map((o, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <TextInput label={t("common.from")} type="date" value={o.from} onChange={(v) => up({ timeOff: m.timeOff.map((x, j) => (j === i ? { ...x, from: v } : x)) })} />
                <TextInput label={t("common.to")} type="date" value={o.to} onChange={(v) => up({ timeOff: m.timeOff.map((x, j) => (j === i ? { ...x, to: v } : x)) })} />
                <TextInput className="min-w-40 flex-1" label={t("masters.reason")} value={o.reason} onChange={(v) => up({ timeOff: m.timeOff.map((x, j) => (j === i ? { ...x, reason: v } : x)) })} />
                <RowTools onDelete={() => up({ timeOff: m.timeOff.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => up({ timeOff: [...m.timeOff, { from: ymd(new Date()), to: addDays(ymd(new Date()), 7), reason: "" }] })}><Plus size={14} /> {t("masters.addTimeOff")}</button>
          </div>
        </Card>
        {id && <button className="btn-danger" disabled={pending} onClick={() => { if (confirm(t("common.deleteConfirm"))) start(async () => { const r = await deleteMasterAction(id); if (r.archived) alert(t("common.deleteBlocked")); router.push("/admin/masters"); }); }}>{t("common.delete")}</button>}
      </div>
      <SaveBar onSave={save} pending={pending} saved={saved} error={error} />
    </div>
  );
}
