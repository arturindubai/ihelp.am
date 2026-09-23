-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deployNotes" TEXT,
ADD COLUMN     "design" TEXT,
ADD COLUMN     "epicKey" TEXT,
ADD COLUMN     "qaNotes" TEXT,
ALTER COLUMN "epic" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "design" TEXT,
    "techNotes" TEXT,
    "testingNotes" TEXT,
    "deployNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "depends" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "docs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'code',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "epicKey" TEXT,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Epic_key_key" ON "Epic"("key");

-- CreateIndex
CREATE INDEX "Epic_status_idx" ON "Epic"("status");

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_epicKey_idx" ON "Attachment"("epicKey");

-- CreateIndex
CREATE INDEX "Task_epicKey_idx" ON "Task"("epicKey");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicKey_fkey" FOREIGN KEY ("epicKey") REFERENCES "Epic"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_epicKey_fkey" FOREIGN KEY ("epicKey") REFERENCES "Epic"("key") ON DELETE CASCADE ON UPDATE CASCADE;
