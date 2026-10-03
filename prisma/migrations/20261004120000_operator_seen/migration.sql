-- BUG-50: флаг "оператор просмотрел" для бейджа «Новая»
ALTER TABLE "Visit" ADD COLUMN "operatorSeen" BOOLEAN NOT NULL DEFAULT false;
