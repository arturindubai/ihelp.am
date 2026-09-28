import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/server/auth";
import { PushPermissionBanner } from "@/components/pwa/PushPermissionBanner";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const [t, user] = await Promise.all([getTranslations("pro"), getCurrentUser()]);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="container-m flex h-14 items-center gap-2">
          <Link href="/" className="flex items-center font-bold"><Logo /></Link>
          <span className="ml-auto text-sm font-medium text-muted">{t("title")}</span>
        </div>
      </header>
      {children}
      {user && vapidKey && <PushPermissionBanner vapidPublicKey={vapidKey} />}
    </div>
  );
}
