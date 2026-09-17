# Дизайн: где что менять

Дизайн будет меняться, поэтому внешний вид собран в нескольких точках. Компоненты не содержат собственных цветов — только ссылки на токены.

| Что | Где | Применение |
|---|---|---|
| Цвета, шрифт, скругление карточек | `src/app/theme.css` | пересборка |
| Кнопки, карточки, поля, заголовки (`btn-primary`, `card`, `input`, `h1`…) | `src/app/globals.css` | пересборка |
| Логотип в шапках | `public/img/icon.svg` (путь — `src/components/Logo.tsx`) | пересборка |
| Иконка вкладки браузера | `src/app/icon.svg` | пересборка |
| Цвет панели браузера на телефоне, PWA | `themeColor` в `src/app/[locale]/layout.tsx`, `public/manifest.webmanifest` | пересборка |
| Картинка превью ссылок (WhatsApp, Telegram, соцсети) | `src/app/[locale]/opengraph-image.tsx`: логотип, название, слоган и город берёт из настроек; цвета — копия токенов | пересборка |
| Название, слоган, город | Админка → Настройки → Компания | сразу |
| Баннеры на главной (текст, картинка, цвет) | Админка → Баннеры | сразу |
| Тексты интерфейса | `messages/ru.json` или Админка → Тексты и переводы | пересборка / сразу |
| Контакты | `.env`, блок `CONTACT_*` (см. README → Контакты) | `docker compose up -d` |

Пересборка: `cd /opt/homecare && docker compose up -d --build`.

## Токены (`theme.css`)

| Токен | Класс Tailwind | Назначение |
|---|---|---|
| `--color-brand`, `-600`, `-50`, `-100` | `bg-brand`, `text-brand`, `bg-brand-50`… | фирменный цвет и его оттенки |
| `--color-ink` / `--color-ink-strong` | `text-ink`, `bg-ink`, `hover:bg-ink-strong` | основной текст, тёмные кнопки |
| `--color-muted` | `text-muted` | второстепенный текст |
| `--color-line` | `border-line` | границы |
| `--color-surface` | `bg-surface` | подложки секций |
| `--color-paper` | `bg-paper` | фон страницы и карточек |
| `--color-inverse` | `text-inverse` | текст на тёмном / фирменном фоне |
| `--color-overlay` | `bg-overlay/50` | затемнение под шторками |
| `--color-cta` | `bg-cta` | блок «Напишите нам» |
| `--color-ok` / `warn` / `bad` (+ `-50`) | `text-ok`, `bg-bad-50`… | статусы |
| `--font-sans` | — | шрифт (подключение — `src/app/[locale]/layout.tsx`) |
| `--radius-card` | `card` | скругление карточек |

## Правила для новых экранов

1. Никаких `#hex`, `bg-white`, `text-black`, `bg-[#…]` в компонентах — только токены. Нужен новый цвет → добавить токен в `theme.css`.
2. Повторяющийся набор классов (кнопка, чип, карточка) → `@utility` в `globals.css`, а не копипаст.
3. Логотип — только через `<Logo />`. Контакты — только через `src/lib/contacts.ts`.
4. Тексты — через `messages/*.json`, не строками в коде.

Проверка, что в коде не появилось захардкоженных цветов:
```bash
grep -rnE '#[0-9a-fA-F]{6}|\b(bg|text)-(white|black)\b|bg-\[#' src --include=*.tsx
```
(Исключения: цвет баннера по умолчанию в `ContentManagers.tsx` — это данные для color-picker, `themeColor` в layout и картинка превью ссылок `src/app/[locale]/opengraph-image.tsx` — генератор картинок не читает CSS, цвета там продублированы из `theme.css`, при смене палитры поправить.)
