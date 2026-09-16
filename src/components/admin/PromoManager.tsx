"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deletePromoAction, savePromoAction, type PromoPayload } from "@/server/actions/admin/misc";
import { amd } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";
import { NumInput, TextInput, Toggle } from "./fields";

const EMPTY: PromoPayload = { code: "", description: "", type: "PERCENT", value: 10, maxDiscount: null, minOrder: null, validFrom: null, validTo: null, usageLimit: null, perUserLimit: 1, firstOrderOnly: false, stackable: false, serviceIds: [], planKinds: [], active: true };

export function PromoManager({ promos, services }: { promos: { id: string; usedCount: number; data: PromoPayload }[]; services: { id: string; name: string }[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; data: PromoPayload } | null>(null);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const d = edit?.data;
  const up = (p: Partial<PromoPayload>) => edit && setEdit({ ...edit, data: { ...edit.data, ...p } });
  return (
    <div>
      <button className="btn-dark mb-3" onClick={() => { setErr(undefined); setEdit({ id: null, data: EMPTY }); }}><Plus size={18} /> {t("promos.newPromo")}</button>
      <div className="card divide-y divide-line">
        {promos.map((p) => (
          <button key={p.id} className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface/50" onClick={() => { setErr(undefined); setEdit({ id: p.id, data: p.data }); }}>
            <span className={`rounded-md px-2 py-1 font-mono text-sm font-bold ${p.data.active ? "bg-ink text-inverse" : "bg-surface text-muted line-through"}`}>{p.data.code}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{p.data.type === "PERCENT" ? `−${p.data.value}%` : `−${amd(p.data.value)}`}</span>
              {p.data.description && <span className="text-muted"> · {p.data.description}</span>}
              <span className="block text-xs text-muted">{p.data.validTo ? `→ ${p.data.validTo}` : ""} {p.data.firstOrderOnly ? `· ${t("promos.firstOrderOnly")}` : ""}</span>
            </span>
            <span className="text-xs text-muted">{t("promos.used")}: {p.usedCount}{p.data.usageLimit ? `/${p.data.usageLimit}` : ""}</span>
          </button>
        ))}
        {!promos.length && <p className="p-8 text-center text-muted">{t("common.empty")}</p>}
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? d?.code : t("promos.newPromo")} footer={
        <div className="flex gap-2">
          {edit?.id && <button className="btn-danger" disabled={pending} onClick={() => confirm(t("common.deleteConfirm")) && start(async () => { await deletePromoAction(edit.id!); setEdit(null); router.refresh(); })}>{t("common.delete")}</button>}
          <button className="btn-primary flex-1" disabled={pending} onClick={() => start(async () => { const r = await savePromoAction(edit!.id, edit!.data); if (!r.ok) return setErr(`${t("common.error")}: ${r.error}`); setEdit(null); router.refresh(); })}>{t("common.save")}</button>
        </div>
      }>
        {d && (
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 rounded-lg bg-surface p-2 text-xs text-muted">{t("promos.rulesHint")}</p>
            <TextInput className="col-span-2" label={t("promos.code")} value={d.code} onChange={(v) => up({ code: v.toUpperCase() })} />
            <TextInput className="col-span-2" label={t("promos.descr")} value={d.description} onChange={(v) => up({ description: v })} />
            <div><label className="label">{t("promos.type")}</label><select className="input" value={d.type} onChange={(e) => up({ type: e.target.value as "PERCENT" })}><option value="PERCENT">{t("promos.percent")}</option><option value="FIXED">{t("promos.fixed")}</option></select></div>
            <NumInput label={`${t("promos.value")}${d.type === "PERCENT" ? ", %" : ", ֏"}`} value={d.value} onChange={(v) => up({ value: v ?? 0 })} />
            <NumInput label={t("promos.maxDiscount")} value={d.maxDiscount} onChange={(v) => up({ maxDiscount: v })} />
            <NumInput label={t("promos.minOrder")} value={d.minOrder} onChange={(v) => up({ minOrder: v })} />
            <TextInput label={t("promos.validFrom")} type="date" value={d.validFrom} onChange={(v) => up({ validFrom: v || null })} />
            <TextInput label={t("promos.validTo")} type="date" value={d.validTo} onChange={(v) => up({ validTo: v || null })} />
            <NumInput label={t("promos.usageLimit")} value={d.usageLimit} onChange={(v) => up({ usageLimit: v })} />
            <NumInput label={t("promos.perUserLimit")} value={d.perUserLimit} onChange={(v) => up({ perUserLimit: v ?? 1 })} />
            <div className="col-span-2 space-y-1">
              <Toggle label={t("promos.firstOrderOnly")} checked={d.firstOrderOnly} onChange={(v) => up({ firstOrderOnly: v })} />
              <Toggle label={t("promos.stackable")} checked={d.stackable} onChange={(v) => up({ stackable: v })} />
              <Toggle label={t("common.active")} checked={d.active} onChange={(v) => up({ active: v })} />
            </div>
            <div className="col-span-2">
              <label className="label">{t("promos.services")}</label>
              <p className="mb-1 text-xs text-muted">{t("promos.anyService")}</p>
              {services.map((s) => <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" className="size-4" checked={d.serviceIds.includes(s.id)} onChange={(e) => up({ serviceIds: e.target.checked ? [...d.serviceIds, s.id] : d.serviceIds.filter((x) => x !== s.id) })} /> {s.name}</label>)}
            </div>
            <div className="col-span-2">
              <label className="label">{t("promos.planKinds")}</label>
              {(["ONE_TIME", "SUBSCRIPTION", "PACKAGE"] as const).map((k) => <label key={k} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" className="size-4" checked={d.planKinds.includes(k)} onChange={(e) => up({ planKinds: e.target.checked ? [...d.planKinds, k] : d.planKinds.filter((x) => x !== k) })} /> {t(`services.kinds.${k}`)}</label>)}
            </div>
            {err && <p className="col-span-2 text-sm text-bad">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
