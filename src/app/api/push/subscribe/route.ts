import { z } from "zod";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";

// Разрешённые хосты push-сервисов: Chrome/FCM, Firefox, Edge, Safari
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^[^.]+\.push\.services\.mozilla\.com$/,
  /^[^.]+\.notify\.windows\.com$/,
  /^[^.]+\.push\.apple\.com$/,
];

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_SUBS_PER_USER = 10;

function isAllowedPushHost(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && ALLOWED_PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(MAX_ENDPOINT_LENGTH).refine(isAllowedPushHost, "not_allowed_host"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(128),
  }),
});

const deleteSchema = z.object({
  endpoint: z.string().url().max(MAX_ENDPOINT_LENGTH),
});

/** POST /api/push/subscribe — сохранить push-подписку; endpoint переходит к вошедшему пользователю */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const { endpoint, keys } = parsed.data;

  // Защита от бесконечного накопления подписок
  const subCount = await db.pushSubscription.count({ where: { userId: user.id } });
  if (subCount >= MAX_SUBS_PER_USER) return Response.json({ error: "too_many" }, { status: 429 });

  // Upsert по endpoint: подписка переходит к вошедшему пользователю
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
  });

  return Response.json({ ok: true });
}

/** DELETE /api/push/subscribe — удалить push-подписку при отзыве разрешения */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: parsed.data.endpoint } });

  return Response.json({ ok: true });
}
