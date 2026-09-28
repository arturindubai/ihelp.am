import { z } from "zod";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** POST /api/push/subscribe — сохранить push-подписку */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const { endpoint, keys } = parsed.data;

  await db.pushSubscription.upsert({
    where: { userId_endpoint: { userId: user.id, endpoint } },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  });

  return Response.json({ ok: true });
}

/** DELETE /api/push/subscribe — удалить push-подписку */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") return Response.json({ error: "invalid" }, { status: 400 });

  await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });

  return Response.json({ ok: true });
}
