import type { MetadataRoute } from "next";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";

/**
 * Манифест веб-приложения: название и слоган берутся из настроек,
 * поэтому смена бренда в админке меняет и то, как приложение подписано на телефоне.
 * Отдаётся по адресу /manifest.webmanifest.
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  return {
    name: s.brand.name,
    short_name: s.brand.name,
    description: tr(s.brand.tagline, "ru"),
    start_url: "/ru",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#c2521b",
    lang: "ru",
    icons: [
      { src: "/img/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
