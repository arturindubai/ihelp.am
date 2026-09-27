"use client";
import { useTransition } from "react";
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
      <div className="flex gap-2">
        <select
          className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm disabled:opacity-50 flex-1 md:flex-none"
          disabled={pending}
          value={masterId || ""}
          onChange={(e) => run(() => operatorAssignMasterAction(visitId, e.target.value || null))}
        >
          <option value="">{masters.length === 0 ? t("noMastersAvail") : t("selectMaster")}</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {masterName(m)}
            </option>
          ))}
        </select>
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
