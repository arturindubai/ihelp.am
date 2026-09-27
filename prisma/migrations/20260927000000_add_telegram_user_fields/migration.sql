-- Поля Telegram-аккаунта пользователя для входа через виджет (AUTH-10, часть 2).
-- Nullable, уникальный индекс только на telegramId — безопасная аддитивная миграция.
ALTER TABLE "User" ADD COLUMN "telegramId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramUsername" TEXT;
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
