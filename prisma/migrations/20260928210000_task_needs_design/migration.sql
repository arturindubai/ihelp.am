-- AlterTable: добавить признак «нужно описание дизайна» — ставит триаж при разборе карточки
ALTER TABLE "Task" ADD COLUMN "needsDesign" BOOLEAN;
