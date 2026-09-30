import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";

// Ближайшие визиты клиента для SW-кэша: используется компонентом VisitCacheSync
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date(Date.now() - 3 * 3600_000);
  const visits = await db.visit.findMany({
    where: {
      order: { userId: user.id },
      status: { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] },
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    include: { order: { include: { service: true } }, master: true },
  });

  return NextResponse.json({
    cachedAt: new Date().toISOString(),
    visits: visits.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt?.toISOString() ?? null,
      durationMin: v.durationMin,
      status: v.status,
      price: v.price,
      serviceTitle: v.order.service.title,
      masterName: v.master?.name ?? null,
      masterPhoto: v.master?.photo ?? null,
    })),
  });
}
