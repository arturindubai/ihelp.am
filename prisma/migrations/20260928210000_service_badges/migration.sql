-- AlterTable
ALTER TABLE "Service" ADD COLUMN "isNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "arrivalHours" INTEGER;
