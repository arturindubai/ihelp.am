-- Топик Telegram-группы для уведомлений в нужный тред, а не в общий чат
ALTER TABLE "NotifyQueue" ADD COLUMN "threadId" TEXT;
