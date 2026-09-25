"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccSaveWorkersAction, ccWorkersControlAction } from "@/server/actions/admin/cc";
import { EVERY_MIN, MODELS, MODES, SINGLE, workersState, type Pool, type PoolConfig, type WorkersCommand, type WorkersConfig, type WorkersState } from "@/lib/workers";
import { cn, dateLabel, timeLabel } from "@/lib/format";

type Patch = Parameters<typeof ccSaveWorkersAction>[0];

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const save = (patch: Patch) =>
    start(async () => {
      setError(false);
      const r = await ccSaveWorkersAction(patch);
      if (!r.ok) return setError(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  return { pending, saved, error, save };
}

/** Дата и время по Еревану для подписи состояния — теми же Intl-помощниками, что на сервере, чтобы не расходилась гидратация */
const when = (iso: string) => `${dateLabel(new Date(iso), "ru", { day: "numeric", month: "short" })}, ${timeLabel(new Date(iso))}`;

/** Значение поля datetime-local (стенное время по Еревану, UTC+4 без перевода часов) → ISO */
const yerevanToIso = (local: string) => (local ? new Date(`${local}:00+04:00`).toISOString() : null);

/** Значение для datetime-local по умолчанию: через час, по Еревану, минуты округлены */
const defaultPlanLocal = () => {
  const d = new Date(Date.now() + 3600_000 + 4 * 3600_000);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
};

const STATE_TONE: Record<WorkersState, { box: string; dot: string; text: string }> = {
  running: { box: "bg-ok-50", dot: "bg-ok", text: "text-ok" },
  off: { box: "bg-surface", dot: "bg-muted", text: "text-ink" },
  paused: { box: "bg-warn-50", dot: "bg-warn", text: "text-warn" },
  planned: { box: "bg-brand-50", dot: "bg-brand", text: "text-brand" },
  stopped: { box: "bg-bad-50", dot: "bg-bad", text: "text-bad" },
};

/**
 * Главный пульт воркеров, как «Master dispatcher» в LIA: состояние словами и четыре кнопки владельца —
 * Пауза, Стоп, Старт, План старт (через 1–5 ч или дата-время по Еревану); пробный режим, окно выкладки и настройки триажа.
 * Сохраняется сразу — диспетчер читает на следующем проходе
 */
export function WorkersMaster({ initial, running }: { initial: WorkersConfig; running: number }) {
  const t = useTranslations("admin.cc.workers");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const { pending, saved, error, save } = useSave();
  const [busy, startControl] = useTransition();
  const [controlError, setControlError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [planLocal, setPlanLocal] = useState("");
  const state = workersState(c);
  const tone = STATE_TONE[state];
  const set = (patch: Partial<WorkersConfig>, persist = true) => {
    setC({ ...c, ...patch });
    if (persist) save(patch as Patch);
  };
  const control = (command: WorkersCommand, at?: string | null) =>
    startControl(async () => {
      setControlError(null);
      const r = await ccWorkersControlAction(command, at ?? undefined);
      if (!r.ok) return setControlError(r.error === "past" ? t("planPast") : t("invalid"));
      setC(r.config);
      setPlanOpen(false);
      router.refresh();
    });
  const plan = (iso: string | null) => {
    if (!iso || Date.parse(iso) <= Date.now()) return setControlError(t("planPast"));
    control("plan", iso);
  };
  const disabled = pending || busy;

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl p-3", tone.box)}>
        <div className="flex items-center gap-3">
          <span className={cn("size-3 rounded-full", tone.dot, state === "running" && running > 0 && "animate-pulse")} />
          <div>
            <div className={cn("font-semibold", tone.text)}>
              {state === "planned" ? t("state.planned", { when: when(c.pausedUntil!) }) : t(`state.${state}`)} · {t("runningCount", { n: running })}
            </div>
            <div className="text-xs text-muted">
              {state === "running" && t("onHint")}
              {state === "off" && t("offHint")}
              {state === "paused" && (c.pausedReason ?? t("pausedLimit"))}
              {state === "paused" && c.pausedUntil && Date.parse(c.pausedUntil) - Date.now() < 365 * 86400_000 && ` · ${t("pausedUntilShort", { until: when(c.pausedUntil) })}`}
              {state === "stopped" && t("stoppingAll")}
              {state === "planned" && t("planHint")}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn("chip cursor-pointer gap-1.5 text-xs", c.dryRun ? "bg-warn-50 text-warn" : "bg-paper text-muted")} title={t("dryRunHint")}>
            <input type="checkbox" checked={c.dryRun} onChange={(e) => set({ dryRun: e.target.checked })} disabled={disabled} />
            {t("dryRun")}
          </label>
          <button className="btn-outline btn-sm" disabled={disabled || state === "paused"} title={t("pauseHint")} onClick={() => control("pause")}>
            {t("pause")}
          </button>
          <button className="btn-danger btn-sm" disabled={disabled || state === "stopped"} title={t("stopHint")} onClick={() => confirm(t("stopConfirm")) && control("stop")}>
            {t("stop")}
          </button>
          <button className="btn-primary btn-sm" disabled={disabled} title={t("startHint")} onClick={() => control("start")}>
            {t("start")}
          </button>
          <button
            className={cn("btn-outline btn-sm", planOpen && "bg-surface")}
            disabled={disabled}
            title={t("planHint")}
            onClick={() => {
              setControlError(null);
              if (!planLocal) setPlanLocal(defaultPlanLocal());
              setPlanOpen((v) => !v);
            }}
          >
            {t("plan")}
          </button>
        </div>
      </div>

      {planOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-brand-50 p-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((h) => (
              <button key={h} type="button" className="btn-outline btn-sm" disabled={disabled} onClick={() => plan(new Date(Date.now() + h * 3600_000).toISOString())}>
                {t("planIn", { h })}
              </button>
            ))}
          </div>
          <div>
            <label className="label">{t("planAt")}</label>
            <input className="input h-9 w-auto py-1" type="datetime-local" value={planLocal} onChange={(e) => setPlanLocal(e.target.value)} disabled={disabled} />
          </div>
          <button type="button" className="btn-dark btn-sm" disabled={disabled || !planLocal} onClick={() => plan(yerevanToIso(planLocal))}>
            {t("planSubmit")}
          </button>
          {state === "planned" && (
            <button type="button" className="btn-outline btn-sm" disabled={disabled} onClick={() => control("pause")}>
              {t("planCancel")}
            </button>
          )}
        </div>
      )}
      {controlError && <p className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{controlError}</p>}

      {c.stopRunning && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bad-50 p-3 text-sm text-bad">
          <span>{t("stoppingAll")}</span>
          <button className="btn-outline btn-sm" disabled={disabled} onClick={() => set({ stopRunning: false })}>
            {t("stopDone")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 text-sm">
        <div>
          <label className="label">{t("window")}</label>
          <div className="flex items-center gap-1.5">
            <input className="input h-9 w-16 py-1" type="number" min={0} max={23} value={c.deployWindow[0]} onChange={(e) => set({ deployWindow: [Number(e.target.value), c.deployWindow[1]] }, false)} />
            —
            <input className="input h-9 w-16 py-1" type="number" min={1} max={24} value={c.deployWindow[1]} onChange={(e) => set({ deployWindow: [c.deployWindow[0], Number(e.target.value)] }, false)} />
          </div>
        </div>
        <div>
          <label className="label">{t("triageBatch")}</label>
          <input className="input h-9 w-20 py-1" type="number" min={1} max={15} value={c.triageBatch} onChange={(e) => set({ triageBatch: Number(e.target.value) }, false)} />
        </div>
        <div>
          <label className="label">{t("sweepEveryH")}</label>
          <input className="input h-9 w-20 py-1" type="number" min={0} max={168} value={c.sweepEveryH} onChange={(e) => set({ sweepEveryH: Number(e.target.value) }, false)} />
        </div>
        <button className="btn-dark btn-sm" disabled={pending} onClick={() => save({ deployWindow: c.deployWindow, triageBatch: c.triageBatch, sweepEveryH: c.sweepEveryH })}>
          {saved ? t("saved") : t("save")}
        </button>
      </div>
      <p className="text-xs text-muted">{t("windowHint")}</p>
      {error && <p className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{t("invalid")}</p>}
    </div>
  );
}

/** Настройки одного пула, как слот в Pools у LIA: включён, режим, интервал, модель, слоты, дневной лимит */
export function PoolSettings({ pool, initial }: { pool: Pool; initial: PoolConfig }) {
  const t = useTranslations("admin.cc.workers");
  const [p, setP] = useState(initial);
  const { pending, saved, error, save } = useSave();
  const put = (patch: Partial<PoolConfig>, persist = false) => {
    const next = { ...p, ...patch };
    setP(next);
    if (persist) save({ pools: { [pool]: patch } } as Patch);
  };
  const single = SINGLE.includes(pool);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={p.enabled} onChange={(e) => put({ enabled: e.target.checked }, true)} disabled={pending} />
          {t("enabled")}
        </label>
        <div className="flex gap-0.5 rounded-lg bg-surface p-0.5 text-xs">
          {MODES.map((m) => (
            <button key={m} type="button" className={cn("rounded-md px-2 py-1", p.mode === m ? "bg-paper font-medium shadow-sm" : "text-muted")} onClick={() => put({ mode: m }, true)} disabled={pending}>
              {t(`modes.${m}`)}
            </button>
          ))}
        </div>
        {p.mode === "scheduled" && (
          <select className="input h-8 w-auto py-0.5 text-xs" value={p.everyMin} onChange={(e) => put({ everyMin: Number(e.target.value) }, true)}>
            {EVERY_MIN.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? t("everyM", { m }) : t("everyH", { h: m / 60 })}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">{t("model")}</span>
          <select className="input h-8 w-auto py-0.5 text-xs" value={p.model} onChange={(e) => put({ model: e.target.value as PoolConfig["model"] })}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">{t("max")}</span>
          <input className="input h-8 w-14 py-0.5 text-xs" type="number" min={0} max={single ? 1 : 4} value={p.max} disabled={single} onChange={(e) => put({ max: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted">{t("dailyCap")}</span>
          <input className="input h-8 w-16 py-0.5 text-xs" type="number" min={0} max={100} value={p.dailyCap} onChange={(e) => put({ dailyCap: Number(e.target.value) })} />
        </label>
        <button className="btn-outline btn-sm" disabled={pending} onClick={() => save({ pools: { [pool]: { model: p.model, max: p.max, dailyCap: p.dailyCap } } } as Patch)}>
          {saved ? t("saved") : t("save")}
        </button>
      </div>
      {error && <p className="text-xs text-bad">{t("invalid")}</p>}
    </div>
  );
}
