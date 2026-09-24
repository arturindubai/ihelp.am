"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ccSaveWorkersAction } from "@/server/actions/admin/cc";
import { MODELS, POOLS, type WorkersConfig } from "@/lib/workers";
import { cn } from "@/lib/format";

/**
 * Настройки воркеров: общий выключатель, пулы (сколько одновременно, модель, дневной лимит), окно выкладки,
 * стоп-кран и снятие паузы после исчерпанного лимита подписки. Сохраняется сразу для диспетчера
 */
export function WorkersForm({ initial }: { initial: WorkersConfig }) {
  const t = useTranslations("admin.cc.workers");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (patch: Partial<WorkersConfig> & { pausedUntil?: null }) =>
    start(async () => {
      setError(null);
      const r = await ccSaveWorkersAction(patch as Parameters<typeof ccSaveWorkersAction>[0]);
      if (!r.ok) return setError(t("invalid"));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  const setPool = (p: (typeof POOLS)[number], patch: Partial<WorkersConfig["pools"]["dev"]>) => setC((x) => ({ ...x, pools: { ...x.pools, [p]: { ...x.pools[p], ...patch } } }));
  const paused = c.pausedUntil && Date.parse(c.pausedUntil) > Date.now();

  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg p-3", c.enabled ? "bg-ok-50" : "bg-surface")}>
        <div>
          <div className={cn("font-medium", c.enabled ? "text-ok" : "text-muted")}>{c.enabled ? t("on") : t("off")}</div>
          <div className="text-xs text-muted">{c.enabled ? t("onHint") : t("offHint")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.enabled ? (
            <>
              <button className="btn-outline btn-sm" disabled={pending} onClick={() => (setC({ ...c, enabled: false }), save({ enabled: false }))}>
                {t("pause")}
              </button>
              <button className="btn-danger btn-sm" disabled={pending} onClick={() => (setC({ ...c, enabled: false, stopRunning: true }), save({ enabled: false, stopRunning: true }))}>
                {t("stopAll")}
              </button>
            </>
          ) : (
            <button className="btn-primary btn-sm" disabled={pending} onClick={() => (setC({ ...c, enabled: true, stopRunning: false }), save({ enabled: true, stopRunning: false }))}>
              {t("enable")}
            </button>
          )}
        </div>
      </div>

      {paused && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-50 p-3 text-sm text-warn">
          <span>{t("paused", { until: new Date(c.pausedUntil!).toLocaleString("ru-RU", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</span>
          <button className="btn-outline btn-sm" disabled={pending} onClick={() => (setC({ ...c, pausedUntil: null }), save({ pausedUntil: null }))}>
            {t("resume")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">{t("pool")}</th>
              <th className="py-1 pr-3 font-medium">{t("enabled")}</th>
              <th className="py-1 pr-3 font-medium">{t("max")}</th>
              <th className="py-1 pr-3 font-medium">{t("model")}</th>
              <th className="py-1 pr-3 font-medium">{t("dailyCap")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {POOLS.map((p) => (
              <tr key={p}>
                <td className="py-2 pr-3">
                  <div className="font-medium">{t(`pools.${p}`)}</div>
                  <div className="text-xs text-muted">{t(`poolHints.${p}`)}</div>
                </td>
                <td className="py-2 pr-3">
                  <input type="checkbox" checked={c.pools[p].enabled} onChange={(e) => setPool(p, { enabled: e.target.checked })} />
                </td>
                <td className="py-2 pr-3">
                  <input className="input h-9 w-16 py-1" type="number" min={0} max={p === "deployer" ? 1 : 4} value={c.pools[p].max} disabled={p === "deployer"} onChange={(e) => setPool(p, { max: Number(e.target.value) })} />
                </td>
                <td className="py-2 pr-3">
                  <select className="input h-9 w-auto py-1" value={c.pools[p].model} onChange={(e) => setPool(p, { model: e.target.value as (typeof MODELS)[number] })}>
                    {MODELS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input className="input h-9 w-20 py-1" type="number" min={0} max={100} value={c.pools[p].dailyCap} onChange={(e) => setPool(p, { dailyCap: Number(e.target.value) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="label">{t("window")}</label>
          <div className="flex items-center gap-2">
            <input className="input h-9 w-16 py-1" type="number" min={0} max={23} value={c.deployWindow[0]} onChange={(e) => setC({ ...c, deployWindow: [Number(e.target.value), c.deployWindow[1]] })} />
            —
            <input className="input h-9 w-16 py-1" type="number" min={1} max={24} value={c.deployWindow[1]} onChange={(e) => setC({ ...c, deployWindow: [c.deployWindow[0], Number(e.target.value)] })} />
          </div>
        </div>
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => save({ pools: c.pools, deployWindow: c.deployWindow })}>
          {saved ? t("saved") : t("save")}
        </button>
      </div>
      <p className="text-xs text-muted">{t("windowHint")}</p>
      {error && <p className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}
    </div>
  );
}
