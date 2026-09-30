"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { UsersRound } from "lucide-react";
import { slotsAction } from "@/server/actions/booking";
import { addDays, atYerevan, ymd } from "@/lib/time";
import { cn, dateLabel } from "@/lib/format";
import { Img } from "@/components/Img";
import { Sheet } from "@/components/ui/Sheet";

export type SlotMaster = { id: string; name: string; photo: string | null; rating: number; reviewsCount: number; experienceYears: number };

const AVATAR_PALETTES = ["bg-brand-50 text-brand-text", "bg-ok-50 text-ok", "bg-surface text-muted"];
function masterAvatarBg(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export function SlotPicker({
  serviceId,
  durationMin,
  horizonDays = 21,
  masters,
  currentMasterId,
  allowChooseMaster = false,
  onPick,
}: {
  serviceId: string;
  durationMin: number;
  horizonDays?: number;
  masters?: SlotMaster[];
  currentMasterId?: string | null;
  allowChooseMaster?: boolean;
  onPick: (date: string, time: string | null, masterId?: string | null) => void;
}) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const today = ymd(new Date());
  const days = useMemo(() => Array.from({ length: horizonDays }, (_, i) => addDays(today, i)), [today, horizonDays]);
  const [date, setDate] = useState(days[0]);
  const [time, setTime] = useState<string | null>(null);
  const [slotsState, setSlotsState] = useState<{ date: string; list: { time: string; masterIds: string[]; available: boolean }[] } | null>(null);
  const slots = slotsState?.date === date ? slotsState.list : null;
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  const [filterMasterId, setFilterMasterId] = useState<string | null>(null);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [masterSheetSlot, setMasterSheetSlot] = useState<string | null>(null);
  const [masterSheetChoice, setMasterSheetChoice] = useState<string | null>(currentMasterId ?? null);

  const showMasters = allowChooseMaster && masters && masters.length > 0;
  const masterById = useMemo(() => new Map((masters || []).map((m) => [m.id, m])), [masters]);

  useEffect(() => {
    // Сегодня часто уже нет слотов — автоматически переходим на ближайший доступный день
    if (!manual && slots && slots.filter((s) => s.available).length === 0) {
      const i = days.indexOf(date);
      if (i >= 0 && i < 7) setDate(days[i + 1]);
    }
  }, [slots, manual, date, days]);

  useEffect(() => {
    setTime(null);
    onPick(date, null, undefined);
    const d = date;
    start(async () => setSlotsState({ date: d, list: await slotsAction(serviceId, d, durationMin) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function pickTime(slotTime: string, slotMasterIds: string[]) {
    setTime(slotTime);
    if (!showMasters) {
      setMasterId(null);
      onPick(date, slotTime);
      return;
    }
    if (filterMasterId !== null) {
      // Фильтр на конкретного мастера — выбираем его сразу
      setMasterId(filterMasterId);
      onPick(date, slotTime, filterMasterId);
    } else if (masters!.length === 1) {
      setMasterId(masters![0].id);
      onPick(date, slotTime, masters![0].id);
    } else {
      // Несколько мастеров — открываем лист выбора
      setMasterSheetChoice(currentMasterId && slotMasterIds.includes(currentMasterId) ? currentMasterId : null);
      setMasterSheetSlot(slotTime);
    }
  }

  function confirmMaster() {
    setMasterId(masterSheetChoice);
    setMasterSheetSlot(null);
    onPick(date, masterSheetSlot!, masterSheetChoice);
  }

  return (
    <div>
      {/* Лента дней */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const dt = atYerevan(d, "12:00");
          return (
            <button
              key={d}
              data-on={d === date}
              ref={(el) => { if (el && d === date && el.parentElement) el.parentElement.scrollLeft = Math.max(0, el.offsetLeft - 16); }}
              onClick={() => { setManual(true); setDate(d); }}
              className="select-card min-h-[64px] min-w-[58px] items-center px-2 text-center"
            >
              <span className="text-xs text-muted capitalize">{dateLabel(dt, locale, { weekday: "short" })}</span>
              <span className="text-lg font-bold">{dateLabel(dt, locale, { day: "numeric" })}</span>
              <span className="text-[10px] text-muted">{dateLabel(dt, locale, { month: "short" })}</span>
            </button>
          );
        })}
      </div>

      {/* Фильтр-чипы мастеров */}
      {showMasters && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <button
            onClick={() => { setFilterMasterId(null); setTime(null); setMasterId(null); onPick(date, null); }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
              filterMasterId === null ? "border-action bg-brand-50 text-brand" : "border-line bg-paper"
            )}
          >
            <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-brand text-[11px] text-on-action">★</span>
            <span>{t("anyMaster")}</span>
          </button>
          {masters!.map((m) => (
            <button
              key={m.id}
              onClick={() => { setFilterMasterId(m.id); setTime(null); setMasterId(null); onPick(date, null); }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                filterMasterId === m.id ? "border-action bg-brand-50 text-brand" : "border-line bg-paper"
              )}
            >
              {m.photo ? (
                <Img src={m.photo} width={26} className="size-[26px] shrink-0 rounded-full object-cover" />
              ) : (
                <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-full text-[10px] font-bold", masterAvatarBg(m.name))}>
                  {m.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>{m.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Слоты */}
      <div className="mt-3 min-h-24">
        {pending || !slots ? (
          <p className="text-sm text-muted">{tc("loading")}</p>
        ) : slots.filter((s) => s.available).length === 0 ? (
          <p className="text-sm text-muted">{t("noSlots")}</p>
        ) : (
          <div className={cn("grid gap-2", showMasters ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-4")}>
            {slots.map((s) => {
              const occupied = !s.available;
              const slotMasters = s.masterIds.map((id) => masterById.get(id)).filter(Boolean) as SlotMaster[];
              const dimmed = !occupied && showMasters && filterMasterId !== null && !s.masterIds.includes(filterMasterId);
              const on = s.time === time;
              return (
                <button
                  key={s.time}
                  disabled={occupied}
                  data-on={on}
                  onClick={() => !occupied && pickTime(s.time, s.masterIds)}
                  className={cn(
                    showMasters
                      ? cn("flex flex-col items-center gap-1.5 rounded-xl border py-2 text-center transition", on ? "border-action bg-brand-50 ring-1 ring-action" : "border-line bg-paper")
                      : "select-card min-h-11 min-w-0 items-center py-1 text-sm font-semibold",
                    occupied && "cursor-not-allowed text-muted line-through",
                    dimmed && "pointer-events-none opacity-35"
                  )}
                >
                  <span className={cn(showMasters ? "text-sm font-bold" : "")}>{s.time}</span>
                  {showMasters && slotMasters.length > 0 && (
                    <div className="flex items-center">
                      {slotMasters.slice(0, 3).map((m, idx) => (
                        m.photo ? (
                          <Img key={m.id} src={m.photo} width={20} className={cn("size-5 rounded-full border-[1.5px] border-paper object-cover", idx > 0 && "-ml-1")} />
                        ) : (
                          <span key={m.id} className={cn("grid size-5 place-items-center rounded-full border-[1.5px] border-paper text-[8px] font-bold", idx > 0 && "-ml-1", masterAvatarBg(m.name))}>
                            {m.name.slice(0, 1)}
                          </span>
                        )
                      ))}
                      {slotMasters.length > 3 && (
                        <span className="-ml-1 flex size-5 items-center justify-center rounded-full border-[1.5px] border-paper bg-surface text-[8px] font-medium text-muted">
                          +{slotMasters.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Лист выбора мастера */}
      {showMasters && (
        <Sheet
          open={masterSheetSlot !== null}
          onClose={() => setMasterSheetSlot(null)}
          title={t("whoComes")}
          footer={
            <button className="btn-dark w-full" onClick={confirmMaster}>
              {tc("done")}
            </button>
          }
        >
          <div className="space-y-2">
            {/* «Любой свободный» */}
            <button
              onClick={() => setMasterSheetChoice(null)}
              className={cn(
                "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
                masterSheetChoice === null ? "border-action bg-brand-50" : "border-line bg-paper"
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-text">
                <UsersRound size={20} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{t("anyMaster")}</span>
                <span className="block text-xs text-muted">{t("anyMasterSub")}</span>
              </span>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", masterSheetChoice === null ? "border-action bg-action" : "border-line-strong")}>
                {masterSheetChoice === null && <span className="size-2 rounded-full bg-on-action" />}
              </span>
            </button>
            {/* «Оставить мастера» — показываем только если у визита есть мастер и он доступен в этом слоте */}
            {currentMasterId && masterSheetSlot && slots?.find((s) => s.time === masterSheetSlot)?.masterIds.includes(currentMasterId) && masterById.has(currentMasterId) && (
              (() => {
                const m = masterById.get(currentMasterId)!;
                const on = masterSheetChoice === currentMasterId;
                return (
                  <button
                    onClick={() => setMasterSheetChoice(currentMasterId)}
                    className={cn(
                      "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition",
                      on ? "border-action bg-brand-50" : "border-line bg-paper"
                    )}
                  >
                    {m.photo ? (
                      <Img src={m.photo} width={44} className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold", masterAvatarBg(m.name))}>
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t("sameMaster")}</span>
                      <span className="block text-xs text-muted">{t("sameMasterSub")}</span>
                    </span>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-action bg-action" : "border-line-strong")}>
                      {on && <span className="size-2 rounded-full bg-on-action" />}
                    </span>
                  </button>
                );
              })()
            )}
            {/* Остальные мастера */}
            {masters!.filter((m) => m.id !== currentMasterId).map((m) => {
              const slotMasterIds = masterSheetSlot ? (slots?.find((s) => s.time === masterSheetSlot)?.masterIds ?? []) : [];
              const free = slotMasterIds.includes(m.id);
              const on = masterSheetChoice === m.id;
              return (
                <button
                  key={m.id}
                  disabled={!free}
                  onClick={() => free && setMasterSheetChoice(m.id)}
                  className={cn(
                    "flex w-full flex-row items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-100",
                    on ? "border-action bg-brand-50" : "border-line bg-paper",
                    !free && "cursor-default"
                  )}
                >
                  {m.photo ? (
                    <Img src={m.photo} width={44} className={cn("size-11 shrink-0 rounded-full object-cover", !free && "grayscale")} />
                  ) : (
                    <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold", masterAvatarBg(m.name), !free && "grayscale")}>
                      {m.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{m.name}</span>
                    <span className="block text-xs text-muted">
                      {!free ? t("masterBusy") : (m.reviewsCount ? `★ ${m.rating.toFixed(1)} · ${tc("reviews", { count: m.reviewsCount })}` : tc("new"))}
                      {free && m.experienceYears > 0 && ` · ${tc("yearsExp", { count: m.experienceYears })}`}
                    </span>
                  </span>
                  {free && (
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-action bg-action" : "border-line-strong")}>
                      {on && <span className="size-2 rounded-full bg-on-action" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}
