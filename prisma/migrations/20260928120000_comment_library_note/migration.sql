-- Добавляем поле для ссылки на запись Библиотеки, если текст комментария превысил лимит
ALTER TABLE "TaskComment" ADD COLUMN "libraryNoteId" TEXT;
