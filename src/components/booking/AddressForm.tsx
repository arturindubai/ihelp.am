"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveAddressAction, type AddressInput } from "@/server/actions/booking";

export type AddressRow = { id: string; label: string | null; district: string | null; street: string; building: string; entrance: string | null; floor: string | null; apartment: string | null; intercom: string | null; comment: string | null; isDefault: boolean };

export function addressLine(a: Pick<AddressRow, "street" | "building" | "apartment" | "district">, apt: (n: string) => string = (n) => n) {
  return [a.district, `${a.street} ${a.building}`, a.apartment && apt(a.apartment)].filter(Boolean).join(", ");
}

export function AddressForm({ initial, districts, onSaved }: { initial?: Partial<AddressRow>; districts: string[]; onSaved: (a: AddressRow) => void }) {
  const t = useTranslations("address");
  const tc = useTranslations("common");
  const [v, setV] = useState<AddressInput>({ id: initial?.id, label: initial?.label ?? "", district: initial?.district ?? "", street: initial?.street ?? "", building: initial?.building ?? "", entrance: initial?.entrance ?? "", floor: initial?.floor ?? "", apartment: initial?.apartment ?? "", intercom: initial?.intercom ?? "", comment: initial?.comment ?? "", isDefault: initial?.isDefault ?? false });
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form
      className="grid grid-cols-3 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAddressAction(v);
          if (!r.ok) return setErr(tc("required"));
          onSaved(r.address as AddressRow);
        });
      }}
    >
      {districts.length > 0 && (
        <div className="col-span-3">
          <label className="label">{t("district")}</label>
          <select className="input" value={v.district || ""} onChange={set("district")}>
            <option value="">{t("select")}</option>
            {districts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      )}
      <div className="col-span-2">
        <label className="label">{t("street")} *</label>
        <input className="input" required value={v.street} onChange={set("street")} />
      </div>
      <div>
        <label className="label">{t("building")} *</label>
        <input className="input" required value={v.building} onChange={set("building")} />
      </div>
      <div><label className="label">{t("apartment")}</label><input className="input" value={v.apartment || ""} onChange={set("apartment")} /></div>
      <div><label className="label">{t("entrance")}</label><input className="input" value={v.entrance || ""} onChange={set("entrance")} /></div>
      <div><label className="label">{t("floor")}</label><input className="input" inputMode="numeric" value={v.floor || ""} onChange={set("floor")} /></div>
      <div className="col-span-3"><label className="label">{t("intercom")}</label><input className="input" value={v.intercom || ""} onChange={set("intercom")} /></div>
      <div className="col-span-3"><label className="label">{t("comment")}</label><textarea className="input min-h-20 py-2" value={v.comment || ""} onChange={set("comment")} /></div>
      <div className="col-span-3"><label className="label">{t("label")}</label><input className="input" placeholder={t("labelPlaceholder")} value={v.label || ""} onChange={set("label")} /></div>
      <label className="col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={!!v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} /> {t("makeDefault")}</label>
      {err && <p className="col-span-3 text-sm text-bad">{err}</p>}
      <button className="btn-primary col-span-3" disabled={pending}>{t("saveAddress")}</button>
    </form>
  );
}
