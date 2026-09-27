-- Карточки «Обещания» и FAQ для главной страницы (управляются в AdminKit → Контент)
CREATE TABLE "SiteFeature" (
    "id" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'check',
    "title" JSONB NOT NULL,
    "body" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SiteFeature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteFaq" (
    "id" TEXT NOT NULL,
    "q" JSONB NOT NULL,
    "a" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SiteFaq_pkey" PRIMARY KEY ("id")
);
