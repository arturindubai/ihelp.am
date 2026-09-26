import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { localeIso, tr } from "@/i18n/locales";
import { getSettings } from "@/server/settings";
import { ServiceWorker } from "@/components/ServiceWorker";
import "../globals.css";

// Google Sans загружается через CSS @import из Google Fonts (globals.css).
// Для самохостинга (next/font/local) скачать файлы в public/fonts/ и раскомментировать:
//
// import localFont from "next/font/local";
// const googleSans = localFont({
//   src: [
//     { path: "../../../public/fonts/GoogleSans-Regular.woff2", weight: "400", style: "normal" },
//     { path: "../../../public/fonts/GoogleSans-Medium.woff2", weight: "500", style: "normal" },
//     { path: "../../../public/fonts/GoogleSans-SemiBold.woff2", weight: "600", style: "normal" },
//     { path: "../../../public/fonts/GoogleSans-Bold.woff2", weight: "700", style: "normal" },
//   ],
//   variable: "--font-google-sans",
//   display: "swap",
// });
// — и добавить googleSans.variable в className на <html>
//
// Скачать:
//   for w in 400 500 600 700; do
//     curl -sL "https://fonts.googleapis.com/css2?family=Google+Sans:wght@$w&display=swap" \
//       -H "User-Agent: Mozilla/5.0" | grep -oP "(?<=src: url\()[^)]+" | \
//       xargs -I{} curl -sL {} -o "public/fonts/GoogleSans-${w}.woff2"
//   done

export const dynamic = "force-dynamic";

const OG_LOCALE = { ru: "ru_RU", en: "en_US", am: "hy_AM" };

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#5B3DF5" };

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
    icons: { icon: "/img/icon.svg", apple: "/icon-180.png" },
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
    <html lang={localeIso[locale]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Google Sans: для самохостинга заменить на next/font/local — инструкция в этом файле */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
