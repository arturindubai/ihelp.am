import { NextResponse } from "next/server";
import { buildId } from "@/server/version";

/**
 * Версия сборки — чтобы открытая вкладка пульта узнала о выкладке. После обновления сайта старые скрипты
 * страницы не могут вызвать серверные действия, и Next.js роняет страницу; баннер просит обновить её заранее
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ build: buildId() }, { headers: { "Cache-Control": "no-store" } });
}
