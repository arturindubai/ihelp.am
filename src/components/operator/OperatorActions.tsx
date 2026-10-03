"use client";
import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { operatorAssignMasterAction, operatorAssignMasterForceAction, operatorChangeStatusAction, getMastersWithAvailabilityAction } from "@/server/actions/operator";
import type { VisitStatus } from "@prisma/client";
import type { MasterWithConflict } from "@/server/services/operatorService";
import { Sheet } from "@/components/ui/Sheet";
import { tr } from "@/i18n/locales";
import { useLocale } from "next-intl";

const STATUSES: VisitStatus[] = ["UNSCHEDULED", "SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS", "DONE", "CANCELLED", "SKIPPED", "NO_SHOW"];

export function OperatorActions({
  visitId,
  masterId,
  status,
  scheduledAt,
}: {
  visitId: string;
  masterId: string | null;
  status: string;
  scheduledAt: string | null;
}) {
  const t = useTranslations("operator");
  const to = useTranslations("order");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Sheet состояние
  const [sheetOpen, setSheetOpen] = useState(false);
  const [masters, setMasters] = useState<MasterWithConflict[] | null>(null);
  const [loadingMasters, setLoadingMasters] = useState(false);

  // Состояние подтверждения назначения «вопреки»
  const [confirmMaster, setConfirmMaster] = useState<MasterWithConflict | null>(null);

  const openSheet = async () => {
    setSheetOpen(true);
    setConfirmMaster(null);
    if (!masters) {
      setLoadingMasters(true);
      const list = await getMastersWithAvailabilityAction(visitId);
      setMasters(list);
      setLoadingMasters(false);
    }
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setConfirmMaster(null);
  };

  const assign = (m: MasterWithConflict) => {
    if (m.conflict) {
      setConfirmMaster(m);
      return;
    }
    start(async () => {
      await operatorAssignMasterAction(visitId, m.id);
      router.refresh();
      closeSheet();
    });
  };

  const forceAssign = () => {
    if (!confirmMaster) return;
    start(async () => {
      await operatorAssignMasterForceAction(visitId, confirmMaster.id);
      router.refresh();
      closeSheet();
    });
  };

  const masterName = (m: MasterWithConflict) => tr(m.name, locale);

  const conflictChip = (c: MasterWithConflict["conflict"]) => {
    if (!c) return null;
    let label = "";
    if (c.type === "offDay") label = t("conflictOffDay");
    else if (c.type === "timeOff") label = t("conflictTimeOff", { date: c.until });
    else if (c.type === "busy") label = t("conflictBusy", { time: `${c.from}–${c.to}` });
    return <span className="chip bg-warn-50 text-warn text-xs">{label}</span>;
  };

  const availableMasters = masters?.filter((m) => !m.conflict) ?? [];
  const unavailableMasters = masters?.filter((m) => m.conflict) ?? [];

  return (
    <div className="mt-3 flex gap-2 flex-wrap justify-end">
      {/* Кнопка назначения мастера */}
      <button
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={openSheet}
      >
        {masterId ? t("changeMaster") : t("assignMaster")}
      </button>

      {/* Статус */}
      <select
        className="min-h-9 rounded-lg border border-line bg-paper px-2 text-sm disabled:opacity-50"
        disabled={pending}
        value={status}
        onChange={(e) =>
          start(async () => {
            await operatorChangeStatusAction(visitId, e.target.value as VisitStatus);
            router.refresh();
          })
        }
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {to(`visitStatus.${s}`)}
          </option>
        ))}
      </select>

      {/* Sheet выбора мастера */}
      <Sheet open={sheetOpen} onClose={closeSheet} title={masterId ? t("changeMaster") : t("assignMaster")}>
        {confirmMaster ? (
          /* Подтверждение назначения вопреки */
          <div className="space-y-3 py-2">
            <p className="text-sm">{t("masterUnavailableConfirm")}</p>
            <button className="btn-danger w-full" disabled={pending} onClick={forceAssign}>
              {t("assignAnyway")}
            </button>
            <button className="btn-ghost btn-sm w-full" onClick={() => setConfirmMaster(null)}>
              {t("cancel")}
            </button>
          </div>
        ) : loadingMasters ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        ) : masters && masters.length === 0 ? (
          <p className="py-4 text-center text-muted">{t("noMastersAvail")}</p>
        ) : (
          <div className="space-y-1 py-2">
            {/* Доступные мастера */}
            {availableMasters.map((m) => (
              <button
                key={m.id}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-surface"
                disabled={pending}
                onClick={() => assign(m)}
              >
                <span className="text-sm font-medium">{masterName(m)}</span>
              </button>
            ))}

            {/* Разделитель, если есть обе группы */}
            {availableMasters.length > 0 && unavailableMasters.length > 0 && (
              <div className="my-2 border-t border-line" />
            )}

            {/* Недоступные мастера */}
            {unavailableMasters.map((m) => (
              <button
                key={m.id}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-surface"
                disabled={pending}
                onClick={() => assign(m)}
              >
                <span className="text-sm text-muted">{masterName(m)}</span>
                {conflictChip(m.conflict)}
              </button>
            ))}

            {/* Если нет доступных */}
            {availableMasters.length === 0 && unavailableMasters.length > 0 && (
              <p className="text-center text-sm text-muted py-1">{t("noAvailMasters")}</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
