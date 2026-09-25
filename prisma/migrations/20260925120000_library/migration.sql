-- DEV-20: Библиотека знаний и инструкций (как Canon в LIA). Только добавляющая миграция: две новые таблицы.

CREATE TABLE "LibraryDoc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "path" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryVersion" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryDoc_slug_key" ON "LibraryDoc"("slug");
CREATE INDEX "LibraryDoc_kind_idx" ON "LibraryDoc"("kind");
CREATE UNIQUE INDEX "LibraryVersion_docId_n_key" ON "LibraryVersion"("docId", "n");
CREATE INDEX "LibraryVersion_docId_createdAt_idx" ON "LibraryVersion"("docId", "createdAt");

ALTER TABLE "LibraryVersion" ADD CONSTRAINT "LibraryVersion_docId_fkey" FOREIGN KEY ("docId") REFERENCES "LibraryDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
