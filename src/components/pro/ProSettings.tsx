"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { proNotifySettingsAction } from "@/server/actions/pro";

export function ProSettings({
  notifyEnabled,
  staffChatId,
  botUsername,
}: {
  notifyEnabled: boolean;
  staffChatId: string | null;
  botUsername: string;
}) {
  const t = useTranslations("pro");
  const [enabled, setEnabled] = useState(notifyEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    start(async () => {
      const res = await proNotifySettingsAction(next);
      if (!res.ok) {
        setEnabled(!next);
        setError(t("settings.saveError"));
      }
    });
  }

  const connected = !!staffChatId;

  return (
    <div className="card p-4">
      <div className="mb-3 font-semibold">{t("settings.notifyTitle")}</div>

      {!connected && (
        <div className="mb-3 rounded-xl bg-warn-50 p-3 text-sm text-warn">
          {t("settings.notConnected")}{" "}
          {botUsername && (
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              {t("settings.writeBot")} →
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{t("settings.receiveNotify")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!connected || pending}
          onClick={toggle}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            enabled ? "bg-brand" : "bg-line",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block size-5 rounded-full bg-paper shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      {!enabled && connected && (
        <p className="mt-2 rounded-xl bg-warn-50 p-3 text-sm text-warn">
          {t("settings.notifyOff")}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-xl bg-bad-50 p-3 text-sm text-bad">{error}</p>
      )}
    </div>
  );
}
