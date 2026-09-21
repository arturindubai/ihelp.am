import { getLocale } from "next-intl/server";
import { loadMessages } from "@/i18n/messages";

/** Страница 404 внутри языкового раздела: тексты берутся из переводов, при сбое — по-русски */
export default async function NotFound() {
  let texts = { notFound: "Страница не найдена", toHome: "На главную" };
  let locale = "ru";
  try {
    locale = await getLocale();
    const m = (await loadMessages(locale)) as { common?: { notFound?: string; toHome?: string } };
    texts = { notFound: m.common?.notFound ?? texts.notFound, toHome: m.common?.toHome ?? texts.toHome };
  } catch {
    // без языкового контекста показываем русский текст
  }
  return (
    <div className="container-m py-20 text-center">
      <h1 className="h1 mb-2">404</h1>
      <p className="mb-6 text-muted">{texts.notFound}</p>
      <a className="btn-primary" href={`/${locale}`}>
        {texts.toHome}
      </a>
    </div>
  );
}
