-- AlterTable: персональные промокоды — привязка к телефону или email конкретного клиента
ALTER TABLE "PromoCode" ADD COLUMN "forPhone" TEXT;
ALTER TABLE "PromoCode" ADD COLUMN "forEmail" TEXT;
