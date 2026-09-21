"use client";
import { useEffect } from "react";

/** Регистрация сервис-воркера: без него телефон не предложит установить сайт как приложение */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => navigator.serviceWorker.register("/sw.js").catch(() => {}), 1500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
