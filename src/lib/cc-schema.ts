import { z } from "zod";
import { AREAS, LAYERS, OWNERS, PRIORITIES, STAGES } from "./backlog-labels";

/** Проверка содержимого задачи — одна для формы в админке и для API рабочих сессий */
const lines = z.array(z.string().max(500)).max(20);

export const taskContentSchema = z.object({
  key: z.string().min(3).max(30),
  title: z.string().min(5).max(200),
  summary: z.string().min(10).max(2000),
  details: z.string().max(5000).nullable().optional(),
  requirements: lines,
  design: z.string().max(5000).nullable().optional(),
  qaNotes: z.string().max(5000).nullable().optional(),
  deployNotes: z.string().max(5000).nullable().optional(),
  needs: lines,
  depends: z.array(z.string().max(30)).max(20),
  docs: lines,
  epicKey: z.string().max(60).nullable().optional(),
  area: z.enum(Object.keys(AREAS) as [string, ...string[]]),
  layer: z.enum(Object.keys(LAYERS) as [string, ...string[]]),
  priority: z.enum(Object.keys(PRIORITIES) as [string, ...string[]]),
  stage: z.enum(Object.keys(STAGES) as [string, ...string[]]),
  owner: z.enum(Object.keys(OWNERS) as [string, ...string[]]),
  estimate: z.enum(["S", "M", "L"]).nullable().optional(),
  scope: z.array(z.string().max(200)).max(30).optional(),
});

export type TaskContentInput = z.infer<typeof taskContentSchema>;

/** Поля, которые дизайнер может менять через API: остальное — продукт и техдиректор */
export const DESIGNER_FIELDS = ["design", "docs"] as const;
