"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { requireSection } from "../admin";
import { audit } from "../audit";
import { applyBulkChange, validateBulkChange } from "@/lib/price-bulk";
import { tr } from "@/i18n/locales";

export async function savePriceAction(optionId: string, price: number) {
  const u = await requireSection("services");
  const p = z.object({ optionId: z.string(), price: z.number().int().min(0).max(10_000_000) }).safeParse({ optionId, price });
  if (!p.success) return { ok: false as const };
  const existing = await db.option.findUnique({
    where: { id: p.data.optionId },
    select: {
      price: true,
      title: true,
      group: { select: { service: { select: { id: true, title: true } } } },
    },
  });
  if (!existing) return { ok: false as const };
  if (existing.price === p.data.price) return { ok: true as const };
  await db.$transaction([
    db.option.update({ where: { id: p.data.optionId }, data: { price: p.data.price } }),
    db.priceAudit.create({
      data: {
        userId: u.id,
        userName: u.name ?? null,
        optionId: p.data.optionId,
        optionTitle: tr(existing.title, "ru"),
        serviceId: existing.group.service.id,
        serviceTitle: tr(existing.group.service.title, "ru"),
        oldPrice: existing.price,
        newPrice: p.data.price,
      },
    }),
  ]);
  await audit(u.id, "option.priceUpdate", "Option", p.data.optionId, { oldPrice: existing.price, price: p.data.price });
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

  const options = await db.option.findMany({
    where: { id: { in: p.data.optionIds } },
    select: {
      id: true,
      price: true,
      title: true,
      group: { select: { service: { select: { id: true, title: true } } } },
    },
  });

  // Защита от обнуления: ни одна ненулевая цена не должна стать ≤ 0
  if (!validateBulkChange(options.map((o) => o.price), p.data.type, p.data.value)) {
    return { ok: false as const, reason: "wouldZero" as const };
  }

  // Нулевые цены пропускаются
  const toUpdate = options
    .map((opt) => ({ opt, newPrice: applyBulkChange(opt.price, p.data.type, p.data.value) }))
    .filter((x): x is { opt: typeof options[number]; newPrice: number } => x.newPrice !== null);

  if (toUpdate.length === 0) return { ok: true as const, updatedPrices: {} };

  await db.$transaction([
    ...toUpdate.map(({ opt, newPrice }) =>
      db.option.update({ where: { id: opt.id }, data: { price: newPrice } })
    ),
    ...toUpdate.map(({ opt, newPrice }) =>
      db.priceAudit.create({
        data: {
          userId: u.id,
          userName: u.name ?? null,
          optionId: opt.id,
          optionTitle: tr(opt.title, "ru"),
          serviceId: opt.group.service.id,
          serviceTitle: tr(opt.group.service.title, "ru"),
          oldPrice: opt.price,
          newPrice,
        },
      })
    ),
  ]);

  const changes = toUpdate.map(({ opt, newPrice }) => ({ id: opt.id, oldPrice: opt.price, newPrice }));
  await audit(u.id, "option.bulkPriceUpdate", "Option", null, {
    count: changes.length,
    type: p.data.type,
    value: p.data.value,
    changes,
  });

  revalidatePath("/", "layout");
  return {
    ok: true as const,
    updatedPrices: Object.fromEntries(toUpdate.map(({ opt, newPrice }) => [opt.id, newPrice])),
  };
}
