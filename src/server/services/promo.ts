import "server-only";
import { db } from "../db";
import type { PlanKind } from "@prisma/client";
import type { PricePromo } from "@/lib/pricing";

export type PromoCheck = { ok: true; promo: PricePromo & { id: string } } | { ok: false; error: string; amount?: number };

export async function checkPromo(opts: { code: string; userId?: string | null; phone?: string | null; serviceId: string; planKind: PlanKind; amount: number; isFirstOrder: boolean }): Promise<PromoCheck> {
  const code = opts.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "not_found" };
  const p = await db.promoCode.findUnique({ where: { code } });
  if (!p || !p.active) return { ok: false, error: "not_found" };
  const now = new Date();
  if ((p.validFrom && p.validFrom > now) || (p.validTo && p.validTo < now)) return { ok: false, error: "expired" };
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) return { ok: false, error: "limit" };
  if (p.serviceIds.length && !p.serviceIds.includes(opts.serviceId)) return { ok: false, error: "service" };
  if (p.planKinds.length && !p.planKinds.includes(opts.planKind)) return { ok: false, error: "service" };
  if (p.firstOrderOnly && !opts.isFirstOrder) return { ok: false, error: "first_only" };
  if (p.minOrder && opts.amount < p.minOrder) return { ok: false, error: "min_order", amount: p.minOrder };
  if (opts.userId || opts.phone) {
    const used = await db.promoRedemption.count({ where: { promoId: p.id, OR: [opts.userId ? { userId: opts.userId } : {}, opts.phone ? { phone: opts.phone } : {}].filter((x) => Object.keys(x).length) } });
    if (used >= p.perUserLimit) return { ok: false, error: "used" };
  }
  return { ok: true, promo: { id: p.id, code: p.code, type: p.type, value: p.value, maxDiscount: p.maxDiscount, stackable: p.stackable } };
}
