-- CreateTable
CREATE TABLE "CategorySection" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorySection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorySection_categoryId_idx" ON "CategorySection"("categoryId");

-- AddForeignKey
ALTER TABLE "CategorySection" ADD CONSTRAINT "CategorySection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "sectionId" TEXT;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CategorySection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
