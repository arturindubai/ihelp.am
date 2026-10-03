"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginClient({
  channels,
  emailEnabled,
  telegramBot,
  googleUrl,
  appleUrl,
  telegramWidgetUrl,
  signup,
  googleSignup,
  next,
}: {
  channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[];
  emailEnabled: boolean;
  telegramBot: string | null;
  googleUrl?: string;
  appleUrl?: string;
  telegramWidgetUrl?: string;
  signup?: { ticket: string; phone: string };
  googleSignup?: { ticket: string; email: string; name: string };
  next: string | null;
}) {
  const router = useRouter();
  return (
    <LoginForm
      channels={channels}
      emailEnabled={emailEnabled}
      telegramBot={telegramBot}
      googleUrl={googleUrl}
      appleUrl={appleUrl}
      telegramWidgetUrl={telegramWidgetUrl}
      signup={signup}
      googleSignup={googleSignup}
      onDone={(role) => {
        const dest = next || (role === "MASTER" ? "/pro" : role === "OPERATOR" ? "/operator" : ["OWNER", "ADMIN"].includes(role) ? "/admin" : "/services");
        router.replace(dest);
        router.refresh();
      }}
    />
  );
}
