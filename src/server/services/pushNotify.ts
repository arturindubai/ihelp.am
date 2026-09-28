import "server-only";
import webpush from "web-push";
import { db } from "@/server/db";

export function vapidEnabled() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/** Отправить push-уведомление всем активным подпискам пользователя */
export async function pushNotify(userId: string, payload: PushPayload) {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;

  webpush.setVapidDetails(process.env.VAPID_EMAIL ?? "mailto:hello@ihelp.am", pub, priv);

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const text = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, text);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // Истёкшая или отозванная подписка — удалить
        if (status === 410 || status === 404) {
          await db.pushSubscription.deleteMany({ where: { userId, endpoint: sub.endpoint } });
        }
      }
    }),
  );
}
