/**
 * Zod-схемы для патча настроек воркеров, используемые сервером (cc.ts) и тестами.
 * Единый источник истины: схема строится из POOLS, а не перечисляет пулы вручную.
 */
import { z } from "zod";
import { DAILY_CAP_MAX, EVERY_MIN, MODELS, MODES, POOLS, type Pool } from "./workers";

export const poolPatchSchema = z
  .object({
    enabled: z.boolean(),
    max: z.number().int().min(0).max(4),
    model: z.enum(MODELS),
    modelForL: z.enum(MODELS),
    // null — без лимита
    dailyCap: z.number().int().min(0).max(DAILY_CAP_MAX).nullable(),
    mode: z.enum(MODES),
    everyMin: z.number().int().refine((n) => (EVERY_MIN as readonly number[]).includes(n)),
  })
  .partial();

const poolsShape = Object.fromEntries(POOLS.map((p) => [p, poolPatchSchema])) as {
  [K in Pool]: typeof poolPatchSchema;
};

export const workersPatchSchema = z.object({
  enabled: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  pools: z.object(poolsShape).strict().partial().optional(),
  deployWindow: z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)]).optional(),
  triageBatch: z.number().int().min(1).max(15).optional(),
  sweepEveryH: z.number().int().min(0).max(168).optional(),
  stopRunning: z.boolean().optional(),
  pausedUntil: z.null().optional(),
});
