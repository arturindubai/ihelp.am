"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginClient({ channels, emailEnabled, next }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; emailEnabled: boolean; next: string | null }) {
  const router = useRouter();
  return (
    <LoginForm
      channels={channels}
      emailEnabled={emailEnabled}
      onDone={(role) => {
        const dest = next || (role === "MASTER" ? "/pro" : ["OWNER", "ADMIN", "OPERATOR"].includes(role) ? "/admin" : "/account");
        router.replace(dest);
        router.refresh();
      }}
    />
  );
}
