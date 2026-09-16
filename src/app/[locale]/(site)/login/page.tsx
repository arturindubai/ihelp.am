import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { availableChannels } from "@/server/otp";
import { LoginClient } from "./LoginClient";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (user) redirect({ href: safeNext || "/account", locale });
  const [channels, t] = await Promise.all([availableChannels(), getTranslations("auth")]);
  return (
    <div className="container-m pt-6">
      <h1 className="h1 mb-5">{t("title")}</h1>
      <LoginClient channels={channels} next={safeNext} />
    </div>
  );
}
