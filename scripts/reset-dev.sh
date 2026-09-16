#!/bin/sh
# Только для локальной разработки: очищает заказы и тестовых пользователей, перезаливает стартовые данные
psql "$DATABASE_URL" -q -c 'TRUNCATE "Visit","Order","PromoRedemption","PromoCode","Review","Address","Session","OtpCode","AuditLog","UiString","TimeOff" CASCADE; DELETE FROM "User" WHERE role <> '"'"'OWNER'"'"'; UPDATE "Master" SET "userId"=NULL, phone=NULL, "jobsCount"=0, rating=0, "reviewsCount"=0; UPDATE "Service" SET rating=0, "reviewsCount"=0, "bookingsCount"=0;'
