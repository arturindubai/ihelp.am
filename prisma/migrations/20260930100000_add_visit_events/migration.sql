-- CreateTable
CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitEvent_visitId_createdAt_idx" ON "VisitEvent"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitEvent_orderId_createdAt_idx" ON "VisitEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "VisitEvent" ADD CONSTRAINT "VisitEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
