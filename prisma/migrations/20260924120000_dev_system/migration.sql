-- Система разработки (DEV-13): аренда с пульсом, сторож, гейты сдачи и готовности, доказательство выкладки.
-- Только добавление колонок; существующие данные не удаляются.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "blockedOn" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "deployedSha" TEXT,
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "proof" TEXT,
ADD COLUMN     "reclaims" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rework" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "session" TEXT,
ADD COLUMN     "staleAt" TIMESTAMP(3);

-- «В работе» без исполнителя и без человека — статус, пришедший из кода бэклога («частично сделано»),
-- а не чья-то работа. С этой версии «В работе» значит одно: задачу держит исполнитель с живой арендой.
-- Переводим такие задачи в «Бэклог» с записью в историю и объяснением в ленте задачи.
-- Задачи с арендой (claimedBy) не трогаем — их разбирает сторож по обычным правилам.
INSERT INTO "TaskEvent" ("id", "taskId", "actor", "field", "from", "to", "createdAt")
SELECT gen_random_uuid()::text, "id", 'system', 'status', 'in_progress', 'backlog', now()
FROM "Task" WHERE "status" = 'in_progress' AND "claimedBy" IS NULL AND "assignee" IS NULL;

INSERT INTO "TaskComment" ("id", "taskId", "kind", "author", "text", "createdAt")
SELECT gen_random_uuid()::text, "id", 'system', 'system',
  'Статус «В работе» был выставлен из кода бэклога без исполнителя: он означал «частично сделано», а не что кто-то работает. '
  || 'С 24.09.2026 «В работе» — только задача, которую держит исполнитель с живой арендой (docs/DEV_SYSTEM.md). '
  || 'Задача переведена в «Бэклог»; что уже сделано — в подробностях. Техдиректор решит, что из неё готово к работе.',
  now()
FROM "Task" WHERE "status" = 'in_progress' AND "claimedBy" IS NULL AND "assignee" IS NULL;

UPDATE "Task" SET "status" = 'backlog', "updatedAt" = now()
WHERE "status" = 'in_progress' AND "claimedBy" IS NULL AND "assignee" IS NULL;
