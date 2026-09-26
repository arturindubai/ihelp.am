import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pageUser } from "@/server/adminPage";
import { boardAudit, healthStatus } from "@/server/services/ccBoard";
import { otpStats } from "@/server/services/otpStats";
import { Forbidden } from "@/components/admin/ui";
import { CcHeader } from "@/components/admin/cc/CcHeader";
import { SystemPanel } from "@/components/admin/cc/SystemPanel";
import { ErrorLogPanel } from "@/components/admin/cc/ErrorLogPanel";
import { Card } from "@/components/admin/fields";
import { ago } from "@/components/admin/cc/tabs/shared";
import { cn, dateLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Tone = "ok" | "warn" | "bad";

function Metric({ label, value, hint, tone = "ok", href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <div className={cn("card h-full border-l-4 p-3", tone === "ok" && "border-l-ok", tone === "warn" && "border-l-warn", tone === "bad" && "border-l-bad")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span className={cn("size-2 rounded-full", tone === "ok" && "bg-ok", tone === "warn" && "bg-warn", tone === "bad" && "bg-bad")} />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Здоровье, как Health в LIA: сервер, база, память, выкладка, диспетчер и воркеры, ошибки, заказы — в одном месте */
export default async function HealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await pageUser("control"))) return <Forbidden />;
  const [t, th, h, audit, otp] = await Promise.all([getTranslations("admin.cc"), getTranslations("admin.cc.healthPage"), healthStatus(), boardAudit(), otpStats()]);
  const uptime = h.uptimeSec >= 86400 ? th("uptimeD", { d: Math.floor(h.uptimeSec / 86400), h: Math.floor((h.uptimeSec % 86400) / 3600) }) : th("uptimeH", { h: Math.floor(h.uptimeSec / 3600), m: Math.floor((h.uptimeSec % 3600) / 60) });
  const tickTone: Tone = h.tickAgeMin == null ? "warn" : h.tickAgeMin > 3 ? "bad" : "ok";
  const workersValue = h.workers.state === "stopped" ? th("workersStopped") : h.workers.state === "planned" ? th("workersPlanned", { when: `${dateLabel(new Date(h.workers.pausedUntil!), locale, { day: "numeric", month: "short" })}, ${timeLabel(new Date(h.workers.pausedUntil!))}` }) : h.workers.state === "paused" ? th("workersPaused") : h.workers.enabled ? (h.workers.dryRun ? th("workersDry") : th("workersOn")) : th("workersOff");
  const failed = (h.runs24.failed ?? 0) + (h.runs24.timeout ?? 0);

  return (
    <div className="max-w-6xl">
      <CcHeader page="health" locale={locale} />
      <p className="mb-4 text-sm text-muted">{th("subtitle")}</p>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label={th("server")} value={th("serverOk")} hint={`${th("uptime")}: ${uptime}`} />
        <Metric label={th("db")} value={h.dbMs == null ? th("dbDown") : th("ms", { n: h.dbMs })} tone={h.dbMs == null ? "bad" : h.dbMs > 200 ? "warn" : "ok"} />
        <Metric label={th("memory")} value={th("mb", { n: h.rssMb })} hint={th("heap", { n: h.heapMb, node: h.node })} tone={h.rssMb > 900 ? "warn" : "ok"} />
        <Metric label={th("errors")} value={h.errorsHour} hint={th("errorsHint")} tone={h.errorsHour > 20 ? "bad" : h.errorsHour > 0 ? "warn" : "ok"} href="/admin/control/logs" />
        <Metric
          label={th("lastDeploy")}
          value={h.lastDeploy?.deployedSha?.slice(0, 8) ?? "—"}
          hint={h.lastDeploy ? `${h.lastDeploy.key} · ${dateLabel(h.lastDeploy.doneAt!, locale, { day: "numeric", month: "short" })}` : undefined}
          tone="ok"
          href="/admin/control/releases"
        />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={th("dispatcher")} value={h.tickAgeMin == null ? th("dispatcherNever") : ago(t, new Date(Date.now() - h.tickAgeMin * 60_000))} hint={th("dispatcherHint")} tone={tickTone} href="/admin/control?tab=workers" />
        <Metric label={th("workers")} value={workersValue} hint={th("workersRunning", { n: h.workers.running })} tone={h.workers.state === "stopped" ? "bad" : h.workers.pausedUntil ? "warn" : "ok"} href="/admin/control?tab=workers" />
        <Metric label={th("runs24")} value={Object.values(h.runs24).reduce((a, b) => a + b, 0)} hint={th("runs24Hint", { failed, limit: h.runs24.limit ?? 0 })} tone={failed ? "warn" : "ok"} />
        <Metric label={th("orders")} value={`${h.orders24} / ${h.orders7}`} hint={th("ordersHint")} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Metric
          label={th("otp24h")}
          value={otp.requests24h}
          hint={otp.byChannel.length > 0 ? otp.byChannel.map((c) => th("otpByChannel", { channel: c.channel, n: c.count })).join(" · ") : th("otp24hHint")}
          tone="ok"
        />
        <Metric
          label={th("otpErrors")}
          value={otp.errorChannels.length === 0 ? th("otpErrorsNone") : otp.errorChannels.length}
          hint={otp.errorChannels.length > 0 ? otp.errorChannels.map((e) => `${e.channel} ×${e.count}`).join(", ") : th("otpErrorsHint")}
          tone={otp.errorChannels.length === 0 ? "ok" : "bad"}
        />
      </div>

      <Card title={`${th("audit.title")} · ${audit.total}`} className="mb-4">
        {audit.checks.length === 0 ? (
          <p className="text-sm text-ok">{th("audit.ok")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audit.checks.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{th(`audit.checks.${c.id}` as "audit.checks.blocked_no_reason")}</span> <span className="chip bg-warn-50 text-[10px] text-warn">{c.keys.length}</span>
                <span className="ml-2 font-mono text-xs text-muted">
                  {c.keys.slice(0, 40).map((k) => (
                    <Link key={k} href={`/admin/control?task=${k.split("→")[0]}`} scroll={false} className="mr-2 hover:underline">
                      {k}
                    </Link>
                  ))}
                  {c.keys.length > 40 && `… +${c.keys.length - 40}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{th("audit.hint")}</p>
      </Card>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <SystemPanel system={h.sys} />
        <Card title={th("howTo")}>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-muted">
            <li>{th("tips.dispatcher")}</li>
            <li>{th("tips.login")}</li>
            <li>{th("tips.stop")}</li>
            <li>{th("tips.logs")}</li>
          </ul>
        </Card>
      </div>

      <ErrorLogPanel errors={h.errors} />
    </div>
  );
}
