"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Star } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { reviewCreateAction, reviewDeleteAction, reviewModerateAction } from "@/server/actions/admin/misc";
import { Sheet } from "@/components/ui/Sheet";

export function ReviewRow({ review }: { review: { id: string; rating: number; text: string; reply: string; status: string; author: string; meta: string } }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [reply, setReply] = useState(review.reply);
  const [pending, start] = useTransition();
  const run = (p: Parameters<typeof reviewModerateAction>[1]) => start(async () => { await reviewModerateAction(review.id, p); router.refresh(); });
  return (
    <li className="card p-3">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{review.author}</span><span className="text-brand">{"★".repeat(review.rating)}<span className="text-line">{"★".repeat(5 - review.rating)}</span></span></div>
      <div className="text-xs text-muted">{review.meta}</div>
      {review.text && <p className="mt-1.5 text-sm">{review.text}</p>}
      <input className="input mt-2 min-h-9 text-sm" placeholder={t("reviews.reply")} value={reply} onChange={(e) => setReply(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2">
        {review.status !== "APPROVED" && <button className="btn-dark btn-sm" disabled={pending} onClick={() => run({ status: "APPROVED", reply })}>{t("reviews.approve")}</button>}
        {review.status === "APPROVED" && reply !== review.reply && <button className="btn-dark btn-sm" disabled={pending} onClick={() => run({ reply })}>{t("common.save")}</button>}
        {review.status !== "REJECTED" && <button className="btn-outline btn-sm" disabled={pending} onClick={() => run({ status: "REJECTED" })}>{t("reviews.reject")}</button>}
        <button className="btn-ghost btn-sm text-bad" disabled={pending} onClick={() => confirm(t("common.deleteConfirm")) && start(async () => { await reviewDeleteAction(review.id); router.refresh(); })}>{t("common.delete")}</button>
      </div>
    </li>
  );
}

export function ReviewCreate({ masters, services }: { masters: { id: string; name: string }[]; services: { id: string; name: string }[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ masterId: "", serviceId: services[0]?.id || "", authorName: "", rating: 5, text: "" });
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-outline btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> {t("reviews.addManual")}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("reviews.addManual")} footer={<button className="btn-primary w-full" disabled={pending || !f.authorName} onClick={() => start(async () => { await reviewCreateAction({ ...f, masterId: f.masterId || null, serviceId: f.serviceId || null }); setOpen(false); router.refresh(); })}>{t("common.save")}</button>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-warn-50 p-2 text-xs text-warn">{t("reviews.manualHint")}</p>
          <div><label className="label">{t("reviews.author")}</label><input className="input" value={f.authorName} onChange={(e) => setF({ ...f, authorName: e.target.value })} /></div>
          <div><label className="label">{t("nav.masters")}</label><select className="input" value={f.masterId} onChange={(e) => setF({ ...f, masterId: e.target.value })}><option value="">—</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div><label className="label">{t("nav.services")}</label><select className="input" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}><option value="">—</option>{services.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setF({ ...f, rating: i })}><Star size={28} className={i <= f.rating ? "fill-brand stroke-brand" : "stroke-line"} /></button>)}</div>
          <textarea className="input min-h-24 py-2" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </div>
      </Sheet>
    </>
  );
}
