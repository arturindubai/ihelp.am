-- DEV-17: Control Center по образцу LIA — триаж, журнал воркеров с логом и токенами, сообщения.
-- Только добавляющая миграция: новые столбцы с пустыми значениями и новая таблица.

-- Триаж карточек
ALTER TABLE "Task" ADD COLUMN "triagedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "triagedBy" TEXT;
ALTER TABLE "Task" ADD COLUMN "triageNote" TEXT;

-- Журнал запусков воркеров
ALTER TABLE "WorkerRun" ADD COLUMN "keys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WorkerRun" ADD COLUMN "log" TEXT;
ALTER TABLE "WorkerRun" ADD COLUMN "tokensIn" INTEGER;
ALTER TABLE "WorkerRun" ADD COLUMN "tokensOut" INTEGER;
ALTER TABLE "WorkerRun" ADD COLUMN "costUsd" DOUBLE PRECISION;
ALTER TABLE "WorkerRun" ADD COLUMN "stopRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkerRun" ADD COLUMN "requestedBy" TEXT;

-- Сообщения Control Center
CREATE TABLE "CcMessage" (
    "id" TEXT NOT NULL,
    "toRole" TEXT NOT NULL,
    "fromAgent" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "taskKey" TEXT,
    "readAt" TIMESTAMP(3),
    "readBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CcMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CcMessage_toRole_readAt_idx" ON "CcMessage"("toRole", "readAt");
CREATE INDEX "CcMessage_createdAt_idx" ON "CcMessage"("createdAt");
