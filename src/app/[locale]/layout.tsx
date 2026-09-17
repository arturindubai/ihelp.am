import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Armenian } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { localeIso, tr } from "@/i18n/locales";
import { getSettings } from "@/server/settings";
import "../globals.css";

const noto = Noto_Sans({ subsets: ["latin", "cyrillic"], variable: "--font-noto", display: "swap" });
const notoArm = Noto_Sans_Armenian({ subsets: ["armenian"], variable: "--font-noto-arm", display: "swap" });

export const dynamic = "force-dynamic";

const OG_LOCALE = { ru: "ru_RU", en: "en_US", am: "hy_AM" };

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const s = await getSettings();
  const base = process.env.APP_URL || "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: `${s.brand.name} — ${tr(s.brand.tagline, locale)}`, template: `%s · ${s.brand.name}` },
    description: tr(s.brand.tagline, locale),
    manifest: "/manifest.webmanifest",
    alternates: {
      languages: Object.fromEntries(s.locales.enabled.map((l) => [localeIso[l as "ru"], `/${l}`])),
    },
    appleWebApp: { capable: true, title: s.brand.name, statusBarStyle: "default" },
    // Превью ссылок в WhatsApp, Telegram, соцсетях; картинка — ./opengraph-image.tsx
    openGraph: { type: "website", siteName: s.brand.name, title: `${s.brand.name} — ${tr(s.brand.tagline, locale)}`, description: tr(s.brand.tagline, locale), locale: OG_LOCALE[locale as "ru"] },
    twitter: { card: "summary_large_image" },
    // Выключенный язык открывается с русским текстом — не индексируем, чтобы не плодить дубли страниц
    ...(s.locales.enabled.includes(locale) ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={localeIso[locale]} className={`${noto.variable} ${notoArm.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
