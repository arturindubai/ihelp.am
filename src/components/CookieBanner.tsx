"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const STORAGE_KEY = "cookie_consent";

export function CookieBanner() {
  const t = useTranslations("cookies");
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    // Показываем баннер только если согласие ещё не получено
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss(value: "all" | "essential") {
    localStorage.setItem(STORAGE_KEY, value);
    document.cookie = `consent=${value};path=/;max-age=31536000;samesite=lax`;
    setHiding(true);
    setTimeout(() => setVisible(false), 220);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200"
      style={{
        transform: hiding ? "translateY(100%)" : "translateY(0)",
        boxShadow: "0 -2px 16px rgba(0,0,0,.08)",
      }}
    >
      <div className="card rounded-b-none border-b-0 p-4">
        {/* Телефон: вертикально; компьютер: горизонтально */}
        <div className="md:flex md:items-center md:justify-between md:gap-6">
          <div className="max-h-48 overflow-y-auto md:max-h-none">
            <p className="font-semibold">🍪 {t("title")}</p>
            <p className="mt-1 text-sm text-muted">
              {t.rich("text", {
                policyLink: (chunks) => (
                  <Link href="/p/privacy" className="text-brand underline underline-offset-2">
                    {t("policyLinkText")}
                  </Link>
                ),
              })}
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-2 md:mt-0 md:flex-row md:gap-3">
            <button
              className="btn-primary w-full md:w-auto"
              onClick={() => dismiss("all")}
            >
              {t("accept")}
            </button>
            <button
              className="btn-outline w-full md:w-auto"
              onClick={() => dismiss("essential")}
            >
              {t("essentialOnly")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
