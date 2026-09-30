-- SEO-8: открыть английскую версию для индексации
-- 1. Включить en в locales.enabled (переключатель языков в UI)
UPDATE "Setting"
SET value = jsonb_set(value, '{enabled}', '["ru","en"]'::jsonb, false)
WHERE key = 'locales'
  AND NOT (value->'enabled' @> '"en"'::jsonb);

-- 2. Добавить английские переводы к полям контента услуги «regular-cleaning»
--    Условие: заменяем только пустые строки (en=""), чтобы не затирать правки из админки.

-- note.title
UPDATE "Service"
SET content = jsonb_set(content, '{note,title,en}', '"Please note"'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'note'->'title'->>'en', '') = '';

-- note.body
UPDATE "Service"
SET content = jsonb_set(content, '{note,body,en}',
  '"The cleaner works inside only. For cleaning supplies select the ''With our materials'' option."'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'note'->'body'->>'en', '') = '';

-- faq[0].a
UPDATE "Service"
SET content = jsonb_set(content, '{faq,0,a,en}',
  '"Yes. Contact us or choose a different cleaner when rescheduling."'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'faq'->0->'a'->>'en', '') = '';

-- faq[1].a
UPDATE "Service"
SET content = jsonb_set(content, '{faq,1,a,en}',
  '"In your account → My Orders. Free up to 24 hours before the visit."'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'faq'->1->'a'->>'en', '') = '';

-- faq[2].a
UPDATE "Service"
SET content = jsonb_set(content, '{faq,2,a,en}',
  '"All-purpose cleaner, bathroom and glass cleaner, microfiber cloths, sponges."'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'faq'->2->'a'->>'en', '') = '';

-- policy
UPDATE "Service"
SET content = jsonb_set(content, '{policy,en}',
  '"Cancellation and rescheduling are free up to 24 hours before the visit. Pause or cancel the subscription any time in your account."'::jsonb, false)
WHERE slug = 'regular-cleaning'
  AND COALESCE(content->'policy'->>'en', '') = '';

-- 3. infoBody группы «Моющие средства» у услуги regular-cleaning
UPDATE "OptionGroup"
SET "infoBody" = jsonb_set("infoBody", '{en}',
  '"All-purpose surface cleaner, bathroom cleaner, glass cleaner, floor cleaner, microfiber cloths, sponges. The client provides a vacuum and mop."'::jsonb, false)
WHERE "serviceId" = (SELECT id FROM "Service" WHERE slug = 'regular-cleaning' LIMIT 1)
  AND COALESCE("infoBody"->>'en', '') = '';
