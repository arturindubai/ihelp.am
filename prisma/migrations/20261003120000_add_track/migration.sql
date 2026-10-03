-- Дорожка бэклога: явное поле track у задачи и эпика.
-- После миграции однократный скрипт scripts/once/set-tracks.mjs расставит значения по правилу.
ALTER TABLE "Task" ADD COLUMN "track" TEXT;
ALTER TABLE "Epic" ADD COLUMN "track" TEXT;
