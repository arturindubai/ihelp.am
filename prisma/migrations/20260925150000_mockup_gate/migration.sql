-- DEV-24: гейт макета — поля для флага, ссылки и утверждения макета задачи
ALTER TABLE "Task" ADD COLUMN "mockupRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "mockupUrl" TEXT;
ALTER TABLE "Task" ADD COLUMN "mockupApprovedBy" TEXT;
ALTER TABLE "Task" ADD COLUMN "mockupApprovedAt" TIMESTAMP(3);
