-- Таблица заявок «Уведомить меня» для категорий-заглушек
CREATE TABLE "service_interest" (
    "id" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_interest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_interest_serviceSlug_contact_key" ON "service_interest"("serviceSlug", "contact");
CREATE INDEX "service_interest_serviceSlug_idx" ON "service_interest"("serviceSlug");

-- 4 новые категории-заглушки «Скоро»
INSERT INTO "Category" ("id", "slug", "title", "image", "sort", "active", "comingSoon", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'chef',        '{"ru":"Повар на дом","en":"Personal chef","am":""}',           '/img/cat-chef.svg',     6, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'massage',     '{"ru":"Массаж на дом","en":"Home massage","am":""}',            '/img/cat-massage.svg',  7, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'moving',      '{"ru":"Грузчики и переезды","en":"Moving services","am":""}',   '/img/cat-moving.svg',   8, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'dry-cleaning','{"ru":"Химчистка","en":"Dry cleaning","am":""}',                '/img/cat-dry.svg',      9, true, true, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
