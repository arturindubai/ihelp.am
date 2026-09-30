// Сервис-воркер: установка сайта как приложения, кэш статики и визитов, push-уведомления.
// Страницы не кэшируем (контент меняется в админке), кэшируем только статику сборки и данные визитов.
const STATIC = "ihelp-static-v1";
const VISITS = "ihelp-visits-v1";

// Офлайн-страницы: предзагружаем все три локали при установке воркера
const OFFLINE_PAGES = [
  "/ru/account/offline",
  "/en/account/offline",
  "/am/account/offline",
  "/ru/pro/offline",
  "/en/pro/offline",
  "/am/pro/offline",
];

self.addEventListener("install", (e) => {
  // Предзагрузка офлайн-страниц не блокирует установку воркера: используем allSettled
  e.waitUntil(
    caches.open(VISITS).then((cache) =>
      Promise.allSettled(
        OFFLINE_PAGES.map((url) =>
          fetch(url, { credentials: "include" })
            .then((r) => { if (r.ok) cache.put(url, r); })
            .catch(() => null),
        ),
      ),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC && k !== VISITS).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Разбирает локаль из пути (/ru/...) → 'ru' | 'en' | 'am', по умолчанию 'ru'
function pathLocale(pathname) {
  const seg = pathname.split("/")[1];
  return ["ru", "en", "am"].includes(seg) ? seg : "ru";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API визитов: сеть с кэшем на случай офлайн
  if (url.pathname === "/api/visits/me" || url.pathname === "/api/visits/pro") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VISITS).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } }))),
    );
    return;
  }

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

  // Навигация: офлайн-страницы берём из кэша; прочие страницы — сеть с понятным fallback
  if (request.mode === "navigate") {
    const isOfflinePage = url.pathname.includes("/account/offline") || url.pathname.includes("/pro/offline");

    if (isOfflinePage) {
      // Офлайн-страница: сначала сеть (при наличии интернета покажет редирект), затем кэш
      event.respondWith(
        fetch(request).catch(() =>
          caches.match(request).then((cached) => cached || caches.match(url.pathname.includes("/pro/offline") ? `/${pathLocale(url.pathname)}/pro/offline` : `/${pathLocale(url.pathname)}/account/offline`)
            .then((fallback) => fallback || genericOfflineHtml(pathLocale(url.pathname))),
        ),
      );
      return;
    }

    // Прочие страницы: при сбое — редирект на офлайн-страницу из кэша, иначе общая заглушка
    event.respondWith(
      fetch(request).catch(async () => {
        const locale = pathLocale(url.pathname);
        const isAccount = url.pathname.includes("/account") || url.pathname.includes("/orders");
        const isPro = url.pathname.includes("/pro");
        if (isAccount) {
          const page = await caches.match(`/${locale}/account/offline`);
          if (page) return Response.redirect(`/${locale}/account/offline`, 302);
        }
        if (isPro) {
          const page = await caches.match(`/${locale}/pro/offline`);
          if (page) return Response.redirect(`/${locale}/pro/offline`, 302);
        }
        return genericOfflineHtml(locale);
      }),
    );
  }
});

function genericOfflineHtml(locale) {
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
}

// Push-уведомления: показать системное уведомление при получении push от сервера
self.addEventListener("push", (event) => {
  // Всегда вызываем waitUntil: браузер требует видимого уведомления для каждого push-события
  let data = { title: "iHelp", body: "", url: "/" };
  if (event.data) {
    try { Object.assign(data, event.data.json()); } catch { /* не JSON — показываем заглушку */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

// Клик по уведомлению — открыть нужную страницу
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relUrl = event.notification.data?.url || "/";
  // client.url — полный адрес; преобразуем относительный url к абсолютному для сравнения
  const absUrl = new URL(relUrl, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === absUrl && "focus" in client) return client.focus();
      }
      return clients.openWindow(relUrl);
    }),
  );
});
