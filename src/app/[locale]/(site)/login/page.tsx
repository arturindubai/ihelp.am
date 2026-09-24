import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { availableChannels } from "@/server/otp";
import { getSettings } from "@/server/settings";
import { unpackSignupTicket } from "@/server/services/signupTicket";
import { detectCountry } from "@/server/services/geoip";
import { LoginClient } from "./LoginClient";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string; complete?: string }> }) {
  const { locale } = await params;
  const { next, error, complete } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (user) redirect({ href: safeNext || "/account", locale });
  // Пришли из Google/Apple (email уже проверен) или из Telegram-бота (телефон-подсказка) без
  // существующего аккаунта — AUTH-11: телефон всё равно подтвердится SMS-кодом на этой же форме
  const completeTicket = complete ? unpackSignupTicket(complete) : null;
  const prefill =
    completeTicket?.kind === "new"
      ? { email: completeTicket.email || undefined, phone: completeTicket.phone || undefined }
      : undefined;
  const [channels, s, t, country] = await Promise.all([availableChannels(), getSettings(), getTranslations("auth"), detectCountry()]);
  const google = s.google.enabled && !!s.google.clientId;
  const apple = s.apple.enabled && !!s.apple.clientId;
  const errorKey =
    error &&
    ["google_off", "google_state", "google_failed", "google_not_linked", "apple_off", "apple_state", "apple_failed", "apple_not_linked", "telegram_state", "telegram_failed", "blocked"].includes(
      error,
    )
      ? error
      : null;
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-5">{t("title")}</h1>
      {errorKey && <p className="mb-4 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{t(`errors.${errorKey}` as "errors.blocked")}</p>}
      {(google || apple) && (
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
        </div>
      )}
      <LoginClient channels={channels} next={safeNext} prefill={prefill} defaultCountry={country} />
    </div>
  );
}
