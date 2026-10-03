"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function InlineLogin({ channels, emailEnabled, telegramBot, googleUrl }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; emailEnabled: boolean; telegramBot: string | null; googleUrl?: string }) {
  const router = useRouter();
  return <LoginForm channels={channels} emailEnabled={emailEnabled} telegramBot={telegramBot} googleUrl={googleUrl} onDone={() => router.refresh()} />;
}
