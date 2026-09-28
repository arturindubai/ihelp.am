-- Следующие шаги после приёмки и флаг «работа не потребовалась»
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "next_steps" TEXT[] DEFAULT '{}';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "no_work" BOOLEAN NOT NULL DEFAULT false;
