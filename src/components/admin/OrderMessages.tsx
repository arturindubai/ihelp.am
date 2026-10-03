import { getTranslations } from "next-intl/server";
import { getOrderMessages } from "@/server/services/reviews";
import { dateLabel } from "@/lib/format";
import { hm } from "@/lib/time";

const EVENT_LABELS: Record<string, string> = {
  cancelled: "orders.msgEvents.cancelled",
  completed: "orders.msgEvents.completed",
  created: "orders.msgEvents.created",
  noChannel: "orders.msgEvents.noChannel",
  packageExpired: "orders.msgEvents.packageExpired",
  packageExpiring: "orders.msgEvents.packageExpiring",
  subPaused: "orders.msgEvents.subPaused",
  subResumed: "orders.msgEvents.subResumed",
};

export async function OrderMessages({ orderId, locale }: { orderId: string; locale: string }) {
  const [messages, t] = await Promise.all([getOrderMessages(orderId), getTranslations("admin")]);

  function eventLabel(event: string): string {
    const base = event.split(":")[0];
    const key = EVENT_LABELS[base];
    if (key) return t(key as Parameters<typeof t>[0]);
    if (base === "masterAssigned") return t("orders.assignMaster");
    if (base === "rescheduled") return t("orders.reschedule");
    return event;
  }

  return (
    <section className="card p-4 text-sm">
      <h2 className="h3 mb-2">{t("orders.messages")}</h2>
      {messages.length === 0 ? (
        <p className="text-muted">{t("orders.noMessages")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="font-medium">{eventLabel(m.event)}</div>
                <div className="text-xs text-muted">
                  {t(`orders.msgChannels.${m.channel as "telegram" | "email" | "alert" | "none"}`)} · {dateLabel(m.sentAt, locale, { day: "numeric", month: "short" })} {hm(m.sentAt)}
                </div>
              </div>
              <span
                className={
                  m.delivered
                    ? "mt-0.5 inline-block rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok"
                    : "mt-0.5 inline-block rounded-full bg-bad-50 px-2 py-0.5 text-[11px] font-semibold text-bad"
                }
              >
                {m.delivered ? t("orders.msgDelivered") : t("orders.msgNotDelivered")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
