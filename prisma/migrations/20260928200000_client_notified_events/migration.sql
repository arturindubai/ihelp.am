-- AlterTable: добавить массив отправленных клиентских уведомлений к заказу и визиту
ALTER TABLE "Order" ADD COLUMN "clientNotifiedEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Visit" ADD COLUMN "clientNotifiedEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
