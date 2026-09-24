"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function InlineLogin({ channels, defaultCountry }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; defaultCountry?: string | null }) {
  const router = useRouter();
  return <LoginForm channels={channels} defaultCountry={defaultCountry} onDone={() => router.refresh()} />;
}
