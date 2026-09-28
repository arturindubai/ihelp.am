import { NextResponse } from "next/server";

/** Вход по секретной ссылке отключён (AUTH-7): каналы OTP работают, запасной ход не нужен. */
export async function GET() {
  return NextResponse.json({ error: "disabled" }, { status: 410 });
}
