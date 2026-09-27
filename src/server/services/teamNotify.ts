import "server-only";
import { db } from "../db";
import { html, notifyTeam } from "../notify";
import { tr } from "@/i18n/locales";
import { ymd } from "@/lib/time";

type Snapshot = { street?: string; building?: string; apartment?: string };
type Config = { service?: { title?: unknown }; plan?: { title?: unknown } | null };

function addrLine(snapshot: unknown): string {
  const a = snapshot as Snapshot | null;
  if (!a?.street) return "—";
  return `${a.street} ${a.building ?? ""}${a.apartment ? ", кв. " + a.apartment : ""}`.trim();
}

function serviceTitle(config: unknown): string {
  const c = config as Config | null;
  const svc = tr(c?.service?.title, "ru");
  const plan = tr(c?.plan?.title ?? null, "ru");
  return [svc, plan].filter(Boolean).join(" · ");
}

async function loadOrder(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    select: {
      number: true,
      kind: true,
      config: true,
      addressSnapshot: true,
      user: { select: { name: true, phone: true } },
    },
  });
}

/** Отмена заказа или подписки клиентом */
export async function notifyCancelOrderTeam(orderId: string, lateCount: number, freeCancelHours: number): Promise<void> {
  const o = await loadOrder(orderId);
  if (!o) return;
  const svc = serviceTitle(o.config);
  await notifyTeam(
    html`❌ Клиент отменил ${o.kind === "SUBSCRIPTION" ? "подписку" : "заказ"} №${o.number}` +
      (svc ? html`\n${svc}` : "") +
      (o.user.name || o.user.phone ? html`\n👤 ${o.user.name ?? ""} ${o.user.phone ?? ""}` : "") +
      html`\n📍 ${addrLine(o.addressSnapshot)}` +
      (lateCount ? html`\n⚠️ Поздняя отмена: визитов в ближайшие ${freeCancelHours} ч — ${lateCount}` : ""),
  );
}

/** Отмена или пропуск одного визита клиентом */
export async function notifyCancelVisitTeam(orderId: string, scheduledAt: Date | null, skipped: boolean): Promise<void> {
  const o = await loadOrder(orderId);
  if (!o) return;
  const svc = serviceTitle(o.config);
  await notifyTeam(
    html`❌ Клиент ${skipped ? "пропустил" : "отменил"} визит · заказ №${o.number} · ${scheduledAt ? ymd(scheduledAt) : "—"}` +
      (svc ? html`\n${svc}` : "") +
      (o.user.name || o.user.phone ? html`\n👤 ${o.user.name ?? ""} ${o.user.phone ?? ""}` : "") +
      html`\n📍 ${addrLine(o.addressSnapshot)}`,
  );
}

/** Перенос визита клиентом на новую дату и время */
export async function notifyRescheduleVisitTeam(orderId: string, newDate: string, newTime: string): Promise<void> {
  const o = await loadOrder(orderId);
  if (!o) return;
  const svc = serviceTitle(o.config);
  await notifyTeam(
    html`🔁 Перенос визита · заказ №${o.number} → ${newDate} ${newTime}` +
      (svc ? html`\n${svc}` : "") +
      (o.user.name || o.user.phone ? html`\n👤 ${o.user.name ?? ""} ${o.user.phone ?? ""}` : "") +
      html`\n📍 ${addrLine(o.addressSnapshot)}`,
  );
}
