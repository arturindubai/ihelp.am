import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getSettings } from "@/server/settings";
import { contactLinks } from "@/lib/contacts";
import { getCurrentUser, STAFF_ROLES } from "@/server/auth";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, user, t, tf] = await Promise.all([getSettings(), getCurrentUser(), getTranslations("nav"), getTranslations("footer")]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/95 backdrop-blur">
        <div className="container-w flex h-14 items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Logo />
            <span className="text-lg">{s.brand.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Suspense>
              <LocaleSwitcher enabled={s.locales.enabled} />
            </Suspense>
            {user && STAFF_ROLES.includes(user.role) && (
              <Link href="/admin" className="btn-outline btn-sm hidden sm:inline-flex">
                {t("admin")}
              </Link>
            )}
            {user?.role === "MASTER" && (
              <Link href="/pro" className="btn-outline btn-sm">
                {t("pro")}
              </Link>
            )}
            <Link href={user ? "/account" : "/login"} className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium md:flex">
              <UserRound size={16} /> {user ? user.name || t("account") : t("login")}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-10 border-t border-line bg-surface py-6 text-sm text-muted">
        <div className="container-w flex flex-wrap gap-x-5 gap-y-2">
          <span>© {new Date().getFullYear()} {s.brand.name}</span>
          <Link href="/p/offer">{tf("offer")}</Link>
          <Link href="/p/privacy">{tf("privacy")}</Link>
          <Link href="/p/cancellation">{tf("cancellation")}</Link>
          {contactLinks(s.brand).map((c) => (
            <a key={c.key} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener">
              {c.label}
            </a>
          ))}
        </div>
      </footer>
      <BottomNav />
    </div>
  );
}
