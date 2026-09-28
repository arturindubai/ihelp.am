"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setRoleAction } from "@/server/actions/admin/misc";

const ROLES = ["CLIENT", "MASTER", "OPERATOR", "ADMIN", "OWNER"] as const;

export function StaffManager({ staff }: { staff: { phone: string; label: string; role: string; lastLoginAt: string | null }[] }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [phone, setPhone] = useState("+374 ");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("OPERATOR");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const add = () => start(async () => {
    setErr(undefined);
    const x = await setRoleAction(phone, role, name.trim() || undefined);
    if (!x.ok) return setErr(x.error);
    setPhone("+374 ");
    setName("");
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
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as "ADMIN")}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
        <button className="btn-dark" disabled={pending} onClick={add}>{t("addStaff")}</button>
        {err && <p className="w-full text-sm text-bad">{err}</p>}
      </div>
      <div className="card divide-y divide-line">
        {staff.map((s) => (
          <div key={s.phone} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div>{s.label}</div>
              <div className="text-xs text-muted">{t("lastLogin")} {s.lastLoginAt ?? t("lastLoginNever")}</div>
            </div>
            <select className="input min-h-9 w-auto py-1" value={s.role} disabled={pending} onChange={(e) => run(s.phone, e.target.value as "ADMIN")}>{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select>
            <button className="btn-dark btn-sm" disabled={pending} onClick={() => revoke(s.phone, s.label)}>{t("revokeAccess")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
