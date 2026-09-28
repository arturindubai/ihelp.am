"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setRoleAction, setStaffEmailAction } from "@/server/actions/admin/misc";

const ROLES = ["CLIENT", "MASTER", "OPERATOR", "ADMIN", "OWNER"] as const;

type StaffItem = { phone: string; email: string | null; label: string; role: string; lastLoginAt: string | null };

function EmailEditor({ item }: { item: StaffItem }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [value, setValue] = useState(item.email ?? "");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setErr(undefined);
    const x = await setStaffEmailAction(item.phone, value.trim() || null);
    if (!x.ok) {
      setErr(x.error === "email_taken" ? t("emailTaken") : t("emailInvalid"));
      return;
    }
    router.refresh();
  });

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <input
        className="input min-w-44 flex-1 py-1 text-xs"
        type="email"
        placeholder={t("emailPlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button className="btn-dark btn-sm text-xs" disabled={pending} onClick={save}>{t("emailSave")}</button>
      {err && <p className="w-full text-xs text-bad">{err}</p>}
    </div>
  );
}

export function StaffManager({ staff }: { staff: StaffItem[] }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [phone, setPhone] = useState("+374 ");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("OPERATOR");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    setErr(undefined);
    const x = await setRoleAction(phone, role, name.trim() || undefined);
    if (!x.ok) return setErr(x.error);
    if (email.trim()) {
      const y = await setStaffEmailAction(phone, email.trim());
      if (!y.ok) {
        setErr(y.error === "email_taken" ? t("emailTaken") : t("emailInvalid"));
        return;
      }
    }
    setPhone("+374 ");
    setName("");
    setEmail("");
    router.refresh();
  });

  const run = (p: string, r: (typeof ROLES)[number]) => start(async () => {
    setErr(undefined);
    const x = await setRoleAction(p, r);
    if (!x.ok) return setErr(x.error);
    router.refresh();
  });

  const revoke = (p: string, label: string) => {
    if (!window.confirm(t("revokeConfirm", { label }))) return;
    run(p, "CLIENT");
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-surface p-3 text-sm text-muted">{t("rolesHint")}</p>
      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input min-w-44 flex-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input min-w-44 flex-1" type="text" placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input min-w-44 flex-1" type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as "ADMIN")}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
        <button className="btn-dark" disabled={pending} onClick={add}>{t("addStaff")}</button>
        {err && <p className="w-full text-sm text-bad">{err}</p>}
      </div>
      <div className="card divide-y divide-line">
        {staff.map((s) => (
          <div key={s.phone} className="flex items-start gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div>{s.label}</div>
              {s.email && <div className="text-xs text-muted">{s.email}</div>}
              <div className="text-xs text-muted">{t("lastLogin")} {s.lastLoginAt ?? t("lastLoginNever")}</div>
              <EmailEditor item={s} />
              <p className="mt-0.5 text-xs text-muted">{t("emailHint")}</p>
            </div>
            <select className="input min-h-9 w-auto py-1" value={s.role} disabled={pending} onChange={(e) => run(s.phone, e.target.value as "ADMIN")}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
            <button className="btn-dark btn-sm" disabled={pending} onClick={() => revoke(s.phone, s.label)}>{t("revokeAccess")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
