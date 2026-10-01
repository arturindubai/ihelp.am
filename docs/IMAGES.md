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
- Форма мастера — однотонная, в фирменном цвете. Сейчас это #C2521B — см. «Про цвет» выше; если DSN-2 утвердит другой, форму придётся перегенерировать.
- Интерьеры — ереванские квартиры: балконы, высокие окна, простая мебель, вид на город. Не американские загородные дома.
- Формат и размер загрузки: JPEG, PNG, WebP или GIF до 12 МБ. Сайт сам проверяет содержимое файла (переименованный не-файл-картинка и SVG отклоняются), поворачивает фото по EXIF, уменьшает до 2000 px по длинной стороне, стирает метаданные (координаты съёмки) и сохраняет как WebP — вес обычно в разы меньше исходного (AUD-1). У GIF берётся первый кадр. Готовить картинку заранее под нужный вес не нужно, но фото чуть больше нужного размера (примерно 1600–2000 px) — оптимально.

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

## 8. Скоро-услуги — миниатюры для thumbnail

Все 30 услуг из `scripts/once/catalog-soon-tree.mjs` имеют `comingSoon=true` и не имеют картинки (`image: null`) — они загружаются через «Услуги» в админке после генерации. Дополнительно: 1 плитка для новой категории «Дезинсекция» (pest-control).

Формат: 800×800 (1:1), генерация 1:1 в 1K, тот же стиль что разделы 2–3. Загружать через «Услуги» → нужная услуга → поле «Изображение».

---

### CAT-pest-control — плитка категории «Дезинсекция»
Категория `pest-control` · 800×800 (1:1)

> Close-up of a gloved professional hand holding a precision applicator and spraying treatment into a gap along an apartment kitchen cabinet base, burnt-orange gloves visible, clean modern kitchen interior softly blurred behind, bright daylight, tight square composition centered on the action.

---

### deep-cleaning-apartment — Генеральная уборка квартиры
Услуга `deep-cleaning-apartment` · 800×800 (1:1)

> A woman in her early 40s with local Armenian appearance, a cleaning professional in a plain burnt-orange uniform polo shirt (no logo, no text), vacuuming under a sofa in a tidy living room, a full cleaning caddy with coloured microfiber cloths visible beside her, late morning apartment light, tight square composition centered on the professional.

### deep-cleaning-furniture — Чистка мягкой мебели
Услуга `deep-cleaning-furniture` · 800×800 (1:1)

> Professional upholstery extraction machine with a burnt-orange body cleaning a light grey fabric sofa, a visible clean stripe next to the still-soiled area, the nozzle in close-up action, apartment living room softly blurred behind, tight square composition.

### deep-cleaning-kitchen — Кухня
Услуга `deep-cleaning-kitchen` · 800×800 (1:1)

> Close-up of a gloved hand scrubbing a gas stove burner grate with a burnt-orange handled brush, gleaming degreased ceramic hob surface visible beside the still-dirty section, bright kitchen daylight, tight square composition centered on the action.

### deep-cleaning-bathroom — Ванная
Услуга `deep-cleaning-bathroom` · 800×800 (1:1)

> Close-up of gloved hands scrubbing tile grout in a bathroom with a narrow stiff brush, shiny clean white tiles surrounding the area being worked on, chrome fixtures gleaming in the background, soft bathroom light, tight square composition.

### deep-cleaning-ac — Чистка кондиционера
Услуга `deep-cleaning-ac` · 800×800 (1:1)

> A technician in a plain burnt-orange uniform polo shirt (no logo, no text) holding a dusty filter removed from a wall-mounted air conditioner unit, the grey filter clearly showing accumulated dust, the open unit on the apartment wall behind, natural light, tight square composition.

### deep-cleaning-balcony — Балкон и лоджия
Услуга `deep-cleaning-balcony` · 800×800 (1:1)

> Close-up of gloved hands scrubbing a balcony tile floor with a burnt-orange handled deck brush, foamy water and a freshly swept clean area visible beside the dirty section, Yerevan rooftops softly blurred through the railing behind, bright daylight, tight square composition.

---

### handyman-electrician — Электрик
Услуга `handyman-electrician` · 800×800 (1:1)

> A man in his late 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), installing a new wall socket in an apartment using a screwdriver, white wall and neat cable visible, focused precise work, natural light, tight square composition.

### handyman-plumber — Сантехник
Услуга `handyman-plumber` · 800×800 (1:1)

> A man in his late 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), tightening a chrome mixer tap under a bathroom sink with an adjustable wrench, pipe and under-sink cabinet visible, natural bathroom light, tight square composition.

### handyman-furniture — Сборка мебели
Услуга `handyman-furniture` · 800×800 (1:1)

> A man in his early 40s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), assembling flat-pack shelving in an apartment room, referring to an instruction sheet on the floor, tools laid out neatly beside the parts, natural light, tight square composition.

### handyman-shelves-tv — Навес полок и ТВ
Услуга `handyman-shelves-tv` · 800×800 (1:1)

> A man in his late 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), securing a flat-screen TV wall bracket to an apartment wall with a cordless drill, a spirit level resting on the bracket, clean white wall, natural light, tight square composition.

---

### moving-apartment — Квартирный переезд
Услуга `moving-apartment` · 800×800 (1:1)

> Two movers with local Armenian appearance in plain burnt-orange uniform polo shirts (no logo, no text), carefully carrying a bubble-wrapped sofa through an open apartment doorway, moving boxes stacked neatly in the hallway behind them, natural light, tight square composition.

### moving-loaders — Грузчики почасово
Услуга `moving-loaders` · 800×800 (1:1)

> A man in his 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), carrying a large sealed cardboard box steadily down a clean apartment staircase, focused steady grip, natural stairwell light, tight square composition.

### moving-packing — Упаковка вещей
Услуга `moving-packing` · 800×800 (1:1)

> Gloved hands in plain burnt-orange uniform carefully wrapping a framed picture in bubble wrap on a wooden apartment floor, rolls of tape and packing paper neatly arranged nearby, apartment interior softly blurred behind, tight square composition centered on the action.

### moving-furniture — Разборка и сборка мебели
Услуга `moving-furniture` · 800×800 (1:1)

> A man in his late 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), disassembling a bed frame with a cordless screwdriver, hardware neatly sorted into small labelled bags on the floor beside him, bright apartment bedroom, tight square composition.

---

### chef-day — Повар на день
Услуга `chef-day` · 800×800 (1:1)

> A woman in her 40s with local Armenian appearance, in a plain burnt-orange chef apron (no logo, no text), stirring a pot on a home kitchen stove, fresh vegetables and herbs arranged on the countertop, warm kitchen light, tight square composition centered on the cook.

### chef-event — Повар на мероприятие
Услуга `chef-event` · 800×800 (1:1)

> A chef in a plain burnt-orange apron (no logo, no text), arranging a platter of appetisers on a dining table set for a celebration, warm home interior, flowers and tableware softly blurred in the background, tight square composition centered on the platter.

### chef-prep — Заготовки на неделю
Услуга `chef-prep` · 800×800 (1:1)

> Overhead tight shot of hands in a plain burnt-orange apron portioning cooked dishes into a row of clear glass meal-prep containers on a kitchen counter, an organised weekly set being filled with colourful food, tight square composition.

---

### massage-classic — Классический массаж
Услуга `massage-classic` · 800×800 (1:1)

> A massage therapist in a plain burnt-orange uniform polo shirt (no logo, no text), performing a back massage on a client lying face-down on a portable massage table set up in a tidy apartment room, soft warm natural light, calm and restful atmosphere, tight square composition.

### massage-relaxing — Расслабляющий массаж
Услуга `massage-relaxing` · 800×800 (1:1)

> Close-up of a massage therapist's hands gently pouring aromatic oil from a small dark bottle onto a client's shoulder, a neatly folded burnt-orange towel draped across the client, soft warm apartment room light behind, tight square composition.

### massage-sport — Спортивный массаж
Услуга `massage-sport` · 800×800 (1:1)

> A massage therapist in a plain burnt-orange uniform polo shirt (no logo, no text), using both thumbs to apply deep pressure to a client's calf muscle on a portable massage table, focused therapeutic work, bright apartment room with natural light, tight square composition.

---

### dry-cleaning-clothes — Одежда с доставкой
Услуга `dry-cleaning-clothes` · 800×800 (1:1)

> A delivery person in a plain burnt-orange uniform polo shirt (no logo, no text), carrying a neat set of freshly dry-cleaned clothes in transparent garment bags on hangers to an apartment door, bright entrance hallway, tight square composition.

### dry-cleaning-carpet — Ковры
Услуга `dry-cleaning-carpet` · 800×800 (1:1)

> A professional in a plain burnt-orange uniform polo shirt (no logo, no text), rolling up a freshly cleaned colourful traditional rug on a bright apartment floor, clean restored fibres visible, natural light, tight square composition.

### dry-cleaning-curtains — Шторы
Услуга `dry-cleaning-curtains` · 800×800 (1:1)

> Close-up of gloved hands unclipping clean pressed curtains from a drying rack, fabric bright and wrinkle-free, apartment window with soft daylight visible behind, tight square composition.

### dry-cleaning-ironing — Глажка
Услуга `dry-cleaning-ironing` · 800×800 (1:1)

> Close-up of a steam iron with a burnt-orange accent gliding over a crisp white dress shirt on an ironing board, a fine jet of steam rising, perfectly pressed collar visible in the frame, warm apartment light, tight square composition.

---

### after-renovation-cleaning — Уборка после ремонта
Услуга `after-renovation-cleaning` · 800×800 (1:1)

> A professional in a plain burnt-orange uniform polo shirt (no logo, no text), wiping white construction dust from a newly painted windowsill with a damp microfiber cloth, protective film partly peeled from the floor beneath, bare freshly painted walls, bright daylight, tight square composition.

---

### cleaning-part-time — Помощница на часть дня
Услуга `cleaning-part-time` · 800×800 (1:1)

> A woman in her 30s with local Armenian appearance, in a plain burnt-orange uniform polo shirt (no logo, no text), washing dishes at a kitchen sink with bright morning light coming through the window, a tidy counter and a small vase of flowers on the windowsill visible behind, tight square composition.

---

### pest-control-cockroaches — Тараканы
Услуга `pest-control-cockroaches` · 800×800 (1:1)

> Close-up of a gloved professional hand applying pest treatment along a kitchen cabinet base gap with a fine-tipped applicator, burnt-orange gloves visible, clean modern kitchen interior softly blurred behind, bright daylight, tight square composition centered on the applicator tip.

### pest-control-bedbugs — Клопы
Услуга `pest-control-bedbugs` · 800×800 (1:1)

> A pest-control professional in a plain burnt-orange uniform polo shirt (no logo, no text) and a light protective mask, applying treatment along the seam of a white mattress with a professional canister, clean apartment bedroom, natural light, tight square composition.

### pest-control-ants — Муравьи
Услуга `pest-control-ants` · 800×800 (1:1)

> Close-up of a gloved hand placing a small professional bait station along an apartment baseboard, clean skirting board and light tiled floor visible, soft natural daylight, tight square composition centered on the bait station.

### pest-control-rodents — Грызуны
Услуга `pest-control-rodents` · 800×800 (1:1)

> A pest-control professional in a plain burnt-orange uniform polo shirt (no logo, no text), inspecting a corner of an apartment utility room with a small torch, a sealed professional equipment case set down beside them, clean interior, tight square composition.

---

## Что осталось

1. **Утвердить цвет и шрифт (DSN-2).** Если палитра изменится — перегенерировать только фото с людьми (форма мастеров: плитки 04–07 и 08, портреты, баннер, обложки); иллюстрации и знак перекрашиваются.
2. **Обложка главной (IMG-01/02)** — подключить, когда в вёрстке появится блок-обложка (DSN-1).
3. **Иллюстрации шагов (IMG-14…16)** — подключить, когда блок «как это работает» получит картинки.
4. **Знак (IMG-17)** — решить вместе с CONTENT-6 (иконки приложения): оставить рисованный или перейти на него.
5. **Мужской портрет** — поставить, когда появится мастер-мужчина; настоящие фото мастеров (CONTENT-1) заменят все три.
6. Каталог (DSN-4): по мере появления услуг добавлять пары картинок (миниатюра 1:1 + шапка 16:9) по шаблону раздела 3.
