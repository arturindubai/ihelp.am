-- NOTIFY-2A: Telegram chat ID мастера в @ihelp_staff_bot
-- Аддитивная миграция: добавляет nullable поле, существующие строки получат NULL
ALTER TABLE "Master" ADD COLUMN "staffChatId" TEXT;
