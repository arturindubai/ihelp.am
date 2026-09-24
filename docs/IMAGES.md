# Изображения iHelp: что сгенерировано и какими промптами

**Статус на 24.09.2026:** 11 картинок сгенерированы в Higgsfield (Nano Banana Pro), обработаны и загружены через админку — они уже видны на сайте. Ещё 7 файлов сгенерированы и лежат на сервере, но подключить их пока некуда (в вёрстке нет места) — список и адреса ниже. Задача в бэклоге — DSN-3.

Ниже: что и где стоит, как это делалось, единый стиль и **точные промпты, по которым получены картинки** (чтобы перегенерировать в том же стиле).

## Что где стоит

Все файлы — WebP (кроме знака) и не тяжелее 250 КБ; лимит сайта — 300 КБ.

| Картинка | Где на сайте | Размер, вес |
|---|---|---|
| IMG-03 — Уборка | категория `cleaning`, «Изображение» | 800×800, 73 КБ |
| IMG-04 — Генеральная уборка | категория `deep-cleaning` | 800×800, 95 КБ |
| IMG-05 — Химчистка мебели | категория `upholstery` | 800×800, 93 КБ |
| IMG-06 — Мастер на час | категория `handyman` | 800×800, 81 КБ |
| IMG-07 — Уборка после ремонта | категория `after-renovation` | 800×800, 73 КБ |
| IMG-08a — Регулярная уборка, миниатюра | услуга `regular-cleaning`, «Изображение» (список на главной) | 800×800, 123 КБ |
| IMG-08b — Регулярная уборка, шапка | услуга `regular-cleaning`, «Баннер услуги» | 1600×900, 244 КБ |
| IMG-09…11 — портреты | мастера: **Мариам** — женщина ~30, **Анна** — женщина ~38, **Лусине** — женщина ~55 (чем больше стаж, тем старше) | 600×600, 45–62 КБ |
| IMG-12 — баннер акции | баннер «−25% на первый визит» | 1584×672, 90 КБ |

**Загружены на сервер, но нигде не подключены** (адреса — на сайте, файлы лежат в томе загрузок):

| Картинка | Адрес | Размер, вес | Почему не подключена |
|---|---|---|---|
| IMG-01 — обложка, компьютер | `/uploads/2026-09/082963d1e24862b9.webp` | 1920×1080, 157 КБ | на главной нет блока-обложки (ждёт DSN-1) |
| IMG-02 — обложка, телефон | `/uploads/2026-09/45f44bf1baf97636.webp` | 1080×1350, 114 КБ | то же |
| IMG-14 — шаг «выберите услугу» | `/uploads/2026-09/87934b0b2614f34f.webp` | 600×600, 13 КБ | шаги «как это работает» — кружок с цифрой, картинок в вёрстке нет |
| IMG-15 — шаг «выберите время» | `/uploads/2026-09/24edb6bd195257e7.webp` | 600×600, 6 КБ | то же |
| IMG-16 — шаг «мастер приедет» | `/uploads/2026-09/8a43e4e988b7e7b0.webp` | 600×600, 7 КБ | то же |
| IMG-17 — знак логотипа | `/uploads/2026-09/7f23ff2d14a5283d.png` | 1024×1024, прозрачный фон, 22 КБ | текущий `icon.svg` нарисован вручную и работает; замена — решение владельца (CONTENT-6) |
| мужской портрет ~45 (запасной) | `/uploads/2026-09/f35cb024df715614.webp` | 600×600, 35 КБ | все три демо-мастера — с женскими именами; пригодится, когда появится мастер-мужчина |

Осторожно с AUD-2 (уборка неиспользуемых файлов): пока эти файлы ни на что не ссылаются, такая уборка сочла бы их лишними — до подключения их лучше не трогать и не запускать уборку, либо перезагрузить.

Отдельного квадрата для баннера на телефоне (IMG-13) не нужно: в базе у баннера одно поле картинки, на телефоне тот же файл просто обрезается уже.

## Как это делалось

1. **Генерация.** Higgsfield → Image → модель **Nano Banana Pro** (2 кредита за картинку в 1K и в 2K). Пропорции — селектором (1:1, 16:9, 4:5, 21:9), по 2 варианта на промпт, лучший выбран вручную. Одновременно идёт до 4 генераций, остальные ждут в очереди.
2. **Негативный промпт.** В Higgsfield отдельного поля нет, поэтому запреты дописаны в конец каждого промпта фразой `Avoid: …` (ниже).
3. **Оригиналы.** В карточке картинки «⋯ → Copy image URL» даёт прямую ссылку на исходный PNG в CDN (без подписи) — сервер скачивает его обычным `curl`. Оригиналы остаются и в аккаунте Higgsfield (Assets).
4. **Обработка** (Python + Pillow): обрезка под нужные пропорции, где надо — плотнее вокруг героя (иконка 76 пикселей читается лучше), ресайз без увеличения, WebP качества ~92; баннер чуть осветлён; знак — чистый альфа-канал и точный цвет `#C2521B`.
5. **Загрузка** через админку: Услуги → категория / услуга, Мастера, Баннеры. Картинки без места в вёрстке залиты через то же поле загрузки без сохранения записи.

Разрешения Higgsfield: 1:1 в 1K — плитки, миниатюра услуги, портреты; 21:9 в 1K — баннер (1584×672); 16:9 и 4:5 в 2K — шапка услуги и обложки; 1:1 в 2K — иллюстрации и знак.

## Единый стиль

**Общий стиль интерьерных фото** (спереди к каждому промпту):

> Photorealistic editorial photography, natural daylight from a window, warm and clean interior of a modern Armenian apartment in Yerevan, soft shadows, shallow depth of field, calm and friendly mood, muted natural colors with one warm burnt-orange (terracotta, hex #C2521B) accent, no text, no logos, no watermarks.

**Форма мастера** во всех промптах одна и та же: `a plain burnt-orange uniform polo shirt (no logo, no text)`. Люди — разного возраста и пола, с местной внешностью: `with local Armenian appearance`.

**Запреты** (в конец каждого фото-промпта):

> Avoid: text, letters, watermark, logo, brand names, distorted hands, extra fingers, cluttered background, harsh flash, oversaturated colors, plastic skin, collage, frame, border.

Для портретов вместо интерьерного стиля — студийный (см. раздел 4), для иллюстраций и знака — свой (разделы 6–7): фото-стиль к векторным картинкам не подходит.

**Про цвет.** Акцент — действующий токен `--color-brand` (`#C2521B`, тёплый терракотово-рыжий) из `theme.css`: он уже везде на сайте — кнопки, рейтинг, активные пункты меню, превью-картинка ссылок. DSN-2 ещё не утвердила финальную палитру iHelp (текущий цвет — «прежний», от старого бренда), поэтому это рабочее приближение. Если DSN-2 выберет другой цвет — фото с формой мастеров (люди) придётся перегенерировать; иллюстрации шагов и знак можно перекрасить в редакторе.

**Обязательные требования**

- **Без текста на картинке.** Сайт на трёх языках — вшитый текст не переведётся.
- Люди разного возраста, внешность — местная, не глянцевые модели.
- Интерьеры — ереванские квартиры: балконы, высокие окна, простая мебель, вид на город. Не американские загородные дома.
- Вес после загрузки — до 300 КБ (автоматическое уменьшение при загрузке — AUD-1, пока не сделано: сжимайте до загрузки).

---

## 1. Обложка главной страницы — загружена, не подключена

Обложки в коде сейчас нет: страница начинается сразу с заголовка (`src/app/[locale]/(site)/page.tsx`). Кадры лежат на сервере (адреса — в таблице выше) и ждут редизайна главной (DSN-1). Композиция: свободное место слева или сверху под заголовок и кнопку.

### IMG-01 — обложка, компьютер
Размер: 1920×1080 (16:9), генерация 16:9 в 2K

> A friendly woman in her mid 30s with local Armenian appearance, a home-service professional in a plain burnt-orange uniform polo (no logo, no text), finishing cleaning a bright living room, standing right of center, looking down at her work, large window with Yerevan rooftops softly blurred behind, empty uncluttered space on the left third of the frame for a headline, wide horizontal composition.

### IMG-02 — обложка, телефон
Размер: 1080×1350 (4:5), генерация 4:5 в 2K

> Vertical portrait composition of a friendly woman in her mid 30s with local Armenian appearance, a home-service professional in a plain burnt-orange uniform polo (no logo, no text), finishing cleaning a bright living room, subject in the lower half of the frame, empty calm space in the upper third for a headline, window light from the left, large window with Yerevan rooftops softly blurred behind.

---

## 2. Плитки категорий — на сайте

Одинаковые пропорции — иначе плитки на главной прыгают. Сейчас это маленькая квадратная иконка 76×76 (`size-[76px] rounded-2xl`, `page.tsx:47`) — кадры 1:1 без лишних мелочей по краям; IMG-04 и IMG-07 обрезаны плотнее вокруг героя.

### IMG-03 — Уборка
Категория `cleaning` · 800×800 (1:1)

> Close-up of hands in light gloves wiping a kitchen countertop with a burnt-orange microfiber cloth, clean modern kitchen softly out of focus behind, morning light, tight square composition centered on the action.

### IMG-04 — Генеральная уборка
Категория `deep-cleaning` · 800×800 (1:1)

> A woman in her early 40s with local Armenian appearance, a cleaning professional in a plain burnt-orange uniform polo shirt (no logo, no text), cleaning inside an open oven with a brush and cloth, kitchen cabinet doors open beside her, detailed deep-cleaning work, buckets and brushes neatly arranged nearby, bright kitchen, focused working mood, tight square composition.

### IMG-05 — Химчистка мебели
Категория `upholstery` · 800×800 (1:1)

> Upholstery cleaning of a light fabric sofa with a professional extraction machine that has a burnt-orange body, a professional in a plain burnt-orange uniform polo (no logo, no text) holding the nozzle, a visible clean stripe on the fabric next to the still-dirty part, living room in soft daylight, close three-quarter view, tight square composition.

### IMG-06 — Мастер на час
Категория `handyman` · 800×800 (1:1)

> A handyman, a man in his late 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), mounting a wooden shelf on an apartment wall with a cordless drill, a small toolbox open on the floor, calm home interior, natural light, tight square composition.

### IMG-07 — Уборка после ремонта
Категория `after-renovation` · 800×800 (1:1)

> Post-renovation cleaning: a professional in a plain burnt-orange uniform polo (no logo, no text) vacuuming construction dust from the floor in a freshly renovated empty apartment, protective film partly removed from a window, bare freshly painted walls, bright daylight, tight square composition.

---

## 3. Карточки услуг — на сайте

По одной паре на услугу — список и шапка страницы используют разные поля в базе (`image` и `bannerImage`, оба редактируются в карточке услуги). Сейчас в каталоге одна услуга — остальные появятся вместе с каталогом (DSN-4), промпты добавим тем же шаблоном: сюжет = что именно делает мастер.

### IMG-08a — Регулярная уборка, миниатюра в списке
Поле «Изображение» (`ServiceCard.tsx:11`) · 800×800 (1:1), кадр обрезан плотнее вокруг мастера

> A tidy living room being finished by a woman in her early 30s with local Armenian appearance, a cleaning professional in a plain burnt-orange uniform polo (no logo, no text), straightening a cushion on the sofa, folded throw on the sofa, fresh flowers on the table, sense of order and calm, tight square composition centered on the professional.

### IMG-08b — Регулярная уборка, шапка страницы услуги
Поле «Баннер услуги» (`s/[slug]/page.tsx:35`) · 1600×900 (16:9), генерация 16:9 в 2K

> Wide shot of a tidy living room being finished by a woman in her early 30s with local Armenian appearance, a cleaning professional in a plain burnt-orange uniform polo (no logo, no text), straightening a cushion on the sofa, folded throw on the sofa, fresh flowers on the coffee table, sense of order and calm, large windows with soft daylight, wide horizontal composition filling the frame edge to edge.

---

## 4. Мастера — на сайте

Портреты для карточки мастера и карусели «мастера» под услугой. Фото показывается как круглый аватар 44–96 пикселей — поэтому кадр плотный: голова и плечи по центру, лицо крупно. Одинаковые фон и свет — карточки стоят рядом.

Сейчас в базе три демо-мастера — Анна (стаж 5 лет), Мариам (3), Лусине (7): все женские имена. Поэтому на карточки поставлены три женских портрета разного возраста, а мужской (б) сгенерирован и лежит про запас. CONTENT-1 (реальные мастера вместо демо) ещё не сделана — настоящие фото заменят эти.

**Студийный стиль** (вместо интерьерного):

> Photorealistic editorial portrait photography, soft even studio light, neutral light gray seamless background, shallow depth of field, calm and friendly mood, muted natural colors with one warm burnt-orange (terracotta, hex #C2521B) accent, no text, no logos, no watermarks.

### IMG-09…IMG-11 — портреты мастеров
600×600 (1:1), три варианта

> Friendly portrait of {a woman about 30 years old | a man about 45 years old | a woman about 55 years old} with local Armenian appearance, a home-service professional in a plain burnt-orange uniform polo shirt (no logo, no text), relaxed natural expression, chest-up framing, centered, looking at camera, generous margin around head and shoulders so a circular crop does not cut the face.

Запреты для портретов: `Avoid: text, letters, watermark, logo, brand names, distorted hands, cluttered background, harsh flash, oversaturated colors, plastic skin, retouched glossy look, collage, frame, border.`

---

## 5. Баннер акции — на сайте

Одно поле `image` на весь баннер (модель `Banner`, без отдельного мобильного варианта). На сайте картинка — притемнённая подложка на всю карточку: рисуется на 60% непрозрачности поверх заливки `bg` (сейчас тёмная `#1c1917`), текст всегда прижат к низу, светлым. Контейнер — высота 160 пикселей, ширина от ~320 до 440: реальное соотношение сторон плавает от ~2:1 до ~2,75:1, файл один и тот же, по-разному обрезается по ширине.

Если баннер покажется тёмным — поменяйте цвет фона в админке (Баннеры → «Цвет фона»): светлее или брендовый `#C2521B`; картинка при 60% непрозрачности подкрасится им.

### IMG-12 — баннер акции
Размер: 1584×672 (21:9, ≈2,36:1), генерация 21:9 в 1K; в файле кадр чуть осветлён

> Wide panoramic banner: a man in his 40s with local Armenian appearance, a cleaning professional in a plain burnt-orange uniform polo (no logo, no text), handing a small potted plant to a smiling elderly woman client at an apartment doorway, warm welcoming moment, subject and action in the upper two-thirds of the frame, calmer and less detailed in the bottom third where white text will sit over a darkened overlay, panoramic composition, good tonal contrast so the scene still reads once dimmed.

Внимание при повторной генерации: у Nano Banana Pro в широком 21:9 часть вариантов получается «склеенной» — резкий шов в нижней трети. Такие варианты не брать (один из двух в этой серии был со швом).

---

## 6. «Как это работает» — загружены, не подключены

Сейчас это не картинки, а кружок с номером шага (`bg-ink`) и текстом — `<img>` в блоке нет. Три иллюстрации лежат на сервере и ждут доработки вёрстки. Свой стиль — векторный, две краски: терракотовый `#C2521B` и тёплый кремовый на белом. На белом фоне, не прозрачные (на бежевой подложке секции `bg-surface` белый квадрат будет виден — нужна прозрачность или подложка в цвет).

Первая попытка IMG-14 вышла «про оплату картой» (карточка с чипом и полоской) — промпт уточнён словами `service cards` с иконками и запретом `payment card, credit card`.

### IMG-14 — шаг «выберите услугу»
600×600 (1:1), генерация 1:1 в 2K

> Minimal flat vector illustration set style: thin terracotta line art (#C2521B) with warm cream fills on a plain white background. A smartphone showing a vertical list of three simple rounded service cards, each card has a tiny broom, sparkle or wrench icon and no text, a hand with one finger tapping the middle card, generous white space, centered. Avoid: text, letters, numbers, payment card, credit card, contactless symbol, gradients, shadows, photo-realism, extra colors.

### IMG-15 — шаг «выберите время»
600×600 (1:1)

> Minimal flat vector illustration, same style and palette (thin lines, two colors only: burnt-orange #C2521B and warm cream on a plain white background): a simple calendar with one day highlighted and a small clock, no text, no letters, no numbers, generous white space, centered. Avoid: text, letters, numbers, gradients, shadows, photo-realism, extra colors.

### IMG-16 — шаг «мастер приедет»
600×600 (1:1)

> Minimal flat vector illustration, same style and palette (thin lines, two colors only: burnt-orange #C2521B and warm cream on a plain white background): a front door with a small bag of cleaning tools beside it and a subtle check mark, no text, no letters, generous white space, centered. Avoid: text, letters, numbers, gradients, shadows, photo-realism, extra colors.

---

## 7. Логотип и значок приложения — загружен, не подключён

`src/app/icon.svg` уже нарисован вручную: сплошная заливка фирменным цветом, дом с рукой белым контуром, 512×512, непрозрачный фон — и подключён (`layout.tsx`, `manifest.ts`). Отдельного скрипта, который пересобирал бы PNG 192/512/180 из большого файла, в репозитории нет — сборка иконок значится в открытых критериях CONTENT-6.

Сгенерированный знак — дом с трубой на раскрытой ладони, один цвет, плотные линии, читается в 32 пикселя. Фон сделан прозрачным (белый убран, цвет — точный `#C2521B`). Это вариант на выбор владельца: подключать ли его вместо рисованного — решение по CONTENT-6, файл ничего не заменяет сам.

### IMG-17 — знак логотипа
1024×1024 (1:1), прозрачный PNG, генерация 1:1 в 2K

> Minimal geometric app icon mark: a simple house silhouette combined with a helping hand, single burnt-orange color (#C2521B) on a plain white background, flat vector, thick even strokes, readable at 32 pixels, centered with generous margin, no text, no gradients. Avoid: text, letters, gradients, shadows, 3D, extra colors, photo-realism.

---

## Что осталось

1. **Утвердить цвет и шрифт (DSN-2).** Если палитра изменится — перегенерировать только фото с людьми (форма мастеров: плитки 04–07 и 08, портреты, баннер, обложки); иллюстрации и знак перекрашиваются.
2. **Обложка главной (IMG-01/02)** — подключить, когда в вёрстке появится блок-обложка (DSN-1).
3. **Иллюстрации шагов (IMG-14…16)** — подключить, когда блок «как это работает» получит картинки.
4. **Знак (IMG-17)** — решить вместе с CONTENT-6 (иконки приложения): оставить рисованный или перейти на него.
5. **Мужской портрет** — поставить, когда появится мастер-мужчина; настоящие фото мастеров (CONTENT-1) заменят все три.
6. Пока не сделана AUD-1, сжимайте картинки до загрузки (WebP, до 300 КБ).
7. Каталог (DSN-4): по мере появления услуг добавлять пары картинок (миниатюра 1:1 + шапка 16:9) по шаблону раздела 3.
