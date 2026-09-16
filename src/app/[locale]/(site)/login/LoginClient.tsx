"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginClient({ channels, next }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; next: string | null }) {
  const router = useRouter();
  return (
    <LoginForm
      channels={channels}
      onDone={(role) => {
        const dest = next || (role === "MASTER" ? "/pro" : ["OWNER", "ADMIN", "OPERATOR"].includes(role) ? "/admin" : "/account");
        router.replace(dest);
        router.refresh();
      }}
    />
  );
}
