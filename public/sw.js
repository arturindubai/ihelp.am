// Минимальный сервис-воркер: нужен, чтобы телефон предлагал установить сайт как приложение.
// Страницы не кэшируем (контент меняется в админке), кэшируем только статику сборки.
const STATIC = "ihelp-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Статика сборки и картинки: сначала кэш, затем сеть
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/img/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Остальное — только сеть; при обрыве показываем понятное сообщение
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response("<!doctype html><meta charset=utf-8><title>Нет связи</title><body style=\"font-family:system-ui;text-align:center;padding:80px\"><h1>Нет связи</h1><p>Проверьте интернет и обновите страницу.</p>", {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    );
  }
});
