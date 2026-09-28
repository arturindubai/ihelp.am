"use client";
import { useTransition, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { operatorAssignMasterAction, operatorChangeStatusAction } from "@/server/actions/operator";
import type { VisitStatus } from "@prisma/client";

type Master = { id: string; name: Record<string, string> | string };

const STATUSES: VisitStatus[] = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [masterError, setMasterError] = useState<string | null>(null);
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

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const masterName = (m: Master) => {
    if (typeof m.name === "string") return m.name;
    return m.name.ru || m.name.en || Object.values(m.name).find(Boolean) || m.id;
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
        <select
          className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm disabled:opacity-50 flex-1 md:flex-none"
          disabled={pending}
          value={status}
          onChange={(e) => run(() => operatorChangeStatusAction(visitId, e.target.value as VisitStatus))}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {to(`visitStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
