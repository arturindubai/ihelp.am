-- Ключ родительской задачи: часть → родитель. Родитель с открытыми частями в работу не берётся;
-- при закрытии последней части родитель закрывается автоматически.
-- DEV-56: Зонтик и части, статус эпика из задач, файлы переводов не запирают очередь

ALTER TABLE "Task" ADD COLUMN "parentKey" TEXT;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_parentKey_fkey"
  FOREIGN KEY ("parentKey") REFERENCES "Task"("key")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_parentKey_idx" ON "Task"("parentKey");
