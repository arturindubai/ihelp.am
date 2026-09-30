-- CreateTable
CREATE TABLE "PriceAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "optionId" TEXT NOT NULL,
    "optionTitle" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceTitle" TEXT NOT NULL,
    "oldPrice" INTEGER NOT NULL,
    "newPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceAudit_serviceId_createdAt_idx" ON "PriceAudit"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceAudit_createdAt_idx" ON "PriceAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "PriceAudit" ADD CONSTRAINT "PriceAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
