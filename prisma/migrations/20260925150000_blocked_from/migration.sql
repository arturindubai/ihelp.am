-- Откуда задача ушла в «Заблокирована»: разблокировка возвращает её туда же
ALTER TABLE "Task" ADD COLUMN "blockedFrom" TEXT;
