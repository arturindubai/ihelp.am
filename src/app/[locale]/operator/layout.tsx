import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth";
import { Logo } from "@/components/Logo";
import { Link } from "@/i18n/navigation";

export const metadata = { robots: { index: false } };

const ALLOWED = ["OPERATOR", "ADMIN", "OWNER"] as const;

export default async function OperatorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login?next=/operator", locale });
  if (!(ALLOWED as readonly string[]).includes(user.role)) forbidden();
  const t = await getTranslations("operator");
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="container-m flex h-14 items-center gap-2">
          <Link href="/" className="flex items-center font-bold">
            <Logo />
          </Link>
          <span className="ml-auto text-sm font-medium text-muted">{t("title")}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
