"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Star } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { cancelOrderAction, cancelVisitAction, pauseOrderAction, rescheduleInfoAction, rescheduleVisitAction, resumeOrderAction, reviewAction } from "@/server/actions/account";
import { Sheet } from "@/components/ui/Sheet";
import { SlotPicker, type SlotMaster } from "@/components/booking/SlotPicker";
import { addDays, ymd } from "@/lib/time";
import { amd } from "@/lib/format";

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

type RescheduleInfo = { allowChooseMaster: boolean; masters: SlotMaster[]; currentMasterId: string | null };

export function VisitActions({ visit, order, freeCancelHours, horizonDays }: { visit: { id: string; status: string; scheduledAt: string | null; hasReview: boolean }; order: { kind: string; status: string; serviceId: string; durationMin: number }; freeCancelHours: number; horizonDays: number }) {
  const t = useTranslations("order");
  const tc = useTranslations("common");
  const tb = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<"reschedule" | "cancel" | "review" | null>(null);
  const [pick, setPick] = useState<{ date: string; time: string | null; masterId: string | null }>({ date: "", time: null, masterId: null });
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const [thanks, setThanks] = useState(false);
  const [rescheduleInfo, setRescheduleInfo] = useState<RescheduleInfo | null>(null);

  const late = visit.scheduledAt ? new Date(visit.scheduledAt).getTime() - Date.now() < freeCancelHours * 3600_000 : false;
  const active = ["ACTIVE", "PAUSED"].includes(order.status);
  const canChange = active && ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"].includes(visit.status);
  const close = () => { setSheet(null); setErr(undefined); };

  function openReschedule() {
    setSheet("reschedule");
    // Загружаем список мастеров для листа переноса
    rescheduleInfoAction(visit.id).then(setRescheduleInfo).catch(() => {});
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {canChange && visit.status === "UNSCHEDULED" && <button className="btn-dark btn-sm" onClick={openReschedule}>{t("schedule")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && !late && <button className="btn-outline btn-sm" onClick={openReschedule}>{t("reschedule")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && !late && <button className="btn-ghost btn-sm text-bad" onClick={() => setSheet("cancel")}>{order.kind === "SUBSCRIPTION" ? t("skipVisit") : t("cancelVisit")}</button>}
      {canChange && visit.status !== "UNSCHEDULED" && late && <p className="text-xs text-muted">{t("lateCancel", { hours: freeCancelHours })}</p>}
      {visit.status === "DONE" && !visit.hasReview && !thanks && <button className="btn-outline btn-sm" onClick={() => setSheet("review")}><Star size={14} /> {t("leaveReview")}</button>}
      {thanks && <p className="text-sm text-ok">{t("reviewThanks")}</p>}

      <Sheet open={sheet === "reschedule"} onClose={close} title={visit.status === "UNSCHEDULED" ? t("schedule") : t("reschedule")}
        footer={<><button className="btn-primary w-full" disabled={pending || !pick.time} onClick={() => start(async () => {
          const r = await rescheduleVisitAction(visit.id, pick.date, pick.time!, pick.masterId);
          if (!r.ok) return setErr(r.error === "slot_taken" ? tb("errors.slot_taken") : tc("error"));
          close(); router.refresh();
        })}>{tc("done")}</button>{err && <p className="mt-2 text-sm text-bad">{err}</p>}</>}>
        {sheet === "reschedule" && (
          <SlotPicker
            serviceId={order.serviceId}
            durationMin={order.durationMin}
            horizonDays={horizonDays}
            masters={rescheduleInfo?.masters}
            currentMasterId={rescheduleInfo?.currentMasterId}
            allowChooseMaster={rescheduleInfo?.allowChooseMaster}
            onPick={(date, time, masterId) => setPick({ date, time, masterId: masterId ?? null })}
          />
        )}
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

/** Главные кнопки действий трекера заказа: перенос, отмена, отзыв, «заказать снова» */
export function OrderTrackerActions({
  order,
  upcomingVisit,
  reviewVisit,
  cancelDeadline,
  freeCancelHours,
  horizonDays,
  isBusy,
  cancelPreview,
  supportContacts,
}: {
  order: { id: string; kind: string; status: string; serviceId: string; durationMin: number; serviceSlug: string };
  upcomingVisit: { id: string; status: string; scheduledAt: string | null } | null;
  reviewVisit: { id: string } | null;
  cancelDeadline: { free: boolean; label: string } | null;
  freeCancelHours: number;
  horizonDays: number;
  isBusy: boolean;
  cancelPreview: { feeAmd: number; freeDeadline: string | undefined; freeHours: number; visitCount: number } | null;
  supportContacts: { href: string; label: string; key: string }[];
}) {
  const t = useTranslations("order");
  const tc = useTranslations("common");
  const tb = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<"reschedule" | "cancel" | "pause" | "review" | "support" | null>(null);
  const [pick, setPick] = useState<{ date: string; time: string | null; masterId: string | null }>({ date: "", time: null, masterId: null });
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [until, setUntil] = useState(addDays(ymd(new Date()), 14));
  const [err, setErr] = useState<string>();
  const [thanks, setThanks] = useState(false);
  const [rescheduleInfo, setRescheduleInfo] = useState<RescheduleInfo | null>(null);

  const isActive = ["ACTIVE", "PAUSED"].includes(order.status);
  const isDone = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canReschedule = isActive && upcomingVisit != null && ["SCHEDULED", "CONFIRMED", "UNSCHEDULED"].includes(upcomingVisit.status);
  const isUnscheduled = upcomingVisit?.status === "UNSCHEDULED";
  const late = upcomingVisit?.scheduledAt ? new Date(upcomingVisit.scheduledAt).getTime() - Date.now() < freeCancelHours * 3600_000 : false;
  const close = () => { setSheet(null); setErr(undefined); };

  function openReschedule() {
    if (!upcomingVisit) return;
    setSheet("reschedule");
    rescheduleInfoAction(upcomingVisit.id).then(setRescheduleInfo).catch(() => {});
  }

  function doCancel() {
    start(async () => {
      const r = await cancelOrderAction(order.id);
      if (!r.ok) return setErr(tc("error"));
      close();
      router.refresh();
    });
  }

  // Заголовок и тело листа подтверждения отмены
  const cancelTitle = (() => {
    if (order.kind === "ONE_TIME" && cancelPreview && cancelPreview.feeAmd > 0 && !cancelPreview.freeDeadline) return t("cancelTitlePaid");
    if (order.kind === "SUBSCRIPTION") return t("cancelTitleSub");
    if (order.kind === "PACKAGE") return t("cancelTitlePackage");
    return t("cancelConfirm");
  })();

  const cancelBody = (() => {
    if (!cancelPreview) return null;
    if (order.kind === "ONE_TIME") {
      if (cancelPreview.freeDeadline) {
        return <p className="text-sm text-muted">{t("cancelConfirmFree", { datetime: cancelPreview.freeDeadline })}</p>;
      }
      if (cancelPreview.feeAmd > 0) {
        return (
          <>
            <p className="text-sm">{t("cancelConfirmPaid", { hours: cancelPreview.freeHours })}</p>
            <p className="mt-1 text-lg font-semibold text-bad">{amd(cancelPreview.feeAmd)}</p>
            <p className="mt-1 text-xs text-muted">{t("cancelConfirmPaidNote")}</p>
          </>
        );
      }
      return <p className="text-sm text-ok">{t("cancelConfirmFreeLabel")}</p>;
    }
    return (
      <>
        <p className="text-sm">{t("cancelConfirmSub", { count: cancelPreview.visitCount })}</p>
        {cancelPreview.feeAmd > 0 ? (
          <p className="mt-1 text-sm font-semibold text-bad">{t("cancelConfirmPenalty", { amount: amd(cancelPreview.feeAmd) })}</p>
        ) : (
          <p className="mt-1 text-sm text-ok">{t("cancelConfirmFreeLabel")}</p>
        )}
      </>
    );
  })();

  if (!isActive && !isDone) return null;

  return (
    <div className="mt-4 space-y-2">
      {/* Кнопки переноса и отмены / поддержка когда мастер в пути */}
      {isActive && isBusy && (
        <div className="flex flex-col gap-1">
          <button className="btn-outline w-full" onClick={() => setSheet("support")}>
            <MessageCircle size={16} /> {t("contactSupport")}
          </button>
          <p className="text-xs text-muted">{t("supportWhileBusy")}</p>
        </div>
      )}
      {isActive && !isBusy && (
        <div className="flex gap-2">
          {canReschedule && !late && (
            <button className="btn-outline flex-1" onClick={openReschedule}>
              {isUnscheduled ? t("schedule") : t("reschedule")}
            </button>
          )}
          <div className="flex flex-1 flex-col gap-1">
            <button
              className="btn-outline w-full border-bad text-bad hover:bg-bad-50"
              onClick={() => setSheet("cancel")}
            >
              {order.kind === "SUBSCRIPTION" ? t("cancelSubscription") : t("cancelOrder")}
            </button>
            {cancelDeadline && (
              <p className={`text-xs ${cancelDeadline.free ? "text-ok" : "text-bad"}`}>
                {cancelDeadline.free
                  ? t("cancelFreeUntil", { datetime: cancelDeadline.label })
                  : t("cancelPaid", { amount: cancelDeadline.label })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Пауза / возобновление для подписки */}
      {isActive && order.kind === "SUBSCRIPTION" && order.status === "ACTIVE" && (
        <button className="btn-outline w-full" onClick={() => setSheet("pause")}>{t("pause")}</button>
      )}
      {isActive && order.kind === "SUBSCRIPTION" && order.status === "PAUSED" && (
        <button className="btn-dark w-full" disabled={pending} onClick={() => start(async () => { await resumeOrderAction(order.id); router.refresh(); })}>
          {t("resume")}
        </button>
      )}

      {/* Оставить отзыв */}
      {reviewVisit && !thanks && (
        <button className="btn-primary w-full" onClick={() => setSheet("review")}>
          <Star size={16} /> {t("leaveReview")}
        </button>
      )}
      {thanks && <p className="text-sm text-ok">{t("reviewThanks")}</p>}

      {/* Заказать снова */}
      {isDone && (
        <Link href={`/book/${order.serviceSlug}`} className="btn-outline flex w-full items-center justify-center">
          {t("bookAgain")}
        </Link>
      )}

      {/* Лист переноса */}
      <Sheet open={sheet === "reschedule"} onClose={close} title={isUnscheduled ? t("schedule") : t("reschedule")}
        footer={<><button className="btn-primary w-full" disabled={pending || !pick.time} onClick={() => start(async () => {
          if (!upcomingVisit) return;
          const r = await rescheduleVisitAction(upcomingVisit.id, pick.date, pick.time!, pick.masterId);
          if (!r.ok) return setErr(r.error === "slot_taken" ? tb("errors.slot_taken") : tc("error"));
          close(); router.refresh();
        })}>{tc("done")}</button>{err && <p className="mt-2 text-sm text-bad">{err}</p>}</>}>
        {sheet === "reschedule" && (
          <SlotPicker
            serviceId={order.serviceId}
            durationMin={order.durationMin}
            horizonDays={horizonDays}
            masters={rescheduleInfo?.masters}
            currentMasterId={rescheduleInfo?.currentMasterId}
            allowChooseMaster={rescheduleInfo?.allowChooseMaster}
            onPick={(date, time, masterId) => setPick({ date, time, masterId: masterId ?? null })}
          />
        )}
      </Sheet>

      {/* Лист отмены */}
      <Sheet open={sheet === "cancel"} onClose={close} title={cancelTitle}
        footer={<div className="flex gap-2">
          <button className="btn-outline flex-1" onClick={close}>{tc("no")}</button>
          <button className="btn-primary flex-1 bg-bad" disabled={pending} onClick={doCancel}>{tc("yes")}</button>
        </div>}>
        {cancelBody}
        {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      </Sheet>

      {/* Лист паузы */}
      <Sheet open={sheet === "pause"} onClose={close} title={t("pause")}
        footer={<button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { await pauseOrderAction(order.id, until); close(); router.refresh(); })}>{tc("apply")}</button>}>
        <label className="label">{t("pauseUntil")}</label>
        <input type="date" className="input" min={addDays(ymd(new Date()), 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
      </Sheet>

      {/* Лист отзыва */}
      {reviewVisit && (
        <Sheet open={sheet === "review"} onClose={close} title={t("yourReview")}
          footer={<button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
            if (!reviewVisit) return;
            const r = await reviewAction(reviewVisit.id, rating, text);
            if (r.ok) { setThanks(true); close(); } else setErr(tc("error"));
          })}>{t("sendReview")}</button>}>
          <div className="mb-3 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} onClick={() => setRating(i)} aria-label={`${i}`}><Star size={36} className={i <= rating ? "fill-brand stroke-brand" : "stroke-line"} /></button>
            ))}
          </div>
          <textarea className="input min-h-28 py-2" placeholder={t("reviewPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          {err && <p className="mt-2 text-sm text-bad">{err}</p>}
        </Sheet>
      )}

      {/* Лист поддержки (когда мастер в пути или работает) */}
      <Sheet open={sheet === "support"} onClose={close} title={t("contactSupport")}
        footer={<button className="btn-outline w-full" onClick={close}>{tc("close")}</button>}>
        <div className="space-y-2 pb-2">
          {supportContacts.map((c) => (
            <a key={c.key} href={c.href} className="btn-outline flex w-full items-center justify-center gap-2">
              {c.label}
            </a>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
