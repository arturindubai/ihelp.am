import "server-only";
import webpush from "web-push";
import { db } from "@/server/db";
import { getOrCreateVapidKeys } from "./vapidKeys";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/** Отправить push-уведомление всем активным подпискам пользователя */
export async function pushNotify(userId: string, payload: PushPayload) {
  let keys;
  try { keys = await getOrCreateVapidKeys(); } catch { return; }
  if (!keys.publicKey || !keys.privateKey) return;

  webpush.setVapidDetails("mailto:hello@ihelp.am", keys.publicKey, keys.privateKey);

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
          await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    }),
  );
}
