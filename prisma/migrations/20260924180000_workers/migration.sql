-- Воркеры (DEV-6): отметка тестировщика о проверенном коммите и журнал запусков воркеров.
-- Только добавление: существующие данные не меняются.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "testedAt" TIMESTAMP(3),
ADD COLUMN     "testedBy" TEXT,
ADD COLUMN     "testedSha" TEXT;

-- CreateTable
CREATE TABLE "WorkerRun" (
    "id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "taskKey" TEXT,
    "unit" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "summary" TEXT,
    "turns" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkerRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerRun_status_idx" ON "WorkerRun"("status");

-- CreateIndex
CREATE INDEX "WorkerRun_startedAt_idx" ON "WorkerRun"("startedAt");
