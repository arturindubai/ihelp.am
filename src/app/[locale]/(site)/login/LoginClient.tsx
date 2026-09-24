"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginClient({
  channels,
  emailEnabled,
  telegramBot,
  signup,
  next,
}: {
  channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[];
  emailEnabled: boolean;
  telegramBot: string | null;
  signup?: { ticket: string; phone: string };
  next: string | null;
}) {
  const router = useRouter();
  return (
    <LoginForm
      channels={channels}
      emailEnabled={emailEnabled}
      telegramBot={telegramBot}
      signup={signup}
      onDone={(role) => {
        const dest = next || (role === "MASTER" ? "/pro" : ["OWNER", "ADMIN", "OPERATOR"].includes(role) ? "/admin" : "/account");
        router.replace(dest);
        router.refresh();
      }}
    />
  );
}
