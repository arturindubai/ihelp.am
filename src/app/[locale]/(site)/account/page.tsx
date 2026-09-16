import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, ChevronRight, LayoutDashboard, Briefcase } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser, STAFF_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { ProfileClient } from "@/components/account/ProfileClient";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/account", locale });
  const [addresses, settings, t, tn] = await Promise.all([db.address.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }), getSettings(), getTranslations("account"), getTranslations("nav")]);
  return (
    <div className="container-m pt-4">
      <h1 className="h1 mb-4">{user.name || t("title")}</h1>
      <div className="card mb-4 divide-y divide-line">
        <Link href="/account/orders" className="flex items-center gap-3 p-4 font-medium"><CalendarDays size={20} /> <span className="flex-1">{t("orders")}</span><ChevronRight size={18} className="text-muted" /></Link>
        {user.role === "MASTER" && <Link href="/pro" className="flex items-center gap-3 p-4 font-medium"><Briefcase size={20} /> <span className="flex-1">{tn("pro")}</span><ChevronRight size={18} className="text-muted" /></Link>}
        {STAFF_ROLES.includes(user.role) && <Link href="/admin" className="flex items-center gap-3 p-4 font-medium"><LayoutDashboard size={20} /> <span className="flex-1">{tn("admin")}</span><ChevronRight size={18} className="text-muted" /></Link>}
      </div>
      <ProfileClient user={{ name: user.name, phone: user.phone, email: user.email, locale: user.locale }} addresses={addresses} districts={settings.booking.districts} enabledLocales={settings.locales.enabled} />
    </div>
  );
}
