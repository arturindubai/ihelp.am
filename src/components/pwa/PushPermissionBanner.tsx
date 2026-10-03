"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, X } from "lucide-react";

const DISMISSED_KEY = "push-dismissed";

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Баннер запроса push-разрешения: slide-up над нижним меню на мобильном, toast снизу-справа на десктопе */
export function PushPermissionBanner({ vapidPublicKey }: { vapidPublicKey: string }) {
  const t = useTranslations("push");
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    // Авто-показ убран: разрешение запрашивается только через кнопку PushEnableButton
    void isPushSupported;
    void DISMISSED_KEY;
  }, []);

  if (!visible) return null;

  function close() {
    setHiding(true);
    setTimeout(() => setVisible(false), 220);
  }

  async function handleAllow() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      close();
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("server");
      close();
    } catch {
      // Подписка не удалась — скрываем без sessionStorage, чтобы при следующем входе попробовать снова
      setHiding(true);
      setTimeout(() => setVisible(false), 220);
    }
  }

  function handleDismiss() {
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* приватный режим */ }
    close();
  }

  return (
    <>
      {/* Мобильный: полоска снизу, позиционируется над нижним меню (bottom-20 = h-20 спейсер BottomNav) */}
      <div
        className="fixed bottom-20 left-0 right-0 z-50 transition-transform duration-200 sm:hidden"
        style={{ transform: hiding ? "translateY(100%)" : "translateY(0)" }}
      >
        <div className="border-t border-line bg-paper shadow-lg">
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
              <Bell size={18} className="text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{t("title")}</p>
              <p className="mt-0.5 text-sm text-muted">{t("body")}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={handleAllow} className="btn-primary btn-sm">{t("allow")}</button>
                <button onClick={handleDismiss} className="btn-ghost btn-sm text-muted">{t("dismiss")}</button>
              </div>
            </div>
            <button onClick={handleDismiss} className="rounded p-1 text-muted hover:text-ink" aria-label={t("dismiss")}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Десктоп: карточка 320px снизу-справа */}
      <div
        className="fixed bottom-4 right-4 z-50 hidden w-80 transition-transform duration-200 sm:block"
        style={{ transform: hiding ? "translateY(calc(100% + 16px))" : "translateY(0)" }}
      >
        <div className="rounded-card border border-line bg-paper shadow-lg">
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
              <Bell size={18} className="text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{t("title")}</p>
              <p className="mt-0.5 text-sm text-muted">{t("body")}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={handleAllow} className="btn-primary btn-sm">{t("allow")}</button>
                <button onClick={handleDismiss} className="btn-ghost btn-sm text-muted">{t("dismiss")}</button>
              </div>
            </div>
            <button onClick={handleDismiss} className="rounded p-1 text-muted hover:text-ink" aria-label={t("dismiss")}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Декодирование base64url → Uint8Array для applicationServerKey */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
