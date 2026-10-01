import { NextRequest, NextResponse } from "next/server";
import { searchServices } from "@/server/services/search";

/** GET /api/search?q=текст&locale=ru — поиск услуг по названию, описанию и категории */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locale = req.nextUrl.searchParams.get("locale") ?? "ru";
  const results = await searchServices(q, locale);
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
