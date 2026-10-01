import { NextResponse } from "next/server";
import { getSettings } from "@/server/settings";

/**
 * Промежуточная страница с Telegram Login Widget (AUTH-10, часть 2).
 * Telegram JS рендерит кнопку, после подтверждения в приложении перенаправляет
 * на /api/auth/telegram/widget с подписанными данными.
 * mode=link — привязка к существующему аккаунту (пользователь уже вошёл).
 */
export async function GET(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const next = url.searchParams.get("next") || "";

  const s = await getSettings();
  if (!s.telegramWidget.enabled) {
    return NextResponse.redirect(new URL("/ru/login?error=telegram_off", base));
  }

  const botUsername = s.notify.telegramBotUsername;
  if (!botUsername || !s.notify.telegramBotToken) {
    return NextResponse.redirect(new URL("/ru/login?error=telegram_failed", base));
  }

  const callbackPath = mode === "link" ? "/api/auth/telegram/link" : "/api/auth/telegram/widget";
  const callbackUrl = new URL(callbackPath, base).toString();
  const returnUrl = next ? `/ru${next}` : mode === "link" ? "/ru/account" : "/ru/services";
  const safeReturn = encodeURIComponent(returnUrl);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Войти через Telegram</title>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #f5f5f5; }
    .wrap { text-align: center; padding: 2rem; }
    p { color: #666; font-size: 0.9rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="wrap" id="widget-wrap">
    <script
      async
      src="https://telegram.org/js/telegram-widget.js?22"
      data-telegram-login="${botUsername}"
      data-size="large"
      data-auth-url="${callbackUrl}?next=${safeReturn}"
      data-request-access="write">
    </script>
    <p>Подтвердите вход в приложении Telegram</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
