import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/admin/fields";
import { silentLabel } from "@/components/admin/cc/TaskBadges";
import { QuickMove } from "@/components/admin/cc/TaskControls";
import type { StaleTask } from "@/server/services/ccBoard";

/** Задачи «В работе» без пульса > 30 мин: список с кнопкой немедленного возврата в очередь */
export async function HealthPanel({ tasks, locale }: { tasks: StaleTask[]; locale: string }) {
  const [t, th] = await Promise.all([getTranslations("admin.cc"), getTranslations("admin.cc.healthPage")]);
  return (
    <Card title={`${th("staleTasks")}${tasks.length ? ` · ${tasks.length}` : ""}`}>
      <p className="mb-2 text-xs text-muted">{th("staleHint")}</p>
      {tasks.length === 0 ? (
        <p className="text-sm text-ok">{th("noStaleTasks")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((x) => (
            <li key={x.key} className="flex flex-wrap items-center gap-3 py-2">
              <Link href={`/${locale}/admin/control?task=${x.key}`} className="min-w-0 flex-1">
                <span className="font-mono text-xs text-muted">{x.key}</span>{" "}
                <span className="font-medium">{x.title}</span>
                <span className="block text-xs text-muted">
                  👤 {x.claimedBy ?? "—"}{x.silentMin != null ? ` · ${silentLabel(t, x.silentMin)}` : ""}
                </span>
              </Link>
              <QuickMove
                taskKey={x.key}
                to="ready"
                text={t("attention.returnReason")}
                label={t("attention.returnToQueue")}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
