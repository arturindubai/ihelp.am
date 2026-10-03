"use client";
import { useTransition, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Phone, Navigation, Check } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { proCashAction, proStatusAction, proUndoStatusAction } from "@/server/actions/pro";
import { amd } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";

const UNDO_WINDOW_MS = 5 * 60 * 1000;

function pad(n: number) { return String(n).padStart(2, "0"); }

export function ProVisitActions({
  visit,
  phone,
  mapQuery,
  isToday,
  scheduledAt,
}: {
  visit: { id: string; status: string; cashCollected: boolean; price: number; isCash: boolean };
  phone: string | null;
  mapQuery: string;
  isToday: boolean;
  scheduledAt: string | null;
}) {
  const t = useTranslations("pro");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmType, setConfirmType] = useState<"onWay" | "finish" | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ actionedAt: number } | null>(null);
  const [undoRemaining, setUndoRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!undoInfo) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const tick = () => {
      const rem = UNDO_WINDOW_MS - (Date.now() - undoInfo.actionedAt);
      if (rem <= 0) { setUndoInfo(null); setUndoRemaining(0); return; }
      setUndoRemaining(rem);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [undoInfo]);

  const runStatus = (status: "ON_WAY" | "IN_PROGRESS" | "DONE") =>
    start(async () => {
      const r = await proStatusAction(visit.id, status);
      if (!r.ok) return;
      if (status === "ON_WAY" || status === "DONE") {
        setUndoInfo({ actionedAt: Date.now() });
      }
      setConfirmType(null);
      router.refresh();
    });

  const runUndo = () =>
    start(async () => {
      const r = await proUndoStatusAction(visit.id);
      if (!r.ok) return;
      setUndoInfo(null);
      router.refresh();
    });

  const runCash = () =>
    start(async () => {
      await proCashAction(visit.id);
      router.refresh();
    });

  /** Доступно не раньше чем за 3 часа до начала */
  const isWithinTimeWindow = (() => {
    if (!scheduledAt) return false;
    const threeHoursBefore = new Date(scheduledAt).getTime() - 3 * 3600_000;
    return Date.now() >= threeHoursBefore;
  })();

  const NEXT_MAP: Record<string, ["ON_WAY" | "IN_PROGRESS" | "DONE", string, "onWay" | "finish" | null]> = {
    SCHEDULED: ["ON_WAY", t("onWay"), "onWay"],
    CONFIRMED: ["ON_WAY", t("onWay"), "onWay"],
    ON_WAY: ["IN_PROGRESS", t("start"), null],
    IN_PROGRESS: ["DONE", t("finish"), "finish"],
  };
  const next = NEXT_MAP[visit.status];

  const countdownStr = (() => {
    const ms = undoRemaining;
    return `${pad(Math.floor(ms / 60_000))}:${pad(Math.floor((ms % 60_000) / 1000))}`;
  })();

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${phone}`} className="btn-outline btn-sm"><Phone size={16} /> {t("call")}</a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" className="btn-outline btn-sm"><Navigation size={16} /> {t("route")}</a>
      </div>

      {isToday && next && (
        <div className="space-y-2">
          {isWithinTimeWindow ? (
            <button
              className="btn-dark w-full"
              disabled={pending}
              onClick={() => next[2] ? setConfirmType(next[2]) : runStatus(next[0])}
            >
              {next[1]}
            </button>
          ) : (
            <div>
              <button className="btn-dark w-full" disabled>{next[1]}</button>
              <p className="mt-1 text-center text-xs text-muted">{t("notYetAvailable")}</p>
            </div>
          )}
          {undoInfo && undoRemaining > 0 && (
            <button
              className="btn-outline btn-sm w-full border-bad text-bad"
              disabled={pending}
              onClick={runUndo}
            >
              {t("undoCountdown", { time: countdownStr })}
            </button>
          )}
        </div>
      )}

      {visit.isCash && ["IN_PROGRESS", "DONE"].includes(visit.status) && (
        visit.cashCollected ? (
          <div className="chip w-full justify-center bg-ok-50 py-2 text-ok">
            <Check size={16} /> {t("cashDone")}
          </div>
        ) : (
          <button className="btn-primary w-full" disabled={pending || !isToday} onClick={runCash}>
            {t("cashCollected", { amount: amd(visit.price) })}
          </button>
        )
      )}

      {/* Подтверждение «Выехал» */}
      <Sheet open={confirmType === "onWay"} onClose={() => setConfirmType(null)} title={t("confirmActionTitle")} footer={
        <div className="flex flex-col gap-2">
          <button className="btn-primary w-full" disabled={pending} onClick={() => runStatus("ON_WAY")}>{t("onWay")}</button>
          <button className="btn-ghost w-full" onClick={() => setConfirmType(null)}>{tc("cancel")}</button>
        </div>
      }>
        <p className="py-2 text-sm">{t("confirmOnWayBody")}</p>
      </Sheet>

      {/* Подтверждение «Завершил» */}
      <Sheet open={confirmType === "finish"} onClose={() => setConfirmType(null)} title={t("confirmFinishTitle")} footer={
        <div className="flex flex-col gap-2">
          <button className="btn-primary w-full" disabled={pending} onClick={() => runStatus("DONE")}>{t("finish")}</button>
          <button className="btn-ghost w-full" onClick={() => setConfirmType(null)}>{tc("cancel")}</button>
        </div>
      }>
        <p className="py-2 text-sm">{t("confirmFinishBody")}</p>
      </Sheet>
    </div>
  );
}
