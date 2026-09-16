"use client";
import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Plus, Copy, ExternalLink, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createServiceAction, deleteCategoryAction, deleteServiceAction, duplicateServiceAction, saveCategoryAction, toggleServiceAction } from "@/server/actions/admin/catalog";
import { tr } from "@/i18n/locales";
import { Sheet } from "@/components/ui/Sheet";
import { I18nInput, ImageInput, NumInput, TextInput, Toggle, type I18n } from "./fields";

type Cat = { id?: string; slug: string; title: I18n; description: I18n | null; image: string | null; sort: number; active: boolean; comingSoon: boolean; services?: Svc[] };
type Svc = { id: string; slug: string; title: string; image: string | null; active: boolean; orders: number; rating: number; reviews: number };

export function CatalogList({ categories }: { categories: Cat[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [edit, setEdit] = useState<Cat | null>(null);
  const [err, setErr] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [pending, start] = useTransition();

  const saveCat = () => start(async () => {
    if (!edit) return;
    const { services: _s, ...payload } = edit;
    const r = await saveCategoryAction(payload);
    if (!r.ok) return setErr(r.error === "slug" ? t("common.slugHint") : `${t("common.error")}: ${r.error}`);
    setEdit(null); router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className="btn-dark" onClick={() => { setErr(undefined); setEdit({ slug: "", title: {}, description: null, image: null, sort: categories.length + 1, active: true, comingSoon: false }); }}><Plus size={18} /> {t("services.newCategory")}</button>
      </div>
      {info && <p className="rounded-lg bg-warn-50 p-2 text-sm text-warn">{info}</p>}
      {categories.map((c) => (
        <section key={c.id} className="card">
          <div className="flex items-center gap-3 border-b border-line p-3">
            <img src={c.image || "/img/cat-cleaning.svg"} alt="" className="size-10 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{tr(c.title, locale)} <span className="text-xs font-normal text-muted">/{c.slug}</span></div>
              <div className="flex flex-wrap gap-1.5 text-xs whitespace-nowrap">
                {!c.active && <span className="chip">{t("common.inactive")}</span>}
                {c.comingSoon && <span className="chip">{t("services.comingSoon")}</span>}
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => { setErr(undefined); setEdit(c); }}><Pencil size={16} /></button>
            <button className="btn-outline btn-sm" disabled={pending} onClick={() => start(async () => { const r = await createServiceAction(c.id!); router.push(`/admin/services/${r.id}`); })}><Plus size={16} /> <span className="hidden sm:inline">{t("services.newService")}</span></button>
          </div>
          <ul className="divide-y divide-line">
            {c.services?.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
                <Link href={`/admin/services/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <img src={s.image || "/img/svc-regular.svg"} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0">
                    <span className="block font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-muted">/{s.slug} · {t("services.bookings")}: {s.orders}{s.reviews ? ` · ★ ${s.rating.toFixed(1)}` : ""}</span>
                  </span>
                </Link>
                <div className="flex items-center justify-between gap-2 sm:contents">
                <Toggle label={s.active ? t("common.active") : t("common.inactive")} checked={s.active} onChange={(v) => start(async () => { await toggleServiceAction(s.id, v); router.refresh(); })} />
                <div className="flex">
                  <Link className="btn-ghost btn-sm px-2" href={`/admin/services/${s.id}`} title={t("common.edit")}><Pencil size={16} /></Link>
                  <button className="btn-ghost btn-sm px-2" title={t("common.copy")} disabled={pending} onClick={() => start(async () => { const r = await duplicateServiceAction(s.id); router.push(`/admin/services/${r.id}`); })}><Copy size={16} /></button>
                  <a className="btn-ghost btn-sm px-2" href={`/${locale}/s/${s.slug}`} target="_blank" title={t("services.openOnSite")}><ExternalLink size={16} /></a>
                  <button className="btn-ghost btn-sm px-2 text-bad" title={t("common.delete")} disabled={pending} onClick={() => { if (confirm(t("common.deleteConfirm"))) start(async () => { const r = await deleteServiceAction(s.id); if (r.archived) setInfo(t("common.deleteBlocked")); router.refresh(); }); }}><Trash2 size={16} /></button>
                </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("common.edit") : t("services.newCategory")} footer={
        <div className="flex gap-2">
          {edit?.id && <button className="btn-danger" disabled={pending} onClick={() => { if (confirm(t("common.deleteConfirm"))) start(async () => { const r = await deleteCategoryAction(edit.id!); if (!r.ok) return setErr(t("services.categoryHasServices")); setEdit(null); router.refresh(); }); }}>{t("common.delete")}</button>}
          <button className="btn-primary flex-1" disabled={pending} onClick={saveCat}>{t("common.save")}</button>
        </div>
      }>
        {edit && (
          <div className="space-y-3">
            <I18nInput label={t("common.title")} required value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
            <TextInput label={t("common.slug")} hint={t("common.slugHint")} value={edit.slug} onChange={(v) => setEdit({ ...edit, slug: v })} />
            <I18nInput label={t("common.description")} multiline value={edit.description} onChange={(v) => setEdit({ ...edit, description: v })} />
            <ImageInput label={t("common.image")} value={edit.image} onChange={(v) => setEdit({ ...edit, image: v })} />
            <NumInput label={t("common.sort")} value={edit.sort} onChange={(v) => setEdit({ ...edit, sort: v ?? 0 })} />
            <Toggle label={t("common.active")} checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
            <Toggle label={t("services.comingSoon")} checked={edit.comingSoon} onChange={(v) => setEdit({ ...edit, comingSoon: v })} />
            {err && <p className="text-sm text-bad">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
