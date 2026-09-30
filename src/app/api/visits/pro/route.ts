import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { addDays, atYerevan, ymd } from "@/lib/time";
import { formatPhone } from "@/lib/phone";

// Визиты мастера (сегодня + ближайшие 14 дней) для SW-кэша: используется компонентом VisitCacheSync
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const master = await db.master.findUnique({ where: { userId: user.id } });
  if (!master) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const today = ymd(new Date());
  const visits = await db.visit.findMany({
    where: {
      masterId: master.id,
      scheduledAt: {
        gte: atYerevan(today, "00:00"),
        lt: atYerevan(addDays(today, 14), "00:00"),
      },
      status: { in: ["SCHEDULED", "CONFIRMED", "ON_WAY", "IN_PROGRESS"] },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
    include: { order: { include: { service: true, user: true } } },
  });

  return NextResponse.json({
    cachedAt: new Date().toISOString(),
    visits: visits.map((v) => {
      const a = v.order.addressSnapshot as Record<string, string | null>;
      const addr = [a.district, `${a.street} ${a.building}`].filter(Boolean).join(", ");
      return {
        id: v.id,
        scheduledAt: v.scheduledAt?.toISOString() ?? null,
        durationMin: v.durationMin,
        status: v.status,
        price: v.price,
        serviceTitle: v.order.service.title,
        masterName: null,
        masterPhoto: null,
        clientName: v.order.user.name ?? null,
        clientPhone: formatPhone(v.order.user.phone),
        address: addr || null,
      };
    }),
  });
}
