"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginClient({
  channels,
  next,
  prefill,
  defaultCountry,
}: {
  channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[];
  next: string | null;
  prefill?: { email?: string; phone?: string };
  defaultCountry?: string | null;
}) {
  const router = useRouter();
  return (
    <LoginForm
      channels={channels}
      prefill={prefill}
      defaultCountry={defaultCountry}
      onDone={(role) => {
        const dest = next || (role === "MASTER" ? "/pro" : ["OWNER", "ADMIN", "OPERATOR"].includes(role) ? "/admin" : "/account");
        router.replace(dest);
        router.refresh();
      }}
    />
  );
}
