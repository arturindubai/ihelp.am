import { NextRequest, NextResponse } from "next/server";
import { incrementBannerClick } from "@/server/services/banners";
import { db } from "@/server/db";

/** POST /api/banner — трекинг клика по баннеру; тело: { id: string } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    const exists = await db.banner.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ ok: false }, { status: 404 });
    await incrementBannerClick(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
