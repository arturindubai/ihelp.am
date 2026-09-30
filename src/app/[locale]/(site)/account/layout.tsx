import { PushPermissionBanner } from "@/components/pwa/PushPermissionBanner";
import { getCurrentUser } from "@/server/auth";
import { getOrCreateVapidKeys } from "@/server/services/vapidKeys";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [user, vapidKeys] = await Promise.all([getCurrentUser(), getOrCreateVapidKeys().catch(() => null)]);
  const vapidPublicKey = vapidKeys?.publicKey ?? "";
  return (
    <>
      {children}
      {user && vapidPublicKey && <PushPermissionBanner vapidPublicKey={vapidPublicKey} />}
    </>
  );
}
