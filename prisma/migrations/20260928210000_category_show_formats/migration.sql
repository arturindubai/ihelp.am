-- AlterTable: флаг «Показывать форматы уборки» для категории
ALTER TABLE "Category" ADD COLUMN "showFormats" BOOLEAN NOT NULL DEFAULT false;
