import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { loginMethods } from "@/server/otp";
import { getSettings } from "@/server/settings";
import { unpackSignupTicket } from "@/lib/signupTicket";
import { unpackGoogleSignupTicket } from "@/lib/googleSignupTicket";
import { safeReturnPath } from "@/lib/safeRedirect";
import { LoginClient } from "./LoginClient";

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
  const telegram = s.telegramWidget.enabled && !!s.notify.telegramBotToken && !!s.notify.telegramBotUsername;
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
      {(google || apple || telegram) && !signup && (
        <div className="mb-5 space-y-3">
          {google && (
            <div>
              <a className="btn-outline w-full" href={`/api/auth/google/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}>
                {t("google")}
              </a>
              <p className="mt-2 text-center text-xs text-muted">{t("googleHint")}</p>
            </div>
          )}
          {apple && (
            <div>
              <a className="btn-outline w-full" href={`/api/auth/apple/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}>
                {t("apple")}
              </a>
              <p className="mt-2 text-center text-xs text-muted">{t("appleHint")}</p>
            </div>
          )}
          {telegram && (
            <div>
              <a className="btn-outline inline-flex w-full items-center justify-center gap-2" href={`/api/auth/telegram/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}>
                <TelegramIcon />
                {t("telegram")}
              </a>
              <p className="mt-2 text-center text-xs text-muted">{t("telegramHint")}</p>
            </div>
          )}
        </div>
      )}
      <LoginClient channels={channels} emailEnabled={emailEnabled} telegramBot={s.notify.telegramBotUsername || null} signup={signup} next={safeNext} />
    </div>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9l20-7z" />
    </svg>
  );
}
