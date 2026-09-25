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
      caches.match(request).then((cached) => {
        // Сеть в фоне: картинка, заменённая в админке, обновится со следующего захода
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }

  // Остальное — только сеть; при обрыве показываем понятное сообщение на языке клиента
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
        const locale = match ? match[1].trim() : "ru";

        const OFFLINE = {
          ru: { title: "Нет связи", body: "Проверьте интернет и обновите страницу." },
          en: { title: "No connection", body: "Check your internet and reload the page." },
          am: { title: "Կապ չկա", body: "Ստուգեք ինտերնետը և թարմացրեք էջը:" },
        };
        const t = OFFLINE[locale] || OFFLINE.ru;

        return new Response(
          `<!doctype html><meta charset=utf-8><title>${t.title}</title><body style="font-family:system-ui;text-align:center;padding:80px"><h1>${t.title}</h1><p>${t.body}</p>`,
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }),
    );
  }
});
