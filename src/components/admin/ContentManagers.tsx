"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, ExternalLink } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteBannerAction, deletePageAction, saveBannerAction, savePageAction, type BannerPayload } from "@/server/actions/admin/misc";
import { tr } from "@/i18n/locales";
import { Sheet } from "@/components/ui/Sheet";
import { I18nInput, ImageInput, NumInput, TextInput, Toggle, type I18n } from "./fields";

export function BannerManager({ banners }: { banners: { id: string; data: BannerPayload }[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; data: BannerPayload } | null>(null);
  const [pending, start] = useTransition();
  const d = edit?.data;
  const up = (p: Partial<BannerPayload>) => edit && setEdit({ ...edit, data: { ...edit.data, ...p } });
  return (
    <div>
      <button className="btn-dark mb-3" onClick={() => setEdit({ id: null, data: { title: {}, subtitle: {}, image: null, link: "", promoCode: "", bg: "#1c1917", active: true, sort: banners.length } })}><Plus size={18} /> {t("banners.newBanner")}</button>
      <div className="space-y-2">
        {banners.map((b) => (
          <button key={b.id} onClick={() => setEdit(b)} className={`flex h-24 w-full flex-col justify-end overflow-hidden rounded-2xl p-3 text-left text-white ${b.data.active ? "" : "opacity-50"}`} style={{ background: b.data.bg || "#1c1917" }}>
            <span className="text-lg font-bold">{tr(b.data.title, locale)}</span>
            <span className="text-sm opacity-80">{tr(b.data.subtitle, locale)}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t("banners.title")} footer={
        <div className="flex gap-2">
          {edit?.id && <button className="btn-danger" disabled={pending} onClick={() => confirm(t("common.deleteConfirm")) && start(async () => { await deleteBannerAction(edit.id!); setEdit(null); router.refresh(); })}>{t("common.delete")}</button>}
          <button className="btn-primary flex-1" disabled={pending} onClick={() => start(async () => { await saveBannerAction(edit!.id, edit!.data); setEdit(null); router.refresh(); })}>{t("common.save")}</button>
        </div>
      }>
        {d && (
          <div className="space-y-3">
            <div className="flex h-28 flex-col justify-end rounded-2xl p-3 text-white" style={{ background: d.bg || "#1c1917" }}><span className="text-lg font-bold">{tr(d.title, locale) || "…"}</span><span className="text-sm opacity-80">{tr(d.subtitle, locale)}</span></div>
            <I18nInput label={t("common.title")} value={d.title} onChange={(v) => up({ title: v })} />
            <I18nInput label={t("common.subtitle")} value={d.subtitle} onChange={(v) => up({ subtitle: v })} />
            <TextInput label={t("banners.link")} placeholder="/s/regular-cleaning" value={d.link} onChange={(v) => up({ link: v })} />
            <TextInput label={t("banners.promoCode")} value={d.promoCode} onChange={(v) => up({ promoCode: v.toUpperCase() })} />
            <div><label className="label">{t("banners.bg")}</label><input type="color" className="h-11 w-20 rounded-lg border border-line" value={d.bg || "#1c1917"} onChange={(e) => up({ bg: e.target.value })} /></div>
            <ImageInput label={t("common.image")} value={d.image} onChange={(v) => up({ image: v })} />
            <NumInput label={t("common.sort")} value={d.sort} onChange={(v) => up({ sort: v ?? 0 })} />
            <Toggle label={t("common.active")} checked={d.active} onChange={(v) => up({ active: v })} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

type PageData = { slug: string; title: I18n; body: I18n; active: boolean };
export function PageManager({ pages }: { pages: { id: string; data: PageData }[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; data: PageData } | null>(null);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const d = edit?.data;
  const up = (p: Partial<PageData>) => edit && setEdit({ ...edit, data: { ...edit.data, ...p } });
  return (
    <div>
      <button className="btn-dark mb-3" onClick={() => setEdit({ id: null, data: { slug: "", title: {}, body: {}, active: true } })}><Plus size={18} /> {t("pages.newPage")}</button>
      <div className="card divide-y divide-line">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center gap-2 p-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => { setErr(undefined); setEdit(p); }}><div className="font-medium">{tr(p.data.title, locale)}</div><div className="text-xs text-muted">/p/{p.data.slug}</div></button>
            <a href={`/${locale}/p/${p.data.slug}`} target="_blank" className="btn-ghost btn-sm px-2"><ExternalLink size={16} /></a>
          </div>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t("pages.title")} footer={
        <div className="flex gap-2">
          {edit?.id && <button className="btn-danger" disabled={pending} onClick={() => confirm(t("common.deleteConfirm")) && start(async () => { await deletePageAction(edit.id!); setEdit(null); router.refresh(); })}>{t("common.delete")}</button>}
          <button className="btn-primary flex-1" disabled={pending} onClick={() => start(async () => { const r = await savePageAction(edit!.id, edit!.data); if (!r.ok) return setErr(t("common.slugHint")); setEdit(null); router.refresh(); })}>{t("common.save")}</button>
        </div>
      }>
        {d && (
          <div className="space-y-3">
            <TextInput label={t("common.slug")} hint={t("common.slugHint")} value={d.slug} onChange={(v) => up({ slug: v })} />
            <I18nInput label={t("common.title")} value={d.title} onChange={(v) => up({ title: v })} />
            <I18nInput label={t("pages.body")} multiline value={d.body} onChange={(v) => up({ body: v })} />
            <Toggle label={t("common.active")} checked={d.active} onChange={(v) => up({ active: v })} />
            {err && <p className="text-sm text-bad">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
