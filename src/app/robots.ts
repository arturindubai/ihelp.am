import type { MetadataRoute } from "next";

/** Считается при запросе: иначе адрес сайта зашивается на этапе сборки */
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "http://localhost:3000";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/*/admin", "/*/pro", "/*/account", "/*/book", "/api"] }], sitemap: `${base}/sitemap.xml` };
}
