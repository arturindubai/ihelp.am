-- Поля из оформления заказа: noCall, tipAmount, cancelPenalty (FLOW-4)
ALTER TABLE "Order" ADD COLUMN "noCall" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "cancelPenalty" INTEGER NOT NULL DEFAULT 0;
