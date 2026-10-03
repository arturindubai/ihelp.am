import "server-only";
import { db } from "../db";
import { escapeHtml } from "@/lib/html";
import { enqueueAndSend } from "./notifyQueue";
import { getSettings } from "../settings";
import { tr } from "@/i18n/locales";
import { hm, ymd, addDays, TZ_OFFSET } from "@/lib/time";
import { pushNotify } from "./pushNotify";
import ru from "../../../messages/ru.json";

type AddressSnapshot = { street?: string; building?: string; apartment?: string };
type Config = { service?: { title?: unknown }; plan?: { title?: unknown } | null };

function addrLine(snapshot: unknown): string {
  const a = snapshot as AddressSnapshot | null;
  if (!a?.street) return "—";
  return `${a.street} ${a.building ?? ""}${a.apartment ? ", кв. " + a.apartment : ""}`.trim();
}

function serviceTitle(config: unknown): string {
  const c = config as Config | null;
  const svc = tr(c?.service?.title, "ru");
  const plan = tr(c?.plan?.title ?? null, "ru");
  return [svc, plan].filter(Boolean).join(" · ");
}

/** Разрешить токен staff_bot из настроек */
async function staffToken(): Promise<string> {
  return (await getSettings()).team.botToken;
}

/** Отправить личное сообщение мастеру через @ihelp_staff_bot с надёжной очередью.
 *  Мастер без staffChatId — пропускаем молча. */
async function sendToMaster(staffChatId: string | null | undefined, text: string, tag: string): Promise<void> {
  if (!staffChatId) return;
  const token = await staffToken();
  if (!token) return;
  await enqueueAndSend(staffChatId, text, tag, token, "team.botToken");
}

const tmpl = ru.notify.master;

/** Заполнить шаблон, экранируя пользовательские данные для HTML Telegram */
function fill(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), escapeHtml(v)), template);
}

/** Уведомить мастера о новом назначенном визите */
export async function notifyMasterAssigned(visitId: string): Promise<void> {
  const v = await db.visit.findUnique({
    where: { id: visitId },
    select: {
      scheduledAt: true,
      master: { select: { staffChatId: true, notifyEnabled: true, userId: true } },
      order: { select: { config: true, addressSnapshot: true, user: { select: { name: true, phone: true } } } },
    },
  });
  if (!v?.master?.notifyEnabled || !v.scheduledAt) return;
  const svc = serviceTitle(v.order.config);
  const text = fill(tmpl.assigned, {
    clientName: v.order.user.name || v.order.user.phone || "—",
    serviceName: svc,
    date: ymd(v.scheduledAt),
    time: hm(v.scheduledAt),
    address: addrLine(v.order.addressSnapshot),
  });
  await sendToMaster(v.master.staffChatId, text, "master:assigned");
  if (v.master.userId) await pushNotify(v.master.userId, { title: "Новый визит", body: `${svc}, ${ymd(v.scheduledAt)} ${hm(v.scheduledAt)}`, url: "/pro" }).catch(() => {});
}

/** Уведомить мастера о переносе визита */
export async function notifyMasterRescheduled(visitId: string): Promise<void> {
  const v = await db.visit.findUnique({
    where: { id: visitId },
    select: {
      scheduledAt: true,
      master: { select: { staffChatId: true, notifyEnabled: true, userId: true } },
      order: { select: { config: true } },
    },
  });
  if (!v?.master?.notifyEnabled || !v.scheduledAt) return;
  const svc = serviceTitle(v.order.config);
  const text = fill(tmpl.rescheduled, {
    serviceName: svc,
    date: ymd(v.scheduledAt),
    time: hm(v.scheduledAt),
  });
  await sendToMaster(v.master.staffChatId, text, "master:rescheduled");
  if (v.master.userId) await pushNotify(v.master.userId, { title: "Визит перенесён", body: `${svc}, ${ymd(v.scheduledAt)} ${hm(v.scheduledAt)}`, url: "/pro" }).catch(() => {});
}

/** Уведомить мастера об отмене визита.
 *  Вызывается ДО изменения статуса — visitId должен ещё существовать с мастером. */
export async function notifyMasterCancelled(visitId: string): Promise<void> {
  const v = await db.visit.findUnique({
    where: { id: visitId },
    select: {
      scheduledAt: true,
      master: { select: { staffChatId: true, notifyEnabled: true, userId: true } },
      order: { select: { config: true } },
    },
  });
  if (!v?.master?.notifyEnabled || !v.scheduledAt) return;
  const svc = serviceTitle(v.order.config);
  const text = fill(tmpl.cancelled, {
    serviceName: svc,
    date: ymd(v.scheduledAt),
  });
  await sendToMaster(v.master.staffChatId, text, "master:cancelled");
  if (v.master.userId) await pushNotify(v.master.userId, { title: "Визит отменён", body: `${svc}, ${ymd(v.scheduledAt)}`, url: "/pro" }).catch(() => {});
}

/** Вечернее расписание: отправить каждому мастеру список его визитов на завтра.
 *  Если визитов нет — сообщение не уходит (критерий 2). */
export async function sendMasterTomorrowSchedule(now: Date): Promise<number> {
  // «Завтра» в часовом поясе Asia/Yerevan (+04:00)
  const tomorrow = addDays(ymd(now), 1);
  const from = new Date(`${tomorrow}T00:00:00${TZ_OFFSET}`);
  const to = new Date(`${tomorrow}T23:59:59${TZ_OFFSET}`);

  const visits = await db.visit.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      masterId: { not: null },
      master: { notifyEnabled: true },
    },
    select: {
      scheduledAt: true,
      masterId: true,
      master: { select: { staffChatId: true } },
      order: { select: { config: true, addressSnapshot: true, user: { select: { name: true, phone: true } } } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Сгруппировать по мастеру
  const byMaster = new Map<string, typeof visits>();
  for (const v of visits) {
    if (!v.masterId || !v.master?.staffChatId) continue;
    const list = byMaster.get(v.masterId) ?? [];
    list.push(v);
    byMaster.set(v.masterId, list);
  }

  let sent = 0;
  for (const [, masterVisits] of byMaster) {
    const staffChatId = masterVisits[0].master?.staffChatId;
    if (!staffChatId) continue;
    const lines = masterVisits.map((v) =>
      fill(tmpl.tomorrowItem, {
        time: v.scheduledAt ? hm(v.scheduledAt) : "—",
        serviceName: serviceTitle(v.order.config),
        clientName: v.order.user.name || v.order.user.phone || "—",
        address: addrLine(v.order.addressSnapshot),
      }),
    );
    const text = fill(tmpl.tomorrow, { date: tomorrow, list: lines.join("\n") });
    await sendToMaster(staffChatId, text, "master:tomorrow");
    sent++;
  }
  return sent;
}
