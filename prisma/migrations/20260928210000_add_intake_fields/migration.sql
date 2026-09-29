-- Исходный текст владельца из Intake (сохраняется неизменным) и карта просьб при закрытии
ALTER TABLE "Task" ADD COLUMN "intakeText" TEXT;
ALTER TABLE "Task" ADD COLUMN "intakeClosingMap" TEXT;
