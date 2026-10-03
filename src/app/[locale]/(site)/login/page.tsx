import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { loginMethods } from "@/server/otp";
import { getSettings } from "@/server/settings";
import { unpackSignupTicket } from "@/lib/signupTicket";
import { unpackGoogleSignupTicket } from "@/lib/googleSignupTicket";
import { safeReturnPath } from "@/lib/safeRedirect";
import { LoginClient } from "./LoginClient";
import { buildAlternates } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const [s, tseo, tauth] = await Promise.all([getSettings(), getTranslations("seo"), getTranslations("auth")]);
  return {
    title: tauth("title"),
    description: tseo("loginDesc"),
    alternates: buildAlternates("/login", locale, s.locales.indexable),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string; complete?: string; "google-complete"?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const { next, error, complete } = sp;
  const googleComplete = sp["google-complete"];
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const safeNext = safeReturnPath(next);
  if (user) redirect({ href: safeNext || "/account", locale });
  // Пришли из Telegram-бота с подтверждённым номером нового клиента: остаётся имя и email (AUTH-11)
  const ticket = complete ? unpackSignupTicket(complete, process.env.SESSION_SECRET || "dev") : null;
  const signup = complete && ticket ? { ticket: complete, phone: ticket.phone } : undefined;
  // Пришли из Google callback: email подтверждён, нужен телефон для завершения регистрации (IN-29)
  if (googleComplete) {
    const gTicket = unpackGoogleSignupTicket(googleComplete, process.env.SESSION_SECRET || "dev");
    if (!gTicket) redirect({ href: "/login?error=google_failed", locale });
    const [{ channels, email: emailEnabled }, s, t] = await Promise.all([loginMethods(), getSettings(), getTranslations("auth")]);
    const googleSignup = { ticket: googleComplete, email: gTicket!.email, name: gTicket!.name };
    return (
      <div className="container-m pt-6">
        <h1 className="h1 mb-5">{t("title")}</h1>
        <LoginClient channels={channels} emailEnabled={emailEnabled} telegramBot={s.notify.telegramBotUsername || null} googleSignup={googleSignup} next={safeNext} />
      </div>
    );
  }
  const [{ channels, email: emailEnabled }, s, t] = await Promise.all([loginMethods(), getSettings(), getTranslations("auth")]);
  const google = s.google.enabled && !!s.google.clientId;
  const apple = s.apple.enabled && !!s.apple.clientId;
  const telegramWidget = s.telegramWidget.enabled && !!s.notify.telegramBotToken && !!s.notify.telegramBotUsername;
  const googleUrl = google && !signup ? `/api/auth/google/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}` : undefined;
  const appleUrl = apple && !signup ? `/api/auth/apple/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}` : undefined;
  const telegramWidgetUrl = telegramWidget && !signup ? `/api/auth/telegram/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}` : undefined;
  const errorKey =
    error &&
    ["google_off", "google_state", "google_failed", "google_not_linked", "apple_off", "apple_state", "apple_failed", "apple_not_linked", "telegram_state", "telegram_failed", "telegram_not_linked", "telegram_conflict", "blocked"].includes(
      error,
    )
      ? error
      : null;
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-5">{t("title")}</h1>
      {errorKey && <p className="mb-4 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{t(`errors.${errorKey}` as "errors.blocked")}</p>}
      <LoginClient
        channels={channels}
        emailEnabled={emailEnabled}
        telegramBot={s.notify.telegramBotUsername || null}
        googleUrl={googleUrl}
        appleUrl={appleUrl}
        telegramWidgetUrl={telegramWidgetUrl}
        signup={signup}
        next={safeNext}
      />
    </div>
  );
}

