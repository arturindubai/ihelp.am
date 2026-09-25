-- DEV-14: Журнал ошибок приложения в Control Center. Только добавляющая миграция: одна новая таблица.

CREATE TABLE "AppError" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskKey" TEXT,

    CONSTRAINT "AppError_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppError_key_key" ON "AppError"("key");
CREATE INDEX "AppError_lastSeenAt_idx" ON "AppError"("lastSeenAt");
