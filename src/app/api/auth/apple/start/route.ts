import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/server/settings";
import { appleAuthUrl, signState } from "@/server/services/oauth";

/** Начало входа через Apple: ставим одноразовое состояние в cookie и уходим на Apple */
export async function GET(req: Request) {
  const s = await getSettings();
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!s.apple.enabled || !s.apple.clientId || !s.apple.teamId || !s.apple.keyId || !s.apple.privateKey) {
    return NextResponse.redirect(new URL("/ru/login?error=apple_off", base));
  }
  const next = new URL(req.url).searchParams.get("next") || "";
  const state = signState(`${crypto.randomBytes(12).toString("hex")}|${next}`, process.env.SESSION_SECRET || "dev");
  // SameSite=Lax не долетел бы: Apple возвращается POST-запросом с чужого домена (response_mode=form_post),
  // а Lax-cookie на кросс-сайтовый POST браузер не отправляет. None обязателен вместе с Secure
  (await cookies()).set("a_state", state, { httpOnly: true, sameSite: "none", secure: true, path: "/", maxAge: 600 });
  return NextResponse.redirect(appleAuthUrl(s, state));
}
