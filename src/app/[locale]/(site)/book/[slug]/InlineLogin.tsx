"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function InlineLogin({ channels, emailEnabled, telegramBot }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; emailEnabled: boolean; telegramBot: string | null }) {
  const router = useRouter();
  return <LoginForm channels={channels} emailEnabled={emailEnabled} telegramBot={telegramBot} onDone={() => router.refresh()} />;
}
