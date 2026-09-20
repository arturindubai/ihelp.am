-- Control Center: бэклог задач, комментарии и история изменений
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "depends" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "docs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "epic" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "owner" TEXT NOT NULL DEFAULT 'tech',
    "estimate" TEXT,
    "assignee" TEXT,
    "blockedReason" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Task_key_key" ON "Task"("key");
CREATE INDEX "Task_status_priority_idx" ON "Task"("status", "priority");
CREATE INDEX "Task_stage_idx" ON "Task"("stage");
CREATE INDEX "Task_area_idx" ON "Task"("area");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
