import type { MetadataRoute } from "next";
import { getSettings } from "@/server/settings";
import { getSitemapEntries } from "@/server/services/pages/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  const [s, [services, masters]] = await Promise.all([getSettings(), getSitemapEntries()]);
  const paths = ["", "/services", ...services.map((x) => `/s/${x.slug}`), ...masters.map((x) => `/masters/${x.slug}`)];
  return s.locales.enabled.flatMap((l) => paths.map((p) => ({ url: `${base}/${l}${p}`, changeFrequency: "weekly" as const })));
}
