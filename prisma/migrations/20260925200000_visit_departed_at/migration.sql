-- Время отправки мастера («Выехал»): фиксируем для сбора данных о поездках (ROUTE-3)
ALTER TABLE "Visit" ADD COLUMN "departedAt" TIMESTAMP(3);
