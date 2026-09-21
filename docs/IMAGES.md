# Изображения iHelp: что сгенерировать и какими промптами

Все картинки на сайте сейчас — временные схематичные SVG-заглушки. Здесь список того, что нужно сгенерировать, с отдельным промптом на каждую картинку. Задача в бэклоге — DSN-3.

## Как пользоваться

1. К каждому промпту спереди добавляйте **общий стиль** (ниже) — тогда картинки будут выглядеть одной серией, а не набором из разных банков.
2. Генерируйте в указанном размере. Если модель не умеет произвольный размер — берите ближайшие пропорции и кадрируйте.
3. Загружайте через админку: Услуги и категории — в карточке, обложку и баннеры — в разделе «Баннеры», мастеров — в карточке мастера. Ничего через сервер класть не нужно.
4. Один и тот же `seed` для всей серии (если модель поддерживает) даёт более ровный результат.

**Общий стиль** (добавлять к каждому промпту):

> Photorealistic editorial photography, natural daylight from a window, warm and clean interior of a modern Armenian apartment in Yerevan, soft shadows, shallow depth of field, calm and friendly mood, muted natural colors with one teal accent, no text, no logos, no watermarks.

**Отрицательный промпт** (тоже к каждому):

> text, letters, watermark, logo, brand names, distorted hands, extra fingers, cluttered background, harsh flash, oversaturated colors, stock-photo smiling into camera, plastic skin, collage, frame, border

**Обязательные требования**

- **Без текста на картинке.** Сайт на трёх языках — вшитый текст не переведётся.
- Люди разного возраста, внешность — местная, не глянцевые модели.
- Форма мастера — однотонная, в фирменном цвете (DSN-2). Сначала утвердите цвет, потом генерируйте людей.
- Интерьеры — ереванские квартиры: балконы, высокие окна, простая мебель. Не американские загородные дома.
- Вес после загрузки — до 300 КБ (уменьшение при загрузке делает AUD-1).

---

## 1. Обложка главной страницы

Нужны два кадра одного сюжета — горизонтальный для компьютера и вертикальный для телефона. Композиция: свободное место слева или сверху под заголовок и кнопку.

### IMG-01 — обложка, компьютер
Где: первый экран главной · Размер: 1920×1080 (16:9)

> A friendly home-service professional in a plain teal uniform polo finishing cleaning a bright living room, standing right of center, looking down at their work, large window with Yerevan rooftops softly blurred behind, empty uncluttered space on the left third of the frame for a headline, wide horizontal composition.

### IMG-02 — обложка, телефон
Где: первый экран главной на мобильных · Размер: 1080×1350 (4:5)

> Vertical crop of the same scene: a home-service professional in a plain teal uniform polo cleaning a bright living room, subject in the lower half, empty calm space in the upper third for a headline, window light from the left, portrait composition.

---

## 2. Плитки категорий

Одинаковые пропорции — иначе плитки на главной прыгают. Предмет в центре, фон спокойный.

### IMG-03 — Уборка
Где: категория `cleaning` · Размер: 800×600 (4:3)

> Close-up of hands in light gloves wiping a kitchen countertop with a microfiber cloth, clean modern kitchen softly out of focus behind, morning light, square-ish composition centered on the action.

### IMG-04 — Генеральная уборка
Где: категория `deep-cleaning` · Размер: 800×600 (4:3)

> A cleaning professional in teal uniform cleaning inside an oven and kitchen cabinets, detailed deep-cleaning work, buckets and brushes neatly arranged nearby, bright kitchen, focused working mood.

### IMG-05 — Химчистка мебели
Где: категория `upholstery` · Размер: 800×600 (4:3)

> Upholstery cleaning of a light fabric sofa with a professional extraction machine, visible clean stripe on the fabric, living room in soft daylight, close three-quarter view.

### IMG-06 — Мастер на час
Где: категория `handyman` · Размер: 800×600 (4:3)

> A handyman in teal uniform mounting a shelf on an apartment wall with a cordless drill, small toolbox open on the floor, calm home interior, natural light.

### IMG-07 — Уборка после ремонта
Где: категория `after-renovation` · Размер: 800×600 (4:3)

> Post-renovation cleaning: a professional vacuuming construction dust in a freshly renovated empty apartment, protective film partly removed from a window, bare walls, bright daylight.

---

## 3. Карточки услуг

По одной на услугу. Сейчас в каталоге заведена одна — остальные появятся вместе с каталогом (DSN-4), промпты добавим тем же шаблоном: сюжет = что именно делает мастер.

### IMG-08 — Регулярная уборка
Где: услуга `regular-cleaning` · Размер: 1200×800 (3:2)

> A tidy living room being finished by a cleaning professional in teal uniform, folded throw on the sofa, fresh flowers on the table, sense of order and calm, wide interior view in daylight.

---

## 4. Мастера

Портреты для блока доверия. Разный возраст и пол, одинаковый фон и свет — карточки стоят рядом.

### IMG-09…IMG-11 — портреты мастеров
Где: карточки мастеров · Размер: 600×600 (1:1), по три варианта

> Friendly portrait of a home-service professional in a plain teal uniform polo, neutral light gray background, soft even studio light, relaxed natural expression, chest-up framing, looking at camera.
>
> Варианты: (а) женщина около 30 лет; (б) мужчина около 45 лет; (в) женщина около 55 лет.

---

## 5. Баннер акции

### IMG-12 — баннер, компьютер
Где: блок акций на главной · Размер: 1200×400 (3:1)

> Wide banner: a cleaning professional in teal uniform handing a small potted plant to a smiling client at an apartment doorway, warm welcoming moment, right half of the frame intentionally empty and calm for promo text, panoramic composition.

### IMG-13 — баннер, телефон
Где: блок акций на телефоне · Размер: 1080×1080 (1:1)

> Square crop of the same doorway scene, subjects in the lower half, calm empty space above for promo text.

---

## 6. «Как это работает»

Три картинки под шаги. Не фотографии, а простые иллюстрации — на телефоне читаются лучше.

### IMG-14 — шаг «выберите услугу»
Размер: 600×600 (1:1)

> Minimal flat vector illustration, thin lines, two colors (teal and warm sand) on white: a hand tapping a service card on a phone screen, no text, generous white space, centered.

### IMG-15 — шаг «выберите время»
Размер: 600×600 (1:1)

> Minimal flat vector illustration, same style and palette: a simple calendar with one day highlighted and a small clock, no text, centered, generous white space.

### IMG-16 — шаг «мастер приедет»
Размер: 600×600 (1:1)

> Minimal flat vector illustration, same style and palette: a front door with a small bag of cleaning tools beside it and a subtle check mark, no text, centered, generous white space.

---

## 7. Логотип и значок приложения

Логотип лучше не генерировать, а нарисовать: он должен читаться в 32 пикселя на вкладке и на значке приложения. Из него собираются иконки 192, 512 и 180 пикселей (скрипт уже есть). Если пробовать генерацией:

### IMG-17 — знак логотипа
Размер: 1024×1024 (1:1), прозрачный фон

> Minimal geometric app icon mark: a simple house silhouette combined with a helping hand, single teal color on transparent background, flat vector, thick even strokes, readable at 32 pixels, centered with margin, no text, no gradients.

---

## Порядок работы

1. Утвердить цвет и шрифт (DSN-2) — иначе форму мастеров придётся перегенерировать.
2. Сгенерировать 1–2 картинки, посмотреть на сайте на телефоне, поправить промпт, дальше гнать серию.
3. Загрузить через админку, проверить главную на ширине 360 и 1440 пикселей.
