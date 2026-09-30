import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, ChevronRight, LayoutDashboard, Briefcase } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { emailCodesAvailable } from "@/server/otp";
import { ProfileClient } from "@/components/account/ProfileClient";
import { PromoSlot } from "@/components/PromoSlot";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ telegram_error?: string; google_link_error?: string }> }) {
  const { locale } = await params;
  const { telegram_error, google_link_error } = await searchParams;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/account", locale });
  const [addresses, settings, t, tn] = await Promise.all([db.address.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }), getSettings(), getTranslations("account"), getTranslations("nav")]);
  const telegramLinkEnabled = settings.telegramWidget.enabled && !!settings.notify.telegramBotToken && !!settings.notify.telegramBotUsername;
  const telegramError = telegram_error && ["state", "failed", "conflict", "off"].includes(telegram_error) ? telegram_error : null;
  const googleEnabled = settings.google.enabled && !!settings.google.clientId;
  const googleLinkError = google_link_error && ["google_used", "email_mismatch", "google_off"].includes(google_link_error) ? google_link_error : null;
  return (
    <div className="container-m pt-4">
      <h1 className="h1 mb-4">{user.name || t("title")}</h1>
      <PromoSlot placement="CLIENT_CABINET" locale={locale} />
      <div className="card mb-4 divide-y divide-line">
        <Link href="/account/orders" className="flex items-center gap-3 p-4 font-medium"><CalendarDays size={20} /> <span className="flex-1">{t("orders")}</span><ChevronRight size={18} className="text-muted" /></Link>
        {user.role === "MASTER" && <Link href="/pro" className="flex items-center gap-3 p-4 font-medium"><Briefcase size={20} /> <span className="flex-1">{tn("pro")}</span><ChevronRight size={18} className="text-muted" /></Link>}
        {STAFF_ROLES.includes(user.role) && <Link href="/admin" className="flex items-center gap-3 p-4 font-medium"><LayoutDashboard size={20} /> <span className="flex-1">{tn("admin")}</span><ChevronRight size={18} className="text-muted" /></Link>}
      </div>
      <ProfileClient user={{ name: user.name, phone: user.phone, email: user.email, emailVerified: !!user.emailVerifiedAt, locale: user.locale, telegramId: user.telegramId, telegramUsername: user.telegramUsername, adsConsent: !!user.adsConsentAt, emailReminders: !user.emailUnsubscribedAt }} addresses={addresses} districts={settings.booking.districts} enabledLocales={settings.locales.enabled} emailCodes={emailCodesAvailable(settings)} telegramLinkEnabled={telegramLinkEnabled} telegramError={telegramError} googleEnabled={googleEnabled} googleLinkError={googleLinkError} />
    </div>
  );
}
