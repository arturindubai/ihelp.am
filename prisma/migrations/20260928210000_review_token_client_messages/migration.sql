-- Одноразовый токен для отзыва без повторного входа (NOTIFY-3B)
CREATE TABLE "ReviewToken" (
    "id"        TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "visitId"   TEXT NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewToken_token_key" ON "ReviewToken"("token");
CREATE UNIQUE INDEX "ReviewToken_visitId_key" ON "ReviewToken"("visitId");

ALTER TABLE "ReviewToken"
    ADD CONSTRAINT "ReviewToken_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Лог клиентских сообщений с каналом и статусом доставки (NOTIFY-3B)
CREATE TABLE "ClientMessage" (
    "id"        TEXT NOT NULL,
    "orderId"   TEXT NOT NULL,
    "visitId"   TEXT,
    "event"     TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "channel"   TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientMessage_orderId_idx" ON "ClientMessage"("orderId");

ALTER TABLE "ClientMessage"
    ADD CONSTRAINT "ClientMessage_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
