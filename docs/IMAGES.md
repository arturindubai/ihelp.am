# Изображения iHelp: что сгенерировать и какими промптами

Все картинки на сайте сейчас — временные схематичные SVG-заглушки. Здесь список того, что нужно сгенерировать, с отдельным промптом на каждую картинку. Задача в бэклоге — DSN-3.

**Сверено с кодом 23.09.2026.** У пяти позиций из черновика (обложка главной — 2 файла, иллюстрации «как это работает» — 3 файла) в вёрстке сейчас физически нет места: грузить их через админку пока некуда, картинка просто не появится на сайте. У части остальных пропорции ниже отличаются от более раннего черновика — сверены построчно с классами в коде, а не угаданы на глаз. Подробности — в таблице «Статус» и пометках по каждому разделу.

## Как пользоваться

1. К каждому промпту спереди добавляйте **общий стиль** (ниже) — тогда картинки будут выглядеть одной серией, а не набором из разных банков.
2. Генерируйте в указанном размере. Если модель не умеет произвольный размер — берите ближайшие пропорции и кадрируйте.
3. Загружайте через админку: категории и услуги — в карточке (поля «Картинка», у услуги ещё отдельно «Картинка баннера»), акционный баннер — в разделе «Баннеры», мастеров — в карточке мастера. Ничего через сервер класть не нужно.
4. Один и тот же `seed` для всей серии (если модель поддерживает) даёт более ровный результат.
5. Разделы 1 и 6 (обложка главной, иллюстрации «как это работает») — не генерировать в первую очередь: под них ещё нет вёрстки, см. пометки внутри.

**Общий стиль** (добавлять к каждому промпту):

> Photorealistic editorial photography, natural daylight from a window, warm and clean interior of a modern Armenian apartment in Yerevan, soft shadows, shallow depth of field, calm and friendly mood, muted natural colors with one warm burnt-orange (terracotta, hex #C2521B) accent, no text, no logos, no watermarks.

**Отрицательный промпт** (тоже к каждому):

> text, letters, watermark, logo, brand names, distorted hands, extra fingers, cluttered background, harsh flash, oversaturated colors, stock-photo smiling into camera, plastic skin, collage, frame, border

**Про цвет.** Акцент в промптах — не выдуманный, а действующий токен `--color-brand` (#C2521B, тёплый терракотово-рыжий) из `theme.css`: он уже везде на сайте — кнопки, рейтинг, активные пункты меню, превью-картинка ссылок. DSN-2 ещё не утвердила финальную палитру iHelp (текущий цвет — «прежний», от старого бренда), поэтому это рабочее приближение, не гарантия. Если DSN-2 выберет другой цвет — фото с формой мастеров (люди) придётся перегенерировать; иллюстрации шагов (раздел 6) и знак логотипа (раздел 7) можно просто перекрасить в редакторе, перегенерация не нужна.

**Обязательные требования**

- **Без текста на картинке.** Сайт на трёх языках — вшитый текст не переведётся.
- Люди разного возраста, внешность — местная, не глянцевые модели.
- Форма мастера — однотонная, в фирменном цвете. Сейчас это #C2521B — см. «Про цвет» выше; если DSN-2 утвердит другой, форму придётся перегенерировать.
- Интерьеры — ереванские квартиры: балконы, высокие окна, простая мебель. Не американские загородные дома.
- Вес после загрузки — до 300 КБ (уменьшение при загрузке делает AUD-1).

---

## Статус на 23.09.2026 (сверено построчно с кодом)

| Картинка | Реально на сайте сейчас | Вывод |
|---|---|---|
| IMG-01/02 — обложка главной | Обложки нет вообще: главная начинается сразу с заголовка (`src/app/[locale]/(site)/page.tsx`), ни десктопного, ни мобильного блока под фон не заведено | **Отложить.** Ждёт редизайна главной (DSN-1) |
| IMG-03…07 — плитки категорий | Иконка 76×76, квадрат (`size-[76px] rounded-2xl`, `page.tsx:47`) | Размер поправлен на 1:1 (в черновике было 4:3) |
| IMG-08 — карточка услуги | Два разных поля: `image` — квадрат 84×84 в списке услуг (`ServiceCard.tsx:11`), `bannerImage` — 16:9 в шапке страницы услуги (`s/[slug]/page.tsx:35`); оба редактируются в `ServiceEditor.tsx` | Разделено на два промпта: IMG-08a и IMG-08b |
| IMG-09…11 — портреты мастеров | Круглый аватар 44–96px (`rounded-full object-cover`) — карточка мастера, карусель под услугой, выбор мастера при заказе, кабинет мастера | Пропорция 1:1 верна, добавлена пометка про круглую маску |
| IMG-12/13 — баннер акции | Одно поле `image` в базе (модель `Banner`), картинка — притемнённая подложка под текст (`opacity-60` поверх заливки `bg`), высота фиксирована 160px, ширина резиновая 86vw (макс. 440px) → реально ~2:1…2.75:1, не 3:1, и без отдельного квадрата для телефона | Объединено в один промпт вместо двух, размер и композиция поправлены |
| IMG-14…16 — «как это работает» | Картинок нет: три шага — кружок с цифрой (`bg-ink`, текст из переводов), `<img>` не используется | **Отложить.** Нужна доработка вёрстки блока, прежде чем эти файлы куда-то встанут |
| IMG-17 — знак логотипа | `src/app/icon.svg` уже нарисован вручную: заливка фирменным цветом, дом+рука белым контуром, 512×512, фон непрозрачный. Отдельного скрипта сборки PNG 192/512/180 из большого файла в репозитории нет (в черновике было указано обратное) — сборка иконок числится в открытых критериях CONTENT-6 | Низкий приоритет — рисованный вариант уже работает |

---

## 1. Обложка главной страницы — отложено, нет вёрстки

Обложки в коде сейчас нет: страница начинается сразу с заголовка, ни десктопного, ни мобильного блока-фона не заведено (`src/app/[locale]/(site)/page.tsx`). Промпты ниже — задел под будущий редизайн главной (DSN-1: «сначала цвета, шрифты и картинки»). **Не генерировать и не грузить сейчас** — класть будет некуда, а это против критерия приёмки DSN-3 «картинка видна на сайте». Размеры ниже — расчётные под типичный полноэкранный hero, кодом не проверены (проверять нечем, вёрстки ещё нет).

Нужны два кадра одного сюжета — горизонтальный для компьютера и вертикальный для телефона. Композиция: свободное место слева или сверху под заголовок и кнопку.

### IMG-01 — обложка, компьютер
Где: первый экран главной (когда появится) · Размер: 1920×1080 (16:9)

> A friendly home-service professional in a plain burnt-orange uniform polo finishing cleaning a bright living room, standing right of center, looking down at their work, large window with Yerevan rooftops softly blurred behind, empty uncluttered space on the left third of the frame for a headline, wide horizontal composition.

### IMG-02 — обложка, телефон
Где: первый экран главной на мобильных (когда появится) · Размер: 1080×1350 (4:5)

> Vertical crop of the same scene: a home-service professional in a plain burnt-orange uniform polo cleaning a bright living room, subject in the lower half, empty calm space in the upper third for a headline, window light from the left, portrait composition.

---

## 2. Плитки категорий

Одинаковые пропорции — иначе плитки на главной прыгают. Сейчас это маленькая квадратная иконка 76×76 (`size-[76px] rounded-2xl`, `page.tsx:47`), не альбомная плитка — генерируйте в 1:1. На 76 пикселях мелкая деталь всё равно потеряется, поэтому сюжет должен читаться простым силуэтом по центру, без лишних мелочей по краям.

### IMG-03 — Уборка
Где: категория `cleaning` · Размер: 800×800 (1:1)

> Close-up of hands in light gloves wiping a kitchen countertop with a microfiber cloth, clean modern kitchen softly out of focus behind, morning light, tight square composition centered on the action.

### IMG-04 — Генеральная уборка
Где: категория `deep-cleaning` · Размер: 800×800 (1:1)

> A cleaning professional in burnt-orange uniform cleaning inside an oven and kitchen cabinets, detailed deep-cleaning work, buckets and brushes neatly arranged nearby, bright kitchen, focused working mood, tight square composition.

### IMG-05 — Химчистка мебели
Где: категория `upholstery` · Размер: 800×800 (1:1)

> Upholstery cleaning of a light fabric sofa with a professional extraction machine, visible clean stripe on the fabric, living room in soft daylight, close three-quarter view, tight square composition.

### IMG-06 — Мастер на час
Где: категория `handyman` · Размер: 800×800 (1:1)

> A handyman in burnt-orange uniform mounting a shelf on an apartment wall with a cordless drill, small toolbox open on the floor, calm home interior, natural light, tight square composition.

### IMG-07 — Уборка после ремонта
Где: категория `after-renovation` · Размер: 800×800 (1:1)

> Post-renovation cleaning: a professional vacuuming construction dust in a freshly renovated empty apartment, protective film partly removed from a window, bare walls, bright daylight, tight square composition.

---

## 3. Карточки услуг

По одной паре на услугу — список и шапка страницы используют разные поля в базе (`image` и `bannerImage`, оба редактируются в карточке услуги). Сейчас в каталоге заведена одна услуга — остальные появятся вместе с каталогом (DSN-4), промпты добавим тем же шаблоном: сюжет = что именно делает мастер.

### IMG-08a — Регулярная уборка, миниатюра в списке
Где: список услуг на главной, поле «Картинка» (`ServiceCard.tsx:11`) · Размер: 800×800 (1:1)

> A tidy living room being finished by a cleaning professional in burnt-orange uniform, folded throw on the sofa, fresh flowers on the table, sense of order and calm, tight square composition centered on the professional.

### IMG-08b — Регулярная уборка, шапка страницы услуги
Где: страница услуги `/s/regular-cleaning`, поле «Картинка баннера» (`s/[slug]/page.tsx:35`) · Размер: 1600×900 (16:9)

> Wide shot of the same tidy living room, a cleaning professional in burnt-orange uniform finishing up, folded throw on the sofa, fresh flowers on the table, sense of order and calm, wide horizontal composition filling the frame edge to edge.

---

## 4. Мастера

Портреты для карточки мастера и карусели «мастера» под услугой. Разный возраст и пол, одинаковый фон и свет — карточки стоят рядом. Фото показывается как круглый аватар (44–96px в разных местах интерфейса) — держите лицо и плечи по центру кадра: углы квадрата всё равно обрежутся в круг.

Сейчас в базе три демо-мастера — Анна, Мариам, Лусине (все женские имена, `src/app/[locale]/(site)/masters/[slug]/page.tsx`), а CONTENT-1 (реальные мастера вместо демо) ещё не сделана. Три варианта портретов ниже — общий набор для блока доверия, а не жёсткая привязка «этот портрет = эта карточка»: любой из трёх можно поставить на любую демо-карточку, пол не обязан совпадать с именем. Когда наймут настоящих мастеров, фото всё равно заменятся их собственными.

### IMG-09…IMG-11 — портреты мастеров
Где: карточка мастера, карусель под услугой, выбор мастера при заказе · Размер: 600×600 (1:1), по три варианта

> Friendly portrait of a home-service professional in a plain burnt-orange uniform polo, neutral light gray background, soft even studio light, relaxed natural expression, chest-up framing, centered, looking at camera, generous margin around head and shoulders so a circular crop doesn't cut the face.
>
> Варианты: (а) женщина около 30 лет; (б) мужчина около 45 лет; (в) женщина около 55 лет.

---

## 5. Баннер акции

Одно поле `image` на весь баннер (модель `Banner` в базе, без отдельного мобильного варианта). На сайте картинка — притемнённая подложка на всю карточку: рисуется на 60% непрозрачности поверх заливки `bg`, текст (заголовок, подзаголовок, промокод) всегда прижат к низу поверх неё, белым/светлым. Контейнер — фиксированная высота 160px, резиновая ширина от ~320px на телефоне до 440px на широком экране: реальное соотношение сторон плавает от ~2:1 до ~2.75:1, единого «десктоп + телефон» не нужно — файл один и тот же, просто по-разному обрезается по ширине.

### IMG-12 — баннер акции
Где: карусель баннеров на главной, раздел «Баннеры» в админке · Размер: 1600×700 (≈2,3:1; реально обрежется от 2:1 до 2,75:1 по ширине экрана — держите сюжет ближе к центру)

> Wide banner: a cleaning professional in burnt-orange uniform handing a small potted plant to a smiling client at an apartment doorway, warm welcoming moment, subject and action in the upper two-thirds of the frame, calmer and less detailed in the bottom third where white text will sit over a darkened overlay, panoramic composition, good tonal contrast so the scene still reads once dimmed to 60% opacity.

---

## 6. «Как это работает» — отложено, нет вёрстки

Сейчас это не картинки, а кружок с номером шага и текстом (`bg-ink`, переводы `home.how1`…`how3`) — `<img>` в разметке блока нет вообще. **Не генерировать и не грузить**, пока кто-то не доведёт вёрстку блока до картинок — иначе файлы будет просто негде подключить. Промпты ниже оставлены про запас, размер не проверен кодом (проверять нечем).

### IMG-14 — шаг «выберите услугу»
Размер: 600×600 (1:1, ориентировочно)

> Minimal flat vector illustration, thin lines, two colors (burnt-orange #C2521B and warm cream) on white: a hand tapping a service card on a phone screen, no text, generous white space, centered.

### IMG-15 — шаг «выберите время»
Размер: 600×600 (1:1, ориентировочно)

> Minimal flat vector illustration, same style and palette: a simple calendar with one day highlighted and a small clock, no text, centered, generous white space.

### IMG-16 — шаг «мастер приедет»
Размер: 600×600 (1:1, ориентировочно)

> Minimal flat vector illustration, same style and palette: a front door with a small bag of cleaning tools beside it and a subtle check mark, no text, centered, generous white space.

---

## 7. Логотип и значок приложения — низкий приоритет

`src/app/icon.svg` уже нарисован вручную: сплошная заливка фирменным цветом, дом с рукой белым контуром, 512×512, непрозрачный фон — и уже подключён (`layout.tsx`, `manifest.ts`). Отдельного скрипта, который пересобирал бы PNG 192/512/180 из большого файла, в репозитории нет — сборка иконок значится в открытых критериях приёмки CONTENT-6. Генерировать IMG-17 через ИИ имеет смысл, только если решите заменить сам рисунок — иначе рисованный вариант уже рабочий и трогать его не нужно.

### IMG-17 — знак логотипа (опционально)
Размер: 1024×1024 (1:1), прозрачный фон

> Minimal geometric app icon mark: a simple house silhouette combined with a helping hand, single burnt-orange color (#C2521B) on transparent background, flat vector, thick even strokes, readable at 32 pixels, centered with margin, no text, no gradients.

---

## Порядок работы

1. Утвердить цвет и шрифт (DSN-2) — иначе форму мастеров придётся перегенерировать.
2. Сначала — то, что реально встанет на сайт уже сегодня: разделы 2–5 (категории, карточка услуги, мастера, баннер — 11 файлов). Раздел 7 — по желанию, не блокирует запуск.
3. Разделы 1 и 6 (обложка главной, иллюстрации шагов) — после того как под них появится вёрстка.
4. Сгенерировать 1–2 картинки, посмотреть на сайте на телефоне, поправить промпт, дальше гнать серию.
5. Загрузить через админку, проверить главную на ширине 360 и 1440 пикселей.
