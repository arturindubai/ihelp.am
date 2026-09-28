import { PushPermissionBanner } from "@/components/pwa/PushPermissionBanner";
import { getCurrentUser } from "@/server/auth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return (
    <>
      {children}
      {user && vapidKey && <PushPermissionBanner vapidPublicKey={vapidKey} />}
    </>
  );
}
