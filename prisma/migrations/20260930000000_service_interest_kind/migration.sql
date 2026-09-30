-- Тип заявки «Уведомить меня»: category — заявка по категории, service — по конкретной услуге.
-- Старые строки получают значение по умолчанию 'category'.
ALTER TABLE "service_interest" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'category';
