-- ADMIN-5: баннеры — место размещения, тип, расписание, аудитория, счётчики
-- Аддитивная миграция: новые поля с дефолтами; существующие баннеры получают placement=CAROUSEL_HOME
ALTER TABLE "Banner" ADD COLUMN "placement"  TEXT NOT NULL DEFAULT 'CAROUSEL_HOME';
ALTER TABLE "Banner" ADD COLUMN "bannerType" TEXT NOT NULL DEFAULT 'PROMO';
ALTER TABLE "Banner" ADD COLUMN "startsAt"   TIMESTAMP(3);
ALTER TABLE "Banner" ADD COLUMN "endsAt"     TIMESTAMP(3);
ALTER TABLE "Banner" ADD COLUMN "audience"   TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "Banner" ADD COLUMN "segment"    TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "Banner" ADD COLUMN "views"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Banner" ADD COLUMN "clicks"     INTEGER NOT NULL DEFAULT 0;
