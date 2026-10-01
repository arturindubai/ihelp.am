-- Сумма чаевых мастеру в отзыве (FLOW-13)
ALTER TABLE "Review" ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
