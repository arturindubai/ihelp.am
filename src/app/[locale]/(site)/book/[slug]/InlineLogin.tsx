"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function InlineLogin({ channels, emailEnabled }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[]; emailEnabled: boolean }) {
  const router = useRouter();
  return <LoginForm channels={channels} emailEnabled={emailEnabled} onDone={() => router.refresh()} />;
}
