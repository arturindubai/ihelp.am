-- Очередь уведомлений с повторными попытками при сбое канала доставки
CREATE TABLE "NotifyQueue" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifyQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotifyQueue_status_nextAttemptAt_idx" ON "NotifyQueue"("status", "nextAttemptAt");
CREATE INDEX "NotifyQueue_createdAt_idx" ON "NotifyQueue"("createdAt");
