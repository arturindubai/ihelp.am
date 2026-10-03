-- BUG-40: пометить демо-мастеров флагом isDemo, чтобы скрыть их из sitemap и публичных блоков
ALTER TABLE "Master" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- отмечаем мастеров, чьё bio ru-языка содержит служебную фразу из seed
UPDATE "Master" SET "isDemo" = true
WHERE ("bio"->>'ru') LIKE '%Замените фото%';
