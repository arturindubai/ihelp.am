import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { hasAlertRecipient } from "@/server/notify";

export async function GET(req: Request) {
  await db.$queryRaw`SELECT 1`;
  const check = new URL(req.url).searchParams.get("check");
  if (check === "alert") {
    try {
      const s = await getSettings();
      return Response.json({ ok: hasAlertRecipient(s) });
    } catch {
      return Response.json({ ok: false });
    }
  }
  return Response.json({ ok: true });
}
