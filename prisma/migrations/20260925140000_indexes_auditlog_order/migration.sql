-- AUD-7: Индексы для роста объёмов — журнал действий и список заказов клиента.
-- Только добавляющая миграция: новые индексы, данные не затрагиваются.

-- AuditLog: /admin/log сортирует по createdAt desc без фильтров — без индекса seq-scan + sort
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- Order: запрос списка заказов клиента — WHERE userId = ? ORDER BY createdAt DESC.
-- Существующий @@index([userId]) покрывает фильтр, но не сортировку.
-- Составной индекс убирает sort-шаг для наиболее частого запроса.
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
