-- DEV-22: «Что изменилось для людей» и резюме для владельца. Только добавляющая миграция.

ALTER TABLE "Task" ADD COLUMN "releaseNote" TEXT;
ALTER TABLE "Task" ADD COLUMN "ownerSummary" TEXT;
