import { getTranslations } from "next-intl/server";
import { Card } from "@/components/admin/fields";
import { cn } from "@/lib/format";
import type { DenialStats } from "@/lib/worker-denials";

/** Порог из DEV-79: запусков с отказами должно быть меньше пятой части */
const TARGET_PCT = 20;

/** Отказы прав воркеров за сутки: доля запусков с отказами и пять самых частых отклонённых команд */
export async function DenialsPanel({ stats }: { stats: DenialStats }) {
  const th = await getTranslations("admin.cc.healthPage.denials");
  const pct = stats.sharePct;
  const tone = pct == null ? "text-muted" : pct < TARGET_PCT ? "text-ok" : pct < 50 ? "text-warn" : "text-bad";
  return (
    <Card title={th("title")}>
      {pct == null ? (
        <p className="text-sm text-muted">{th("noData")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn("text-2xl font-bold", tone)}>{th("share", { pct })}</span>
            <span className="text-sm text-muted">{th("shareHint", { denied: stats.withDenials, total: stats.withData, target: TARGET_PCT })}</span>
          </div>
          {stats.top.length === 0 ? (
            <p className="mt-2 text-sm text-ok">{th("none")}</p>
          ) : (
            <>
              <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">{th("top")}</div>
              <ol className="mt-1 divide-y divide-line">
                {stats.top.map((x) => (
                  <li key={x.form} className="flex items-start gap-3 py-1.5 text-sm">
                    <span className="chip shrink-0 bg-warn-50 text-[10px] text-warn">{th("times", { n: x.count })}</span>
                    <code className="min-w-0 break-all font-mono text-xs">{x.form}</code>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
      {stats.runs > stats.withData && <p className="mt-2 text-xs text-muted">{th("skipped", { n: stats.runs - stats.withData })}</p>}
      <p className="mt-2 text-xs text-muted">{th("hint")}</p>
    </Card>
  );
}
