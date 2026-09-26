-- Путь к ключу настроек для повторных попыток: разные боты (notify, team) используют разные токены
ALTER TABLE "NotifyQueue" ADD COLUMN "tokenPath" TEXT NOT NULL DEFAULT 'notify.telegramBotToken';
