"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isPWA() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

type State = "unresolved" | "unsupported" | "ios-hint" | "default" | "loading" | "granted" | "denied";

/** Кнопка «Включить уведомления на телефон» — показывается только после явного нажатия, не авто-попап */
export function PushEnableButton({ vapidPublicKey }: { vapidPublicKey: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("unresolved");

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setState(isIOS() && !isPWA() ? "ios-hint" : "unsupported");
      return;
    }
    setState(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default");
  }, []);

  if (state === "unresolved" || state === "unsupported") return null;

  if (state === "ios-hint") {
    return <p className="text-sm text-muted">{t("iosHint")}</p>;
  }

  if (state === "granted") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ok">
        <Bell size={14} /> {t("enabled")}
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <BellOff size={14} /> {t("denied")}
      </p>
    );
  }

  async function handleEnable() {
    if (!vapidPublicKey) return;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
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
      setState("granted");
    } catch {
      setState("default");
    }
  }

  return (
    <button
      type="button"
      onClick={handleEnable}
      disabled={state === "loading" || !vapidPublicKey}
      className="btn-ghost btn-sm flex items-center gap-1.5"
    >
      <Bell size={14} />
      {state === "loading" ? "…" : t("enable")}
    </button>
  );
}
