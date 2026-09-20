import { getTranslations } from "next-intl/server";
import { Card } from "@/components/admin/fields";
import { cn } from "@/lib/format";
import type { systemStatus } from "@/server/services/cc";

type System = Awaited<ReturnType<typeof systemStatus>>;

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("text-right font-medium", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</span>
    </div>
  );
}

/** Живое состояние системы: бэкапы, фоновые задачи, диск, каналы связи, объём данных */
export async function SystemPanel({ system }: { system: System }) {
  const t = await getTranslations("admin.cc");
  const ago = (hours: number | null) => {
    if (hours == null) return t("never");
    if (hours < 1) return t("minAgo", { m: Math.max(1, Math.round(hours * 60)) });
    if (hours < 48) return t("hoursAgo", { h: Math.round(hours) });
    return t("daysAgo", { d: Math.round(hours / 24) });
  };
  const flag = (on: boolean) => (on ? t("on") : t("off"));

  return (
    <Card title={t("system")}>
      <Row
        label={t("backup")}
        value={system.backup.failed ? t("failed") : ago(system.backup.ageHours)}
        tone={system.backup.failed || (system.backup.ageHours ?? 99) > 26 ? "bad" : "ok"}
      />
      <Row
        label={t("restoreCheck")}
        value={system.restoreCheck.failed ? t("failed") : system.restoreCheck.lastOkAt ? t("ok") : t("never")}
        tone={system.restoreCheck.failed ? "bad" : system.restoreCheck.lastOkAt ? "ok" : "warn"}
      />
      <Row
        label={t("cron")}
        value={system.cron.ageMin == null ? t("never") : t("minAgo", { m: Math.round(system.cron.ageMin) })}
        tone={(system.cron.ageMin ?? 999) > 60 ? "bad" : "ok"}
      />
      <Row
        label={t("disk")}
        value={system.diskFreePct == null ? "—" : `${system.diskFreePct}%`}
        tone={system.diskFreePct != null && system.diskFreePct < 15 ? "bad" : "ok"}
      />
      <Row label={t("otpChannels")} value={system.otpChannels.length ? system.otpChannels.join(", ") : t("off")} tone={system.otpChannels.length ? "ok" : "bad"} />
      <Row label={t("teamChat")} value={flag(system.teamChat)} tone={system.teamChat ? "ok" : "warn"} />
      <Row label={t("techChat")} value={flag(system.techChat)} tone={system.techChat ? "ok" : "warn"} />
      <Row label={t("https")} value={flag(system.https)} tone={system.https ? "ok" : "warn"} />
      <Row label={t("indexing")} value={system.indexing === "all" ? t("on") : t("off")} />
      <Row label={t("agentApi")} value={flag(system.agentApi)} />
      <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
        {t("data")}: {t("orders")} {system.data.orders} · {t("visits")} {system.data.visits} · {t("clients")} {system.data.clients} · {t("masters")} {system.data.masters}
      </div>
    </Card>
  );
}
