-- Уникальность подписки по endpoint вместо (userId, endpoint): одно устройство — одна запись.
-- При смене пользователя на том же браузере подписка переходит к вошедшему, а не дублируется.
-- Данных ещё нет (таблица создана этой же веткой), поэтому пересечений нет.

-- Удаляем старый составной уникальный индекс
DROP INDEX "PushSubscription_userId_endpoint_key";

-- Добавляем уникальный индекс по endpoint
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
