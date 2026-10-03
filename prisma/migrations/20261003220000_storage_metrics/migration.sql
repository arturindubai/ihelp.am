-- DB-7: ежедневные показатели хранилища (размер базы, загрузки, бэкапы, диск)
CREATE TABLE "StorageMetric" (
  "id"          TEXT NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL,
  "dbMb"        DOUBLE PRECISION NOT NULL,
  "uploadsMb"   DOUBLE PRECISION NOT NULL,
  "backupsMb"   DOUBLE PRECISION,
  "diskFreePct" INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorageMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageMetric_date_key" ON "StorageMetric"("date");
CREATE INDEX "StorageMetric_date_idx" ON "StorageMetric"("date");
