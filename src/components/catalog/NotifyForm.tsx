"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { submitServiceInterest } from "@/server/actions/catalog";

type Props = {
  serviceSlug: string;
  t: {
    notifyTitle: string;
    notifySubtitle: string;
    notifyPlaceholder: string;
    notifyHint: string;
    notifyButton: string;
    notifySuccess: string;
    notifyAlready: string;
    notifyInvalid: string;
    notifyTooMany: string;
  };
};

export function NotifyForm({ serviceSlug, t }: Props) {
  const tc = useTranslations("catalog");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "already">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (status === "ok") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-ok/30 bg-ok-50 p-4">
        <CheckCircle size={20} className="mt-0.5 shrink-0 text-ok" />
        <span className="text-sm text-ok">{t.notifySuccess}</span>
      </div>
    );
  }

  if (status === "already") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-ok/30 bg-ok-50 p-4">
        <CheckCircle size={20} className="mt-0.5 shrink-0 text-ok" />
        <span className="text-sm text-ok">{t.notifyAlready}</span>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.trim()) {
      setError(t.notifyInvalid);
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await submitServiceInterest(serviceSlug, contact);
      if (result === "invalid") {
        setError(t.notifyInvalid);
      } else if (result === "too_many") {
        setError(t.notifyTooMany);
      } else {
        setStatus(result);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-[var(--radius-card)] border border-brand-100 bg-brand-50 p-4"
    >
      <h3 className="h3">{t.notifyTitle}</h3>
      <p className="mt-0.5 text-sm text-muted">{t.notifySubtitle}</p>

      <div className="mt-3">
        <input
          type="text"
          value={contact}
          onChange={(e) => {
            setContact(e.target.value);
            if (error) setError("");
          }}
          placeholder={t.notifyPlaceholder}
          className={`input${error ? " border-bad focus:border-bad" : ""}`}
          disabled={pending}
          autoComplete="off"
          inputMode="email"
        />
        {error ? (
          <p className="mt-1 text-center text-xs text-bad">{error}</p>
        ) : (
          <p className="mt-1 text-center text-xs text-muted">{t.notifyHint}</p>
        )}
      </div>

      <button
        type="submit"
        className="btn-primary mt-3 w-full"
        disabled={!contact.trim() || pending}
      >
        {t.notifyButton}
      </button>

      <p className="mt-2 text-center text-xs text-muted">
        {tc.rich("notifyConsent", {
          privacy: (c) => (
            <Link href="/p/privacy" target="_blank" className="underline underline-offset-2">
              {c}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}
