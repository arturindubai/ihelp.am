"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteServiceAction, saveServiceAction, type ServicePayload } from "@/server/actions/admin/catalog";
import { calculatePrice, type PricingRules } from "@/lib/pricing";
import { amd, cn, durationLabel } from "@/lib/format";
import { tr } from "@/i18n/locales";
import { ICON_NAMES, Icon } from "@/components/Icon";
import { Card, I18nInput, ImageInput, NumInput, RowTools, SaveBar, TextInput, Toggle, move } from "./fields";

type G = ServicePayload["groups"][number];
type O = G["options"][number];
type P = ServicePayload["plans"][number];

export function ServiceEditor({ id, initial, categories, masters, rules }: { id: string; initial: ServicePayload; categories: { id: string; title: string }[]; masters: { id: string; name: string; active: boolean }[]; rules: PricingRules }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [s, setS] = useState<ServicePayload>(initial);
  const [tab, setTab] = useState<"main" | "options" | "plans" | "content">("main");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const up = (patch: Partial<ServicePayload>) => { setS((x) => ({ ...x, ...patch })); setSaved(false); };
  const setGroup = (gi: number, patch: Partial<G>) => up({ groups: s.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const setOpt = (gi: number, oi: number, patch: Partial<O>) => setGroup(gi, { options: s.groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const setPlan = (pi: number, patch: Partial<P>) => up({ plans: s.plans.map((p, i) => (i === pi ? { ...p, ...patch } : p)) });
  const c = s.content;
  const setContent = (patch: Partial<ServicePayload["content"]>) => up({ content: { ...c, ...patch } });

  const save = () => start(async () => {
    setError(undefined);
    const r = await saveServiceAction(id, s);
    if (!r.ok) return setError(r.error === "slug" ? `${t("common.slug")}: ${t("common.slugHint")}` : `${t("common.error")} — ${r.error}`);
    setSaved(true);
    router.refresh();
  });

  // Пример цены по тарифам на варианте длительности по умолчанию
  const durGroup = s.groups.find((g) => g.isDuration);
  const sampleOpt = durGroup?.options.find((o) => o.isDefault) || durGroup?.options[0];

  const tabs = [["main", t("services.tabs.main")], ["options", t("services.tabs.options")], ["plans", t("services.tabs.plans")], ["content", t("services.tabs.content")]] as const;

  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/admin/services" className="btn-ghost btn-sm px-2"><ArrowLeft size={18} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{tr(s.title, locale) || "—"}</h1>
        <a href={`/${locale}/s/${initial.slug}`} target="_blank" className="btn-outline btn-sm"><ExternalLink size={16} /> <span className="hidden sm:inline">{t("services.openOnSite")}</span></a>
      </div>
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap", tab === k ? "bg-ink text-white" : "text-muted")}>{l}</button>)}
      </div>

      {tab === "main" && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><I18nInput label={t("common.title")} required value={s.title} onChange={(v) => up({ title: v })} /></div>
              <div className="md:col-span-2"><I18nInput label={t("common.subtitle")} value={s.subtitle} onChange={(v) => up({ subtitle: v })} /></div>
              <div className="md:col-span-2"><I18nInput label={t("common.description")} multiline value={s.description} onChange={(v) => up({ description: v })} /></div>
              <TextInput label={t("common.slug")} hint={t("common.slugHint")} value={s.slug} onChange={(v) => up({ slug: v })} />
              <div><label className="label">{t("services.category")}</label><select className="input" value={s.categoryId} onChange={(e) => up({ categoryId: e.target.value })}>{categories.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
              <NumInput label={t("common.sort")} value={s.sort} onChange={(v) => up({ sort: v ?? 0 })} />
              <div className="pt-6"><Toggle label={t("common.active")} checked={s.active} onChange={(v) => up({ active: v })} /></div>
              <ImageInput label={t("common.image")} value={s.image} onChange={(v) => up({ image: v })} />
              <ImageInput label={t("services.banner")} value={s.bannerImage} onChange={(v) => up({ bannerImage: v })} />
            </div>
          </Card>
          <Card title={t("services.masters")}>
            <div className="grid gap-1 sm:grid-cols-2">
              {masters.map((m) => (
                <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="size-4" checked={s.masterIds.includes(m.id)} onChange={(e) => up({ masterIds: e.target.checked ? [...s.masterIds, m.id] : s.masterIds.filter((x) => x !== m.id) })} />
                  {m.name}{!m.active && <span className="text-xs text-muted">({t("common.archived")})</span>}
                </label>
              ))}
            </div>
          </Card>
          <button className="btn-danger" disabled={pending} onClick={() => { if (confirm(t("common.deleteConfirm"))) start(async () => { const r = await deleteServiceAction(id); if (r.archived) alert(t("common.deleteBlocked")); router.push("/admin/services"); }); }}>{t("services.deleteService")}</button>
        </div>
      )}

      {tab === "options" && (
        <div className="space-y-4">
          {s.groups.map((g, gi) => (
            <Card key={g.id || `new-${gi}`} title={`${gi + 1}. ${tr(g.title, locale) || t("services.group")}`} actions={<RowTools onUp={gi ? () => up({ groups: move(s.groups, gi, -1) }) : undefined} onDown={gi < s.groups.length - 1 ? () => up({ groups: move(s.groups, gi, 1) }) : undefined} onDelete={() => confirm(t("common.deleteConfirm")) && up({ groups: s.groups.filter((_, i) => i !== gi) })} />}>
              <div className="grid gap-3 md:grid-cols-2">
                <I18nInput label={t("services.groupTitle")} required value={g.title} onChange={(v) => setGroup(gi, { title: v })} />
                <I18nInput label={t("services.hint")} value={g.hint} onChange={(v) => setGroup(gi, { hint: v })} />
                <I18nInput label={t("services.infoTitle")} value={g.infoTitle} onChange={(v) => setGroup(gi, { infoTitle: v })} />
                <I18nInput label={t("services.infoBody")} multiline value={g.infoBody} onChange={(v) => setGroup(gi, { infoBody: v })} />
                <div><label className="label">{t("services.groupType")}</label><select className="input" value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as "SINGLE" })}><option value="SINGLE">{t("services.single")}</option><option value="MULTI">{t("services.multi")}</option></select></div>
                <div className="space-y-1 pt-1">
                  <Toggle label={t("services.requiredGroup")} checked={g.required} onChange={(v) => setGroup(gi, { required: v })} />
                  <Toggle label={t("services.durationGroup")} checked={g.isDuration} onChange={(v) => setGroup(gi, { isDuration: v })} />
                  <Toggle label={t("common.active")} checked={g.active} onChange={(v) => setGroup(gi, { active: v })} />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {g.options.map((o, oi) => (
                  <details key={o.id || `n${oi}`} className="rounded-xl border border-line" open={!o.id}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
                      <span className={cn("min-w-0 flex-1 truncate font-medium", !o.active && "text-muted line-through")}>{tr(o.title, locale) || t("services.option")}</span>
                      <span className="text-sm">{amd(o.price)} · {durationLabel(o.durationMin, locale)}</span>
                      {o.isDefault && <span className="chip">★</span>}
                      <span onClick={(e) => e.preventDefault()}><RowTools onUp={oi ? () => setGroup(gi, { options: move(g.options, oi, -1) }) : undefined} onDown={oi < g.options.length - 1 ? () => setGroup(gi, { options: move(g.options, oi, 1) }) : undefined} onDelete={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} /></span>
                    </summary>
                    <div className="grid gap-3 border-t border-line p-3 md:grid-cols-2">
                      <I18nInput label={t("common.title")} required value={o.title} onChange={(v) => setOpt(gi, oi, { title: v })} />
                      <I18nInput label={t("common.subtitle")} value={o.subtitle} onChange={(v) => setOpt(gi, oi, { subtitle: v })} />
                      <NumInput label={t("services.optPrice")} value={o.price} onChange={(v) => setOpt(gi, oi, { price: v ?? 0 })} />
                      <NumInput label={t("services.optDuration")} value={o.durationMin} step={15} onChange={(v) => setOpt(gi, oi, { durationMin: v ?? 0 })} />
                      <I18nInput label={t("common.badge")} value={o.badge} onChange={(v) => setOpt(gi, oi, { badge: v })} />
                      <div className="space-y-1">
                        <Toggle label={t("services.discountable")} checked={o.discountable} onChange={(v) => setOpt(gi, oi, { discountable: v })} />
                        <Toggle label={t("services.isDefault")} checked={o.isDefault} onChange={(v) => setGroup(gi, { options: g.options.map((x, i) => ({ ...x, isDefault: i === oi ? v : g.type === "SINGLE" && v ? false : x.isDefault })) })} />
                        <Toggle label={t("common.active")} checked={o.active} onChange={(v) => setOpt(gi, oi, { active: v })} />
                      </div>
                      {g.isDuration && (
                        <div className="md:col-span-2">
                          <label className="label">{t("services.schedule")}</label>
                          <div className="space-y-2">
                            {o.schedule.map((row, ri) => (
                              <div key={ri} className="flex items-end gap-2">
                                <select className="input w-24 shrink-0" value={row.icon} onChange={(e) => setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, icon: e.target.value } : x)) })}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</select>
                                <span className="mb-3 shrink-0"><Icon name={row.icon} size={18} /></span>
                                <div className="min-w-0 flex-1"><I18nInput value={row.title} onChange={(v) => setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, title: v } : x)) })} /></div>
                                <input className="input w-20 shrink-0" type="number" value={row.minutes} onChange={(e) => setOpt(gi, oi, { schedule: o.schedule.map((x, i) => (i === ri ? { ...x, minutes: Number(e.target.value) || 0 } : x)) })} />
                                <RowTools onDelete={() => setOpt(gi, oi, { schedule: o.schedule.filter((_, i) => i !== ri) })} />
                              </div>
                            ))}
                            <button className="btn-ghost btn-sm" onClick={() => setOpt(gi, oi, { schedule: [...o.schedule, { icon: "check", title: {}, minutes: 10 }] })}><Plus size={14} /> {t("services.addScheduleRow")}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
                <button className="btn-outline btn-sm" onClick={() => setGroup(gi, { options: [...g.options, { title: {}, subtitle: null, badge: null, price: 0, durationMin: g.isDuration ? 60 : 0, discountable: g.isDuration, isDefault: false, active: true, schedule: [] }] })}><Plus size={14} /> {t("services.addOption")}</button>
              </div>
            </Card>
          ))}
          <button className="btn-dark" onClick={() => up({ groups: [...s.groups, { title: {}, hint: null, infoTitle: null, infoBody: null, type: "SINGLE", required: true, isDuration: false, active: true, options: [] }] })}><Plus size={18} /> {t("services.addGroup")}</button>
        </div>
      )}

      {tab === "plans" && (
        <div className="space-y-3">
          {s.plans.map((p, pi) => {
            const pr = sampleOpt ? calculatePrice({ lines: [{ groupTitle: "", optionTitle: "", price: sampleOpt.price, discountable: sampleOpt.discountable, durationMin: sampleOpt.durationMin }], plan: { kind: p.kind, discountPercent: p.discountPercent, packageVisits: p.packageVisits }, rules }) : null;
            return (
              <Card key={p.id || `np${pi}`} title={`${tr(p.title, locale) || "—"} · ${t(`services.kinds.${p.kind}`)}`} actions={<RowTools onUp={pi ? () => up({ plans: move(s.plans, pi, -1) }) : undefined} onDown={pi < s.plans.length - 1 ? () => up({ plans: move(s.plans, pi, 1) }) : undefined} onDelete={() => confirm(t("common.deleteConfirm")) && up({ plans: s.plans.filter((_, i) => i !== pi) })} />}>
                <div className="grid gap-3 md:grid-cols-2">
                  <I18nInput label={t("common.title")} required value={p.title} onChange={(v) => setPlan(pi, { title: v })} />
                  <I18nInput label={t("common.subtitle")} value={p.subtitle} onChange={(v) => setPlan(pi, { subtitle: v })} />
                  <div><label className="label">{t("services.planKind")}</label><select className="input" value={p.kind} onChange={(e) => setPlan(pi, { kind: e.target.value as "ONE_TIME" })}>{(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"] as const).map((k) => <option key={k} value={k}>{t(`services.kinds.${k}`)}</option>)}</select></div>
                  <NumInput label={t("services.discount")} step={0.5} value={p.discountPercent} onChange={(v) => setPlan(pi, { discountPercent: v ?? 0 })} />
                  {p.kind === "SUBSCRIPTION" && <>
                    <NumInput label={t("services.intervalDays")} value={p.intervalDays} onChange={(v) => setPlan(pi, { intervalDays: v })} />
                    <NumInput label={t("services.visitsPerWeek")} value={p.visitsPerWeek} onChange={(v) => setPlan(pi, { visitsPerWeek: v })} />
                  </>}
                  {p.kind === "PACKAGE" && <>
                    <NumInput label={t("services.packageVisits")} value={p.packageVisits} onChange={(v) => setPlan(pi, { packageVisits: v })} />
                    <NumInput label={t("services.validityDays")} value={p.validityDays} onChange={(v) => setPlan(pi, { validityDays: v })} />
                  </>}
                  <I18nInput label={t("common.badge")} value={p.badge} onChange={(v) => setPlan(pi, { badge: v })} />
                  <div className="space-y-1">
                    <Toggle label={t("common.active")} checked={p.active} onChange={(v) => setPlan(pi, { active: v })} />
                    <Toggle label={t("services.isDefault")} checked={p.isDefault} onChange={(v) => up({ plans: s.plans.map((x, i) => ({ ...x, isDefault: i === pi ? v : v ? false : x.isDefault })) })} />
                  </div>
                </div>
                {pr && sampleOpt && <p className="mt-3 rounded-lg bg-surface p-2 text-sm">{t("services.pricePreview", { option: tr(sampleOpt.title, locale), price: p.kind === "PACKAGE" ? `${amd(pr.payNow)} (${pr.visits} × ${amd(pr.regular.price)})` : amd(pr.regular.price) })}</p>}
              </Card>
            );
          })}
          <button className="btn-dark" onClick={() => up({ plans: [...s.plans, { kind: "SUBSCRIPTION", title: {}, subtitle: null, badge: null, discountPercent: 0, intervalDays: 7, visitsPerWeek: null, packageVisits: null, validityDays: null, active: true, isDefault: false }] })}><Plus size={18} /> {t("services.addPlan")}</button>
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-4">
          <Card title={t("services.note")}>
            <div className="grid gap-3"><I18nInput label={t("services.noteTitle")} value={c.note?.title} onChange={(v) => setContent({ note: { title: v, body: c.note?.body || {} } })} /><I18nInput label={t("services.noteBody")} multiline value={c.note?.body} onChange={(v) => setContent({ note: { title: c.note?.title || {}, body: v } })} /></div>
          </Card>
          <Card title={t("services.benefits")}>
            <div className="space-y-2">
              {c.benefits.map((b, i) => (
                <div key={i} className="flex items-end gap-2">
                  <select className="input w-28 shrink-0" value={b.icon} onChange={(e) => setContent({ benefits: c.benefits.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</select>
                  <div className="min-w-0 flex-1"><I18nInput value={b.title} onChange={(v) => setContent({ benefits: c.benefits.map((x, j) => (j === i ? { ...x, title: v } : x)) })} /></div>
                  <RowTools onUp={i ? () => setContent({ benefits: move(c.benefits, i, -1) }) : undefined} onDelete={() => setContent({ benefits: c.benefits.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <button className="btn-ghost btn-sm" onClick={() => setContent({ benefits: [...c.benefits, { icon: "check", title: {} }] })}><Plus size={14} /> {t("services.addItem")}</button>
            </div>
          </Card>
          <Card title={t("services.howItWorks")}>
            <div className="space-y-3">
              {c.howItWorks.map((h, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-2">
                  <I18nInput label={`${t("services.stepTitle")} ${i + 1}`} value={h.title} onChange={(v) => setContent({ howItWorks: c.howItWorks.map((x, j) => (j === i ? { ...x, title: v } : x)) })} />
                  <I18nInput label={t("services.stepBody")} value={h.body} onChange={(v) => setContent({ howItWorks: c.howItWorks.map((x, j) => (j === i ? { ...x, body: v } : x)) })} />
                  <div className="md:col-span-2"><RowTools onUp={i ? () => setContent({ howItWorks: move(c.howItWorks, i, -1) }) : undefined} onDelete={() => setContent({ howItWorks: c.howItWorks.filter((_, j) => j !== i) })} /></div>
                </div>
              ))}
              <button className="btn-ghost btn-sm" onClick={() => setContent({ howItWorks: [...c.howItWorks, { title: {}, body: {} }] })}><Plus size={14} /> {t("services.addItem")}</button>
            </div>
          </Card>
          <Card title={t("services.faq")}>
            <div className="space-y-3">
              {c.faq.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
                  <I18nInput label={t("services.question")} value={f.q} onChange={(v) => setContent({ faq: c.faq.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
                  <I18nInput label={t("services.answer")} multiline value={f.a} onChange={(v) => setContent({ faq: c.faq.map((x, j) => (j === i ? { ...x, a: v } : x)) })} />
                  <RowTools onUp={i ? () => setContent({ faq: move(c.faq, i, -1) }) : undefined} onDelete={() => setContent({ faq: c.faq.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <button className="btn-ghost btn-sm" onClick={() => setContent({ faq: [...c.faq, { q: {}, a: {} }] })}><Plus size={14} /> {t("services.addItem")}</button>
            </div>
          </Card>
          <Card title={t("services.policy")}><I18nInput multiline value={c.policy} onChange={(v) => setContent({ policy: v })} /></Card>
        </div>
      )}

      <SaveBar onSave={save} pending={pending} saved={saved} error={error} />
    </div>
  );
}
