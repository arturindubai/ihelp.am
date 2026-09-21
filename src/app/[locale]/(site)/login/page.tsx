import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { availableChannels } from "@/server/otp";
import { getSettings } from "@/server/settings";
import { LoginClient } from "./LoginClient";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; error?: string }> }) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (user) redirect({ href: safeNext || "/account", locale });
  const [channels, s, t] = await Promise.all([availableChannels(), getSettings(), getTranslations("auth")]);
  const google = s.google.enabled && !!s.google.clientId;
  const errorKey = error && ["google_off", "google_state", "google_failed", "google_not_linked", "blocked"].includes(error) ? error : null;
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-5">{t("title")}</h1>
      {errorKey && <p className="mb-4 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad">{t(`errors.${errorKey}` as "errors.blocked")}</p>}
      {google && (
        <div className="mb-5">
          <a className="btn-outline w-full" href={`/api/auth/google/start${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}>
            {t("google")}
          </a>
          <p className="mt-2 text-center text-xs text-muted">{t("googleHint")}</p>
        </div>
      )}
      <LoginClient channels={channels} next={safeNext} />
    </div>
  );
}
