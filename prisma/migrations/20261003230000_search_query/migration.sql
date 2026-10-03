-- Поисковые запросы без результата (BUG-35)
CREATE TABLE "search_query" (
    "id"      TEXT NOT NULL,
    "query"   TEXT NOT NULL,
    "locale"  TEXT NOT NULL DEFAULT 'ru',
    "count"   INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_query_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_query_query_locale_key" ON "search_query"("query", "locale");
CREATE INDEX "search_query_count_idx" ON "search_query"("count");
