-- ADMIN-3: мягкий архив категорий и признак «скоро» для услуг
-- Аддитивная миграция, данные не удаляются, существующие строки получают false
ALTER TABLE "Category" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN "comingSoon" BOOLEAN NOT NULL DEFAULT false;
