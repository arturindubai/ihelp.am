import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const [s, services, masters] = await Promise.all([getSettings(), db.service.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }), db.master.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } })]);
  const paths = ["", "/services", ...services.map((x) => `/s/${x.slug}`), ...masters.map((x) => `/masters/${x.slug}`)];
  return s.locales.enabled.flatMap((l) => paths.map((p) => ({ url: `${base}/${l}${p}`, changeFrequency: "weekly" as const })));
}
