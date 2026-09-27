import messages from "@/../messages/ru.json";

export default function NotFound() {
  return (
    <html lang="ru">
      <head>
        <style>{`body{margin:0;font-family:system-ui,sans-serif;text-align:center;padding:80px;color:var(--color-ink);background:var(--color-paper)}`}</style>
      </head>
      <body>
        <h1>{messages.notFound.title}</h1>
        <a href="/ru" style={{ textDecoration: "underline" }}>{messages.notFound.back}</a>
      </body>
    </html>
  );
}
