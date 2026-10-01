"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { submitServiceInterest, autoNotifyInterest } from "@/server/actions/catalog";

type Props = {
  open: boolean;
  onClose: () => void;
  categorySlug: string | null;
  categoryTitle: string;
  autoMode: boolean;
};

export function NotifyPopup({ open, onClose, categorySlug, categoryTitle, autoMode }: Props) {
  const tc = useTranslations("catalog");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "already">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setContact("");
      setStatus("idle");
      setError("");
    }
  }, [open, categorySlug]);

  // Авторегистрация при открытии попапа в autoMode
  useEffect(() => {
    if (!open || !autoMode || !categorySlug) return;
    startTransition(async () => {
      await autoNotifyInterest(categorySlug);
    });
  }, [open, autoMode, categorySlug]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim() || !categorySlug) return;
    setError("");
    startTransition(async () => {
      const result = await submitServiceInterest(categorySlug, contact);
      if (result === "invalid") setError(tc("notifyInvalid"));
      else if (result === "too_many") setError(tc("notifyTooMany"));
      else setStatus(result);
    });
  }

  function successCard(text: string) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-ok/30 bg-ok-50 p-4">
        <CheckCircle size={20} className="mt-0.5 shrink-0 text-ok" />
        <span className="text-sm text-ok">{text}</span>
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={<span className="line-clamp-2">{categoryTitle}</span>}>
      <p className="mb-3 text-sm text-muted">{tc("notifyPopupHint")}</p>

      {autoMode ? (
        successCard(tc("notifyAutoSuccess"))
      ) : status === "ok" ? (
        successCard(tc("notifySuccess"))
      ) : status === "already" ? (
        successCard(tc("notifyAlready"))
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={contact}
            onChange={(e) => { setContact(e.target.value); if (error) setError(""); }}
            placeholder={tc("notifyPlaceholder")}
            className={`input${error ? " border-bad focus:border-bad" : ""}`}
            autoComplete="off"
            inputMode="email"
          />
          {error ? (
            <p className="mt-1 text-center text-xs text-bad">{error}</p>
          ) : (
            <p className="mt-1 text-center text-xs text-muted">{tc("notifyHint")}</p>
          )}
          <button type="submit" className="btn-primary mt-3 w-full" disabled={!contact.trim()}>
            {tc("notifyButton")}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            {tc.rich("notifyConsent", {
              privacy: (c) => (
                <Link href="/p/privacy" target="_blank" className="underline underline-offset-2">{c}</Link>
              ),
            })}
          </p>
        </form>
      )}
    </Sheet>
  );
}
