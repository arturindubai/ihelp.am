"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Pencil, Trash2, Plus, LogOut } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { confirmProfileEmailAction, sendProfileEmailCodeAction, updateProfileAction } from "@/server/actions/account";
import { deleteAddressAction } from "@/server/actions/booking";
import { logoutAction } from "@/server/actions/auth";
import { Sheet } from "@/components/ui/Sheet";
import { AddressForm, addressLine, type AddressRow } from "@/components/booking/AddressForm";
import { localeNames, type Locale } from "@/i18n/locales";
import { formatPhone } from "@/lib/phone";

export function ProfileClient({ user, addresses: initial, districts, enabledLocales, emailCodes }: { user: { name: string | null; phone: string; email: string | null; emailVerified: boolean; locale: string }; addresses: AddressRow[]; districts: string[]; enabledLocales: string[]; emailCodes: boolean }) {
  const t = useTranslations("account");
  const ta = useTranslations("address");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const ta2 = useTranslations("auth");
  const router = useRouter();
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", locale: user.locale });
  const [saved, setSaved] = useState(false);
  // Какой адрес сохранён и подтверждён: подтверждать можно только сохранённый, смена адреса сбрасывает подтверждение
  const [savedEmail, setSavedEmail] = useState((user.email || "").trim().toLowerCase());
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [saveError, setSaveError] = useState<string>();
  const [addresses, setAddresses] = useState(initial);
  const [edit, setEdit] = useState<Partial<AddressRow> | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <section className="card p-4">
        <h2 className="h3 mb-3">{t("personal")}</h2>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateProfileAction(form);
            setSaveError(r.ok ? undefined : "error" in r ? r.error : "error");
            if (r.ok) {
              const next = form.email.trim().toLowerCase();
              if (next !== savedEmail) setEmailVerified(false);
              setSavedEmail(next);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }
          });
        }}>
          <div><label className="label">{t("phone")}</label><input className="input bg-surface" disabled value={formatPhone(user.phone)} /></div>
          <div><label className="label">{t("name")}</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">{t("email")} <span className="font-normal text-muted">({tc("optional")})</span></label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {savedEmail && savedEmail === form.email.trim().toLowerCase() && <EmailStatus verified={emailVerified} canConfirm={emailCodes} onVerified={() => setEmailVerified(true)} />}
          </div>
          {enabledLocales.length > 1 && (
            <div><label className="label">{t("language")}</label>
              <select className="input" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
                {enabledLocales.map((l) => <option key={l} value={l}>{localeNames[l as Locale]}</option>)}
              </select>
            </div>
          )}
          {saveError && <p className="text-sm text-bad">{saveError === "email_taken" ? ta2("errors.email_taken") : tc("error")}</p>}
          <button className="btn-dark w-full" disabled={pending}>{saved ? tc("saved") : tc("save")}</button>
        </form>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="h3 mb-3">{t("addresses")}</h2>
        {addresses.length === 0 && <p className="mb-3 text-sm text-muted">{t("noAddresses")}</p>}
        <ul className="divide-y divide-line">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <MapPin size={18} className="shrink-0 text-muted" />
              <div className="flex-1 text-sm">
                <div className="flex items-center gap-2">{a.label && <span className="font-semibold">{a.label}</span>}{a.isDefault && <span className="chip bg-brand-50 text-brand">{ta("default")}</span>}</div>
                {addressLine(a, (n) => ta("aptShort", { n }))}
              </div>
              <button className="btn-ghost btn-sm" aria-label={tc("edit")} onClick={() => setEdit(a)}><Pencil size={16} /></button>
              <button className="btn-ghost btn-sm text-bad" aria-label={tc("delete")} onClick={() => start(async () => { await deleteAddressAction(a.id); setAddresses((l) => l.filter((x) => x.id !== a.id)); })}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
        <button className="btn-outline mt-2 w-full" onClick={() => setEdit({})}><Plus size={18} /> {ta("saveAddress")}</button>
      </section>

      <button className="btn-ghost mt-4 w-full text-bad" onClick={() => start(async () => { await logoutAction(); router.replace("/"); router.refresh(); })}><LogOut size={18} /> {tn("logout")}</button>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? tc("edit") : ta("saveAddress")}>
        {edit && (
          <AddressForm initial={edit} districts={districts} onSaved={(a) => {
            setAddresses((l) => {
              const rest = l.filter((x) => x.id !== a.id).map((x) => (a.isDefault ? { ...x, isDefault: false } : x));
              return [...rest, a];
            });
            setEdit(null);
          }} />
        )}
      </Sheet>
    </div>
  );
}

/** Статус email и подтверждение кодом из письма: по неподтверждённому адресу войти нельзя (AUTH-14) */
function EmailStatus({ verified, canConfirm, onVerified }: { verified: boolean; canConfirm: boolean; onVerified: () => void }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [codeLength, setCodeLength] = useState(6);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const errText = (e: string) => (ta.has(`errors.${e}`) ? ta(`errors.${e}`, { sec: 0 }) : tc("error"));

  if (verified) return <p className="mt-1 text-xs text-ok">{t("emailVerified")}</p>;
  if (!canConfirm) return <p className="mt-1 text-xs text-muted">{t("emailNotVerified")}</p>;
  return (
    <div className="mt-1">
      <p className="text-xs text-warn">{t("emailNotVerified")}</p>
      {!asking ? (
        <button type="button" className="link mt-1 text-sm" disabled={pending} onClick={() => start(async () => {
          setError(undefined);
          const r = await sendProfileEmailCodeAction(locale);
          if (!r.ok) return setError(errText(r.error));
          setCodeLength(r.codeLength);
          setAsking(true);
        })}>{t("emailConfirm")}</button>
      ) : (
        <div className="mt-2">
          <p className="text-xs text-muted">{t("emailCodeSent")}</p>
          <div className="mt-1 flex gap-2">
            <input className="input text-center tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="btn-dark" disabled={pending || code.length < codeLength} onClick={() => start(async () => {
              setError(undefined);
              const r = await confirmProfileEmailAction(code);
              if (!r.ok) return setError(errText(r.error));
              onVerified();
            })}>{ta("verify")}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
