-- Follow-up карточки из чек-листа критериев при закрытии задачи: ключи карточек ручных шагов
ALTER TABLE "Task" ADD COLUMN "follow_ups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
