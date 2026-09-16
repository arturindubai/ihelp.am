"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cancelOrderAction, cancelVisitAction, pauseOrderAction, rescheduleVisitAction, resumeOrderAction, reviewAction } from "@/server/actions/account";
import { Sheet } from "@/components/ui/Sheet";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { addDays, ymd } from "@/lib/time";

export function OrderActions({ order }: { order: { id: string; kind: string; status: string } }) {
  const t = useTranslations("order");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [pause, setPause] = useState(false);
  const [until, setUntil] = useState(addDays(ymd(new Date()), 14));
  if (!["ACTIVE", "PAUSED"].includes(order.status)) return null;
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); setConfirm(false); setPause(false); router.refresh(); });
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {order.kind === "SUBSCRIPTION" && order.status === "ACTIVE" && <button className="btn-outline btn-sm" onClick={() => setPause(true)}>{t("pause")}</button>}
      {order.kind === "SUBSCRIPTION" && order.status === "PAUSED" && <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => resumeOrderAction(order.id))}>{t("resume")}</button>}
      {order.kind !== "ONE_TIME" && <button className="btn-danger btn-sm" onClick={() => setConfirm(true)}>{order.kind === "SUBSCRIPTION" ? t("cancelSubscription") : t("cancelOrder")}</button>}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t("cancelConfirm")} footer={<div className="flex gap-2"><button className="btn-outline flex-1" onClick={() => setConfirm(false)}>{tc("no")}</button><button className="btn-primary flex-1 bg-bad" disabled={pending} onClick={() => run(() => cancelOrderAction(order.id))}>{tc("yes")}</button></div>}>
        <span />
      </Sheet>
      <Sheet open={pause} onClose={() => setPause(false)} title={t("pause")} footer={<button className="btn-primary w-full" disabled={pending} onClick={() => run(() => pauseOrderAction(order.id, until))}>{tc("apply")}</button>}>
        <label className="label">{t("pauseUntil")}</label>
        <input type="date" className="input" min={addDays(ymd(new Date()), 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
      </Sheet>
    </div>
  );
}

export function VisitActions({ visit, order, freeCancelHours, horizonDays }: { visit: { id: string; status: string; scheduledAt: string | null; hasReview: boolean }; order: { kind: string; status: string; serviceId: string; durationMin: number }; freeCancelHours: number; horizonDays: number }) {
  const t = useTranslations("order");
  const tc = useTranslations("common");
  const tb = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<"reschedule" | "cancel" | "review" | null>(null);
  const [pick, setPick] = useState<{ date: string; time: string | null }>({ date: "", time: null });
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const [thanks, setThanks] = useState(false);

  const late = visit.scheduledAt ? new Date(visit.scheduledAt).getTime() - Date.now() < freeCancelHours * 3600_000 : false;
  const active = ["ACTIVE", "PAUSED"].includes(order.status);
  const canChange = active && ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"].includes(visit.status);
  const close = () => { setSheet(null); setErr(undefined); };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {canChange && visit.status === "UNSCHEDULED" && <button className="btn-dark btn-sm" onClick={() => setSheet("reschedule")}>{t("schedule")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && !late && <button className="btn-outline btn-sm" onClick={() => setSheet("reschedule")}>{t("reschedule")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && !late && <button className="btn-ghost btn-sm text-bad" onClick={() => setSheet("cancel")}>{order.kind === "SUBSCRIPTION" ? t("skipVisit") : t("cancelVisit")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && late && <p className="text-xs text-muted">{t("lateCancel", { hours: freeCancelHours })}</p>}
      {visit.status === "DONE" && !visit.hasReview && !thanks && <button className="btn-outline btn-sm" onClick={() => setSheet("review")}><Star size={14} /> {t("leaveReview")}</button>}
      {thanks && <p className="text-sm text-ok">{t("reviewThanks")}</p>}

      <Sheet open={sheet === "reschedule"} onClose={close} title={visit.status === "UNSCHEDULED" ? t("schedule") : t("reschedule")}
        footer={<><button className="btn-primary w-full" disabled={pending || !pick.time} onClick={() => start(async () => {
          const r = await rescheduleVisitAction(visit.id, pick.date, pick.time!);
          if (!r.ok) return setErr(r.error === "slot_taken" ? tb("errors.slot_taken") : tc("error"));
          close(); router.refresh();
        })}>{tc("done")}</button>{err && <p className="mt-2 text-sm text-bad">{err}</p>}</>}>
        {sheet === "reschedule" && <SlotPicker serviceId={order.serviceId} durationMin={order.durationMin} horizonDays={horizonDays} onPick={(date, time) => setPick({ date, time })} />}
      </Sheet>

      <Sheet open={sheet === "cancel"} onClose={close} title={t("cancelConfirm")} footer={<div className="flex gap-2"><button className="btn-outline flex-1" onClick={close}>{tc("no")}</button><button className="btn-primary flex-1 bg-bad" disabled={pending} onClick={() => start(async () => { const r = await cancelVisitAction(visit.id); if (!r.ok) return setErr(tc("error")); close(); router.refresh(); })}>{tc("yes")}</button></div>}>
        {err && <p className="text-sm text-bad">{err}</p>}
      </Sheet>

      <Sheet open={sheet === "review"} onClose={close} title={t("yourReview")} footer={<button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { const r = await reviewAction(visit.id, rating, text); if (r.ok) { setThanks(true); close(); } else setErr(tc("error")); })}>{t("sendReview")}</button>}>
        <div className="mb-3 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} onClick={() => setRating(i)} aria-label={`${i}`}><Star size={36} className={i <= rating ? "fill-brand stroke-brand" : "stroke-line"} /></button>
          ))}
        </div>
        <textarea className="input min-h-28 py-2" placeholder={t("reviewPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
        {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      </Sheet>
    </div>
  );
}
