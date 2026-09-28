import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { verifyUnsubscribeToken } from "@/lib/emailToken";

/** GET /api/email/unsubscribe?token=<signed-token>
 *  Устанавливает emailUnsubscribedAt у пользователя; редиректит на страницу с подтверждением. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const locale = new URL(req.url).searchParams.get("locale") || "ru";
  const safeLocale = ["ru", "en", "am"].includes(locale) ? locale : "ru";

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.redirect(new URL(`/${safeLocale}`, req.url));
  }

  await db.user.updateMany({
    where: { id: userId, emailUnsubscribedAt: null },
    data: { emailUnsubscribedAt: new Date() },
  });

  return NextResponse.redirect(new URL(`/${safeLocale}/email/unsubscribed`, req.url));
}
