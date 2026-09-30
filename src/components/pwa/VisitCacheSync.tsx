"use client";
import { useEffect } from "react";
import { writeVisitCache, type VisitCacheData } from "@/lib/visitCache";

// Молчаливо синхронизирует данные визитов в localStorage после успешного входа.
// SW в фоне кэширует ответ API — при потере сети данные остаются доступны на офлайн-странице.
export function VisitCacheSync({ endpoint, cacheKey }: { endpoint: "/api/visits/me" | "/api/visits/pro"; cacheKey: string }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: VisitCacheData | null) => {
        if (data?.visits) writeVisitCache(cacheKey, data);
      })
      .catch(() => {
        // сеть недоступна или ошибка — кэш не обновляем
      });
  }, [endpoint, cacheKey]);

  return null;
}
