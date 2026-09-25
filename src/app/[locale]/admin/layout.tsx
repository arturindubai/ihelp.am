import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { sectionsFor } from "@/server/admin";
import { getSettings } from "@/server/settings";
import { VersionWatch } from "@/components/admin/VersionWatch";
import { buildId } from "@/server/version";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/admin", locale });
  const sections = sectionsFor(user.role);
  const t = await getTranslations("errors");
  if (!sections.length) return <div className="p-10 text-center">{t("forbidden")}</div>;
  const s = await getSettings();
  return (
    <div className="flex min-h-dvh flex-col bg-surface md:flex-row">
      <AdminNav sections={sections} brand={s.brand.name} />
      <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
      <VersionWatch initial={buildId()} />
    </div>
  );
}
