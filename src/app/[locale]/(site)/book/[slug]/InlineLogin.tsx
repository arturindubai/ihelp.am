"use client";
import { useRouter } from "@/i18n/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export function InlineLogin({ channels }: { channels: ("SMS" | "WHATSAPP" | "TELEGRAM")[] }) {
  const router = useRouter();
  return <LoginForm channels={channels} onDone={() => router.refresh()} />;
}
