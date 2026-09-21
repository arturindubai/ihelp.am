-- Источник задачи: code — тексты из репозитория, ui — задача создана или изменена в админке
ALTER TABLE "Task" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'code';
ALTER TABLE "Task" ADD COLUMN "createdBy" TEXT;
