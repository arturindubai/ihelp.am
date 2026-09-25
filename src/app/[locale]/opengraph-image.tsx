import fs from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { getSettings } from "@/server/settings";
import { tr } from "@/i18n/locales";

/**
 * Картинка для превью ссылок (WhatsApp, Telegram, соцсети): логотип, название и слоган из настроек.
 * Цвета продублированы из src/app/theme.css (генератор картинок не читает CSS) — при смене палитры поправить здесь.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#111114";
const MUTED = "#5E5E69";
const SURFACE = "#F5F5F7";
const BRAND = "#5B3DF5";

const read = (file: string) => fs.readFile(path.join(process.cwd(), "public", file));

export default async function Image({ params }: { params: Promise<{ locale: string }> | { locale: string } }) {
  const { locale } = await Promise.resolve(params);
  const [s, regular, bold, armenian, logo] = await Promise.all([
    getSettings(),
    read("fonts/NotoSans-Regular.woff"),
    read("fonts/NotoSans-Bold.woff"),
    read("fonts/NotoSansArmenian-Bold.woff"),
    read("img/icon.svg"),
  ]);
  const tagline = tr(s.brand.tagline, locale);
  const city = tr(s.brand.city, locale);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 96px", background: SURFACE, fontFamily: "Noto Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={148} height={148} style={{ borderRadius: 32 }} />
          <div style={{ fontSize: 104, fontWeight: 700, color: INK, letterSpacing: -2 }}>{s.brand.name}</div>
        </div>
        {tagline && <div style={{ marginTop: 44, fontSize: 52, lineHeight: 1.25, color: INK, maxWidth: 1000 }}>{tagline}</div>}
        {city && <div style={{ marginTop: 36, display: "flex", fontSize: 34, color: MUTED }}><span style={{ width: 14, height: 14, borderRadius: 7, background: BRAND, marginRight: 16, marginTop: 17 }} />{city}</div>}
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto Sans", data: regular, weight: 400, style: "normal" },
        { name: "Noto Sans", data: bold, weight: 700, style: "normal" },
        { name: "Noto Sans", data: armenian, weight: 700, style: "normal" },
      ],
    },
  );
}
