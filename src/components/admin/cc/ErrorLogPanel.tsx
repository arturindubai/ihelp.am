"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { cn, timeLabel } from "@/lib/format";
import { Card } from "@/components/admin/fields";
import { ccCreateBugFromErrorAction } from "@/server/actions/admin/cc";
import type { AppErrorItem } from "@/server/services/cc";

/** Панель журнала ошибок в вкладке Здоровье */
export function ErrorLogPanel({ errors }: { errors: AppErrorItem[] }) {
  const t = useTranslations("admin.cc.errorLog");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState<string | null>(null);

  async function handleCreateBug(err: AppErrorItem) {
    setCreating(err.id);
    start(async () => {
      const r = await ccCreateBugFromErrorAction(err.id);
      setCreating(null);
      if (r.ok) {
        router.push(`/admin/control/${r.taskKey}`);
      } else if (r.error === "already_exists" && r.taskKey) {
        router.push(`/admin/control/${r.taskKey}`);
      }
    });
  }

  return (
    <Card title={t("title")}>
      {errors.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {errors.map((err) => (
            <li key={err.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{timeLabel(err.lastSeenAt)}</span>
                  <span className={cn("rounded px-1.5 py-0.5 font-mono text-xs", err.count > 10 ? "bg-bad/10 text-bad" : "bg-line text-ink")}>
                    {t("countTimes", { n: err.count })}
                  </span>
                  <span className="truncate font-mono text-xs text-muted">{err.source}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink">{err.message.slice(0, 120)}</p>
              </div>
              <div className="shrink-0">
                {err.taskKey ? (
                  <Link href={`/admin/control/${err.taskKey}`} className="btn-sm btn-outline text-xs">
                    {t("openBug")} {err.taskKey}
                  </Link>
                ) : (
                  <button
                    className="btn-sm btn-outline text-xs"
                    disabled={pending && creating === err.id}
                    onClick={() => handleCreateBug(err)}
                  >
                    {pending && creating === err.id ? "…" : t("createBug")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
