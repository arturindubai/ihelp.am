"use client";
import { useTransition, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { operatorAssignMasterAction, operatorChangeStatusAction } from "@/server/actions/operator";
import { Sheet } from "@/components/ui/Sheet";
import type { VisitStatus } from "@prisma/client";

type Master = { id: string; name: Record<string, string> | string };

const STATUSES: VisitStatus[] = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];

/** Статусы, требующие подтверждения с предупреждением о сообщении клиенту */
const CRITICAL_STATUSES: VisitStatus[] = ["DONE", "CANCELLED", "NO_SHOW", "ON_WAY"];

export function OperatorActions({
  visitId,
  masterId,
  status,
  masters,
}: {
  visitId: string;
  masterId: string | null;
  status: VisitStatus;
  masters: Master[];
}) {
  const t = useTranslations("operator");
  const to = useTranslations("order");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [masterError, setMasterError] = useState<string | null>(null);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<VisitStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showMasterError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setMasterError(msg);
    errorTimerRef.current = setTimeout(() => setMasterError(null), 5000);
  };

  const masterName = (m: Master) => {
    if (typeof m.name === "string") return m.name;
    return m.name.ru || m.name.en || Object.values(m.name).find(Boolean) || m.id;
  };

  const applyStatus = (s: VisitStatus) => {
    start(async () => {
      setStatusError(null);
      const result = await operatorChangeStatusAction(visitId, s);
      if (!result.ok) {
        setStatusError(t("statusChangedError"));
      } else {
        setStatusSheetOpen(false);
        setPendingStatus(null);
        router.refresh();
      }
    });
  };

  const handleStatusClick = (s: VisitStatus) => {
    if (CRITICAL_STATUSES.includes(s)) {
      setPendingStatus(s);
    } else {
      applyStatus(s);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2 md:flex-row md:justify-end">
      <div className="flex flex-col gap-1 flex-1 md:flex-none">
        <select
          className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm disabled:opacity-50 w-full md:w-auto"
          disabled={pending}
          value={masterId || ""}
          onChange={(e) => {
            setMasterError(null);
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
            const newMasterId = e.target.value || null;
            start(async () => {
              const result = await operatorAssignMasterAction(visitId, newMasterId);
              if (!result.ok) {
                const msg = result.error === "busy" ? t("masterBusy") : t("error");
                showMasterError(msg);
              } else {
                router.refresh();
              }
            });
          }}
        >
          <option value="">{masters.length === 0 ? t("noMastersAvail") : t("selectMaster")}</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {masterName(m)}
            </option>
          ))}
        </select>
        {masterError && (
          <p className="rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{masterError}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="btn-outline btn-sm flex-1 md:flex-none"
          disabled={pending}
          onClick={() => { setPendingStatus(null); setStatusError(null); setStatusSheetOpen(true); }}
        >
          {t("changeStatus")}
        </button>
      </div>

      <Sheet
        open={statusSheetOpen}
        onClose={() => { setStatusSheetOpen(false); setPendingStatus(null); setStatusError(null); }}
        title={pendingStatus ? to(`visitStatus.${pendingStatus}`) : t("changeStatus")}
      >
        {pendingStatus ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">{t("confirmStatusBody")}</p>
            {statusError && <p className="rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{statusError}</p>}
            <div className="flex flex-col gap-2 md:flex-row md:gap-2">
              <button
                className="btn-primary w-full md:w-auto"
                disabled={pending}
                onClick={() => applyStatus(pendingStatus)}
              >
                {t("confirmStatusBtn")}
              </button>
              <button
                className="btn-ghost w-full md:w-auto"
                onClick={() => setPendingStatus(null)}
              >
                {tc("back")}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-1">
            {statusError && <p className="rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad mb-2">{statusError}</p>}
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`btn-ghost w-full text-left${s === status ? " font-semibold text-brand" : ""}`}
                disabled={pending}
                onClick={() => handleStatusClick(s)}
              >
                {to(`visitStatus.${s}`)}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
