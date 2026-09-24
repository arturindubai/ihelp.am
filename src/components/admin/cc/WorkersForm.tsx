"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccSaveWorkersAction } from "@/server/actions/admin/cc";
import { EVERY_MIN, MODELS, MODES, SINGLE, type Pool, type PoolConfig, type WorkersConfig } from "@/lib/workers";
import { cn } from "@/lib/format";

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

/**
 * Главный пульт воркеров, как «Master dispatcher» в LIA: общий выключатель, пробный режим, стоп-кран,
 * снятие паузы после лимита, окно выкладки и настройки триажа. Сохраняется сразу — диспетчер читает на следующем проходе
 */
export function WorkersMaster({ initial, running }: { initial: WorkersConfig; running: number }) {
  const t = useTranslations("admin.cc.workers");
  const [c, setC] = useState(initial);
  const { pending, saved, error, save } = useSave();
  const paused = c.pausedUntil && Date.parse(c.pausedUntil) > Date.now();
  const set = (patch: Partial<WorkersConfig>, persist = true) => {
    setC({ ...c, ...patch });
    if (persist) save(patch as Patch);
  };

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl p-3", c.enabled ? "bg-ok-50" : "bg-surface")}>
        <div className="flex items-center gap-3">
          <span className={cn("size-3 rounded-full", c.enabled ? "bg-ok" : "bg-muted")} />
          <div>
            <div className={cn("font-semibold", c.enabled ? "text-ok" : "text-ink")}>
              {c.enabled ? t("on") : t("off")} · {t("runningCount", { n: running })}
            </div>
            <div className="text-xs text-muted">{c.enabled ? t("onHint") : t("offHint")}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn("chip cursor-pointer gap-1.5 text-xs", c.dryRun ? "bg-warn-50 text-warn" : "bg-paper text-muted")} title={t("dryRunHint")}>
            <input type="checkbox" checked={c.dryRun} onChange={(e) => set({ dryRun: e.target.checked })} disabled={pending} />
            {t("dryRun")}
          </label>
          {c.enabled ? (
            <>
              <button className="btn-outline btn-sm" disabled={pending} onClick={() => set({ enabled: false })}>
                {t("pause")}
              </button>
              <button className="btn-danger btn-sm" disabled={pending} onClick={() => confirm(t("stopAllConfirm")) && set({ enabled: false, stopRunning: true })}>
                {t("stopAll")}
              </button>
            </>
          ) : (
            <button className="btn-primary btn-sm" disabled={pending} onClick={() => set({ enabled: true, stopRunning: false })}>
              {t("enable")}
            </button>
          )}
        </div>
      </div>

      {c.stopRunning && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bad-50 p-3 text-sm text-bad">
          <span>{t("stoppingAll")}</span>
          <button className="btn-outline btn-sm" disabled={pending} onClick={() => set({ stopRunning: false })}>
            {t("stopDone")}
          </button>
        </div>
      )}

      {paused && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-50 p-3 text-sm text-warn">
          <span>
            {t("pausedUntil", { until: new Date(c.pausedUntil!).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}{" "}
            {c.pausedReason ?? t("pausedLimit")}
          </span>
          <button className="btn-outline btn-sm" disabled={pending} onClick={() => set({ pausedUntil: null })}>
            {t("resume")}
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
