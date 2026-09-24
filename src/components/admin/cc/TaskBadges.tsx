import { getTranslations } from "next-intl/server";
import type { Task } from "@prisma/client";
import type { Health } from "@/lib/cc-flow";
import { cn } from "@/lib/format";

export type AnnotatedTask = Task & { health: Health; attention: boolean; dorOk: boolean };

type T = Awaited<ReturnType<typeof getTranslations<"admin.cc">>>;

/** «молчит 12 мин» / «молчит 5 ч» / «молчит 2 дн» */
export function silentLabel(t: T, m: number) {
  if (m < 60) return t("health.silent", { m });
  if (m < 48 * 60) return t("health.silentH", { h: Math.round(m / 60) });
  return t("health.silentD", { d: Math.round(m / 1440) });
}

/** Метки состояния задачи в списке и на доске: кто держит и когда был пульс, брошена ли, ждёт ли кого-то */
export async function TaskBadges({ task }: { task: AnnotatedTask }) {
  const t = await getTranslations("admin.cc");
  const h = task.health;
  const items = [
    task.status === "in_progress" && task.claimedBy && { tone: h.stale ? "bg-bad-50 text-bad" : "bg-brand-50 text-brand", text: `👤 ${task.claimedBy}${h.silentMin != null ? ` · ${h.stale ? silentLabel(t, h.silentMin) : `${h.silentMin}′`}` : ""}` },
    h.stale && { tone: "bg-bad-50 text-bad", text: `🪦 ${t("health.stale")}` },
    h.phantom && { tone: "bg-bad-50 text-bad", text: `👻 ${t("health.phantom")}` },
    h.stuckReview && { tone: "bg-warn-50 text-warn", text: `⏳ ${t("health.stuckReview")}` },
    h.needsOwner && { tone: "bg-warn-50 text-warn", text: `✋ ${t("health.needsOwner")}` },
    h.waitingDeps && { tone: "bg-surface text-muted", text: `🔒 ${t("health.waitingDeps")}` },
    task.rework > 0 && { tone: "bg-warn-50 text-warn", text: `↩ ${t("health.rework", { n: task.rework })}` },
    task.status === "backlog" && task.dorOk && { tone: "bg-ok-50 text-ok", text: `✓ ${t("health.dorOk")}` },
    task.branch && ["in_progress", "review"].includes(task.status) && { tone: "bg-surface text-muted font-mono", text: `⎇ ${task.branch}` },
  ].filter(Boolean) as { tone: string; text: string }[];
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i.text} className={cn("chip text-[10px]", i.tone)}>
          {i.text}
        </span>
      ))}
    </div>
  );
}
