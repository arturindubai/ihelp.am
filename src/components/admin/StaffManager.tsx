"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setRoleAction, setStaffEmailAction } from "@/server/actions/admin/misc";
import { saveStaffPermissionsAction, saveStaffLoginAction } from "@/server/actions/admin/staff";
import type { Section } from "@/lib/adminAccess";
import { DELEGATABLE_SECTIONS } from "@/lib/adminAccess";
import type { Role } from "@prisma/client";

const ROLES = ["CLIENT", "MASTER", "OPERATOR", "ADMIN", "OWNER"] as const;

type StaffItem = {
  id: string;
  phone: string;
  email: string | null;
  telegramId: string | null;
  name: string | null;
  label: string;
  role: Role;
  lastLoginAt: string | null;
  roleBase: Section[];
  sectionDelta: { added?: string[]; removed?: string[] } | null;
};

// ───── Строка поля способа входа ─────

function LoginField({
  label,
  value,
  placeholder,
  type,
  onSave,
  disabled,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  type: string;
  onSave: (v: string | null) => Promise<string | undefined>;
  disabled: boolean;
}) {
  const t = useTranslations("admin.staff");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const e = await onSave(draft.trim() || null);
      if (e) { setErr(e); return; }
      setEditing(false);
      setErr(undefined);
    });

  const cancel = () => { setEditing(false); setDraft(value ?? ""); setErr(undefined); };

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        <span className="w-28 shrink-0 text-xs text-muted pt-2">{label}</span>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <input
              className="input flex-1 py-1 text-sm"
              type={type}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            />
            <button className="btn-dark btn-sm px-2" disabled={pending} onClick={save} title={t("saveField")}>✓</button>
            <button className="btn btn-sm px-2 border border-line" disabled={pending} onClick={cancel} title={t("cancelField")}>✕</button>
          </div>
          {err && <p className="mt-0.5 text-xs text-bad">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
      <span className={`flex-1 text-sm truncate ${value ? "text-ink" : "text-muted italic"}`}>{value ?? t("notLinked")}</span>
      {!disabled && (
        <button
          className="shrink-0 rounded p-1 hover:bg-surface text-muted hover:text-ink transition-colors"
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          title={t("editField")}
          aria-label={`${t("editField")} ${label}`}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      )}
    </div>
  );
}

// ───── Панель деталей сотрудника ─────

function StaffPanel({ item, onClose, ownerPhone }: { item: StaffItem; onClose: () => void; ownerPhone: string }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const isOwner = item.role === "OWNER";
  const isSelf = item.phone === ownerPhone;

  // Состояние чекбоксов: "added" | "removed" | "base" | "absent"
  const addedSet = new Set(item.sectionDelta?.added ?? []);
  const removedSet = new Set(item.sectionDelta?.removed ?? []);
  const baseSet = new Set(item.roleBase);

  type CheckState = "added" | "removed" | "base" | "absent";
  const initialChecks: Record<string, CheckState> = {};
  for (const s of DELEGATABLE_SECTIONS) {
    if (removedSet.has(s)) initialChecks[s] = "removed";
    else if (addedSet.has(s)) initialChecks[s] = "added";
    else if (baseSet.has(s)) initialChecks[s] = "base";
    else initialChecks[s] = "absent";
  }

  const [checks, setChecks] = useState<Record<string, CheckState>>(initialChecks);

  const toggle = (section: string) => {
    setChecks((prev) => {
      const cur = prev[section];
      if (cur === "base") return { ...prev, [section]: "removed" };
      if (cur === "removed") return { ...prev, [section]: "base" };
      if (cur === "added") return { ...prev, [section]: "absent" };
      return { ...prev, [section]: "added" };
    });
  };

  const savePermissions = () =>
    start(async () => {
      setErr(undefined);
      const added = DELEGATABLE_SECTIONS.filter((s) => checks[s] === "added");
      const removed = DELEGATABLE_SECTIONS.filter((s) => checks[s] === "removed");
      const x = await saveStaffPermissionsAction(item.id, { added, removed });
      if (!x.ok) { setErr(t("saveError")); return; }
      setSaved(true);
      router.refresh();
    });

  const handleSaveClick = () => setShowConfirm(true);

  const saveLoginField = (field: "phone" | "email" | "telegramId") => async (value: string | null) => {
    const payload = { [field]: value } as { phone?: string | null; email?: string | null; telegramId?: string | null };
    const x = await saveStaffLoginAction(item.id, payload);
    if (!x.ok) {
      const map: Record<string, string> = {
        phone_invalid: t("phoneInvalid"),
        phone_taken: t("phoneTaken"),
        phone_required: t("phoneRequired"),
        email_invalid: t("emailInvalid"),
        email_taken: t("emailTaken"),
        telegram_invalid: t("telegramInvalid"),
        telegram_taken: t("telegramTaken"),
      };
      return map[x.error] ?? t("saveError");
    }
    router.refresh();
  };

  return (
    <div className="bg-paper rounded-2xl border border-line p-4 space-y-5">
      {/* Шапка на мобиле */}
      <div className="flex items-center gap-2 md:hidden">
        <button onClick={onClose} className="text-muted hover:text-ink p-1 -ml-1">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <span className="font-semibold text-ink truncate">{item.name || item.phone}</span>
      </div>

      {/* Способы входа */}
      <div>
        <p className="text-sm font-semibold text-ink mb-2">{t("loginMethods")}</p>
        <div className="space-y-2">
          <LoginField label={t("fieldPhone")} value={item.phone} placeholder="+374..." type="tel" onSave={saveLoginField("phone")} disabled={isSelf} />
          <LoginField label={t("fieldEmail")} value={item.email} placeholder="user@example.com" type="email" onSave={saveLoginField("email")} disabled={false} />
          <LoginField label={t("fieldTelegram")} value={item.telegramId} placeholder="123456789" type="text" onSave={saveLoginField("telegramId")} disabled={false} />
        </div>
      </div>

      {/* Права доступа */}
      {!isOwner && (
        <div>
          <p className="text-sm font-semibold text-ink mb-2">{t("permissions")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5">
            {DELEGATABLE_SECTIONS.map((section) => {
              const state = checks[section];
              const checked = state === "base" || state === "added";
              return (
                <label key={section} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-brand size-4 shrink-0"
                    checked={checked}
                    onChange={() => toggle(section)}
                  />
                  <span className={`text-sm truncate ${state === "removed" ? "line-through text-muted" : "text-ink"}`}>
                    {t(`sections.${section}`)}
                  </span>
                  {state === "base" && <span className="text-xs text-muted shrink-0">{t("fromRole")}</span>}
                  {state === "added" && <span className="text-xs text-brand shrink-0">+</span>}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{t("settingsStaffOwnerOnly")}</p>

          {/* Предупреждение перед сохранением */}
          {showConfirm ? (
            <div className="mt-3 rounded-lg bg-warn-50 text-warn p-3 text-sm space-y-2">
              <p>{t("confirmPermissions")}</p>
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={pending}
                  onClick={() => { setShowConfirm(false); savePermissions(); }}
                >
                  {pending ? "…" : t("confirmYes")}
                </button>
                <button className="btn btn-sm border border-line" onClick={() => setShowConfirm(false)}>{t("confirmNo")}</button>
              </div>
            </div>
          ) : (
            <button
              className="btn-primary w-full mt-3"
              disabled={pending}
              onClick={handleSaveClick}
            >
              {pending ? "…" : t("savePermissions")}
            </button>
          )}
          {err && <p className="mt-1 text-sm text-bad">{err}</p>}
          {saved && !err && <p className="mt-1 text-sm text-ok">{t("savedMsg")}</p>}
        </div>
      )}

      {isOwner && (
        <p className="text-xs text-muted italic">{t("ownerFullAccess")}</p>
      )}
    </div>
  );
}

// ───── Главный компонент ─────

export function StaffManager({ staff }: { staff: StaffItem[] }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [phone, setPhone] = useState("+374 ");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("OPERATOR");
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedItem = staff.find((s) => s.id === selectedId) ?? null;
  const ownerPhone = staff.find((s) => s.role === "OWNER")?.phone ?? "";

  const add = () =>
    start(async () => {
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

  const run = (p: string, r: (typeof ROLES)[number]) =>
    start(async () => {
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

      {/* Форма добавления */}
      <div className="card flex flex-wrap gap-2 p-3">
        <input className="input min-w-44 flex-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input min-w-44 flex-1" type="text" placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input min-w-44 flex-1" type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as "ADMIN")}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t(`roles.${r}`)}</option>
          ))}
        </select>
        <button className="btn-dark" disabled={pending} onClick={add}>{t("addStaff")}</button>
        {err && <p className="w-full text-sm text-bad">{err}</p>}
      </div>

      {/* Список + панель */}
      <div className="flex gap-4 items-start">
        {/* Список — скрыт на мобиле когда выбран сотрудник */}
        <div className={`card divide-y divide-line w-full md:w-80 shrink-0 ${selectedItem ? "hidden md:block" : "block"}`}>
          {staff.length === 0 && (
            <div className="p-4 text-sm text-muted text-center">{t("empty")}</div>
          )}
          {staff.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 p-3 text-sm transition-colors ${selectedId === s.id ? "bg-brand-50" : "hover:bg-surface"}`}
            >
              <div
                role="button"
                tabIndex={0}
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(s.id === selectedId ? null : s.id)}
              >
                <div className="truncate font-medium text-ink">{s.name || "—"}</div>
                <div className="truncate text-xs text-muted">{s.phone}</div>
                <div className="text-xs text-muted">{t("lastLogin")} {s.lastLoginAt ?? t("lastLoginNever")}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="chip text-xs">{t(`roles.${s.role}`)}</span>
                <button
                  className="text-xs text-bad hover:underline"
                  disabled={pending}
                  onClick={() => revoke(s.phone, s.label)}
                >
                  {t("revokeAccess")}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Панель деталей */}
        {selectedItem && (
          <div className="min-w-0 flex-1">
            <StaffPanel
              key={selectedItem.id + JSON.stringify(selectedItem.sectionDelta)}
              item={selectedItem}
              onClose={() => setSelectedId(null)}
              ownerPhone={ownerPhone}
            />
          </div>
        )}
      </div>
    </div>
  );
}
