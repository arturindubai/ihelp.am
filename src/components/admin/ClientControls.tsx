"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { clientAction } from "@/server/actions/admin/misc";

export function ClientControls({ user }: { user: { id: string; blocked: boolean; adminNotes: string; name: string } }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [notes, setNotes] = useState(user.adminNotes);
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <section className="card h-fit space-y-3 p-4">
      <div><label className="label">{t("clients.name")}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="label">{t("clients.notes")}</label><textarea className="input min-h-28 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button className="btn-dark w-full" disabled={pending} onClick={() => start(async () => { await clientAction(user.id, { adminNotes: notes, name }); setSaved(true); })}>{saved ? t("common.saved") : t("common.save")}</button>
      <button className={user.blocked ? "btn-outline w-full" : "btn-danger w-full"} disabled={pending} onClick={() => start(async () => { await clientAction(user.id, { blocked: !user.blocked }); router.refresh(); })}>{user.blocked ? t("clients.unblock") : t("clients.block")}</button>
    </section>
  );
}
