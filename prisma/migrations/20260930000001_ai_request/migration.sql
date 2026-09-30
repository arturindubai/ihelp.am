-- Очередь запросов к ИИ-ассистенту: диспетчер выполняет их через claude -p на подписке (ROUTE-8)
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRequest_status_createdAt_idx" ON "AiRequest"("status", "createdAt");
CREATE INDEX "AiRequest_createdAt_idx" ON "AiRequest"("createdAt");
