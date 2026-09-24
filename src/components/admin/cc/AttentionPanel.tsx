import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { attention } from "@/server/services/cc";
import { Card } from "@/components/admin/fields";
import { QuickMove } from "@/components/admin/cc/TaskControls";
import { silentLabel } from "@/components/admin/cc/TaskBadges";

type Attention = Awaited<ReturnType<typeof attention>>;

/**
 * «Нужно вам» — первое, что видит владелец: брошенные задачи (с кнопкой вернуть), очередь деплоера,
 * решения, которых ждут от владельца и продукта, и кто сейчас над чем работает
 */
export async function AttentionPanel({ data, taskHref, readyHref, attentionHref }: { data: Attention; taskHref: (key: string) => string; readyHref: string; attentionHref: string }) {
  const t = await getTranslations("admin.cc");
  const quiet = !data.stale.length && !data.review.length && !data.owner.length;
  const key = (k: string) => (
    <Link href={taskHref(k)} scroll={false} className="font-mono text-xs text-brand hover:underline">
      {k}
    </Link>
  );

  return (
    <Card
      title={t("attention.title")}
      className="mb-4"
      actions={
        <Link href={attentionHref} className="text-xs text-brand hover:underline">
          {t("attention.showAll")}
        </Link>
      }
    >
      {quiet && <p className="mb-2 text-sm text-ok">{t("attention.none")}</p>}
      <div className="grid gap-4 text-sm lg:grid-cols-2">
        {data.stale.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-bad">🪦 {t("attention.stale")} · {data.stale.length}</h3>
            <ul className="space-y-1.5">
              {data.stale.map((s) => (
                <li key={s.key} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    {key(s.key)} <span>{s.title}</span>
                    <span className="block text-xs text-muted">
                      {s.claimedBy ? `${s.claimedBy}${s.health.silentMin != null ? ` · ${silentLabel(t, s.health.silentMin)}` : ""}` : t("health.phantom")}
                    </span>
                  </span>
                  <QuickMove taskKey={s.key} to={s.health.phantom ? "backlog" : "ready"} text={s.health.phantom ? t("attention.phantomReason") : t("attention.returnReason")} label={t("attention.returnToQueue")} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.review.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-warn">⏳ {t("attention.review")} · {data.review.length}</h3>
            <ul className="space-y-1">
              {data.review.map((r) => (
                <li key={r.key}>
                  {key(r.key)} {r.title}
                  {r.health.stuckReview && <span className="ml-1 text-xs text-bad">· {t("health.stuckReview")}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.owner.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-warn">✋ {t("attention.owner")} · {data.owner.length}</h3>
            <ul className="space-y-1">
              {data.owner.map((o) => (
                <li key={o.key}>
                  {key(o.key)} {o.title}
                  {o.blockedReason && <span className="block text-xs text-muted">{o.blockedReason}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.working.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-medium text-brand">⚙ {t("attention.working")} · {data.working.length}</h3>
            <ul className="space-y-1">
              {data.working.map((w) => (
                <li key={w.key}>
                  {key(w.key)} {w.title}
                  <span className="block text-xs text-muted">
                    {w.claimedBy ?? w.assignee}
                    {w.health.silentMin != null ? ` · ${w.health.silentMin}′` : ""}
                    {w.branch ? ` · ${w.branch}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <Link href={readyHref} className="mt-3 inline-block text-xs text-ok hover:underline">
        ✓ {t("attention.ready", { n: data.readyCount })}
      </Link>
    </Card>
  );
}
