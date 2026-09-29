"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireSection } from "../admin";
import { audit } from "../audit";

export async function savePriceAction(optionId: string, price: number) {
  const u = await requireSection("services");
  const p = z.object({ optionId: z.string(), price: z.number().int().min(0).max(10_000_000) }).safeParse({ optionId, price });
  if (!p.success) return { ok: false as const };
  await db.option.update({ where: { id: p.data.optionId }, data: { price: p.data.price } });
  await audit(u.id, "option.priceUpdate", "Option", p.data.optionId, { price: p.data.price });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function bulkPriceAction(optionIds: string[], type: "percent" | "flat", value: number) {
  const u = await requireSection("services");
  const p = z.object({
    optionIds: z.array(z.string()).min(1).max(1000),
    type: z.enum(["percent", "flat"]),
    value: z.number().min(-10_000_000).max(10_000_000),
  }).safeParse({ optionIds, type, value });
  if (!p.success) return { ok: false as const };

  const options = await db.option.findMany({ where: { id: { in: p.data.optionIds } }, select: { id: true, price: true } });
  const updates = options.map((opt) => {
    const newPrice =
      p.data.type === "percent"
        ? Math.max(0, Math.round(opt.price * (1 + p.data.value / 100)))
        : Math.max(0, opt.price + Math.round(p.data.value));
    return db.option.update({ where: { id: opt.id }, data: { price: newPrice } });
  });
  await db.$transaction(updates);
  await audit(u.id, "option.bulkPriceUpdate", "Option", null, { count: options.length, type: p.data.type, value: p.data.value });
  revalidatePath("/", "layout");
  return { ok: true as const, updatedPrices: Object.fromEntries(options.map((opt) => {
    const newPrice =
      p.data.type === "percent"
        ? Math.max(0, Math.round(opt.price * (1 + p.data.value / 100)))
        : Math.max(0, opt.price + Math.round(p.data.value));
    return [opt.id, newPrice];
  })) };
}
