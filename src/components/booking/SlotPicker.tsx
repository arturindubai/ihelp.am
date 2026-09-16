"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { slotsAction } from "@/server/actions/booking";
import { addDays, atYerevan, ymd } from "@/lib/time";
import { dateLabel } from "@/lib/format";

export function SlotPicker({ serviceId, durationMin, horizonDays = 21, onPick }: { serviceId: string; durationMin: number; horizonDays?: number; onPick: (date: string, time: string | null) => void }) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const today = ymd(new Date());
  const days = useMemo(() => Array.from({ length: horizonDays }, (_, i) => addDays(today, i)), [today, horizonDays]);
  const [date, setDate] = useState(days[0]);
  const [time, setTime] = useState<string | null>(null);
  const [slotsState, setSlotsState] = useState<{ date: string; list: { time: string }[] } | null>(null);
  const slots = slotsState?.date === date ? slotsState.list : null;
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  useEffect(() => {
    // Сегодня часто уже нет слотов — автоматически переходим на ближайший доступный день
    if (!manual && slots && slots.length === 0) {
      const i = days.indexOf(date);
      if (i >= 0 && i < 7) setDate(days[i + 1]);
    }
  }, [slots, manual, date, days]);
  useEffect(() => {
    setTime(null);
    onPick(date, null);
    const d = date;
    start(async () => setSlotsState({ date: d, list: await slotsAction(serviceId, d, durationMin) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const dt = atYerevan(d, "12:00");
          return (
            <button key={d} data-on={d === date} ref={(el) => { if (el && d === date && el.parentElement) el.parentElement.scrollLeft = Math.max(0, el.offsetLeft - 16); }} onClick={() => { setManual(true); setDate(d); }} className="select-card min-h-[64px] min-w-[58px] items-center px-2 text-center">
              <span className="text-xs text-muted capitalize">{dateLabel(dt, locale, { weekday: "short" })}</span>
              <span className="text-lg font-bold">{dateLabel(dt, locale, { day: "numeric" })}</span>
              <span className="text-[10px] text-muted">{dateLabel(dt, locale, { month: "short" })}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-24">
        {pending || !slots ? <p className="text-sm text-muted">{tc("loading")}</p> : slots.length === 0 ? <p className="text-sm text-muted">{t("noSlots")}</p> : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button key={s.time} data-on={s.time === time} onClick={() => { setTime(s.time); onPick(date, s.time); }} className="select-card min-h-11 min-w-0 items-center py-1 text-sm font-semibold">{s.time}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
