import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/server/auth";
import { PushPermissionBanner } from "@/components/pwa/PushPermissionBanner";
import { getOrCreateVapidKeys } from "@/server/services/vapidKeys";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const [t, user, vapidKeys] = await Promise.all([
    getTranslations("pro"),
    getCurrentUser(),
    getOrCreateVapidKeys().catch(() => null),
  ]);
  const vapidPublicKey = vapidKeys?.publicKey ?? "";
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="container-m flex h-14 items-center gap-2">
          <Link href="/" className="flex items-center font-bold"><Logo /></Link>
          <span className="ml-auto text-sm font-medium text-muted">{t("title")}</span>
        </div>
      </header>
      {children}
      {user && vapidPublicKey && <PushPermissionBanner vapidPublicKey={vapidPublicKey} />}
    </div>
  );
}
