"use client";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/server/actions/auth";

export function LogoutButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className="btn-ghost btn-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await logoutAction();
          router.replace("/");
        })
      }
    >
      {label}
    </button>
  );
}
