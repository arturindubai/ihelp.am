-- Отзываем сессии персонала длиннее 7 дней (AUTH-26):
-- до AUTH-5 Telegram-виджет создавал сессии без роли → 60 дней вместо 7.
DELETE FROM "Session"
WHERE "userId" IN (
  SELECT id FROM "User" WHERE role IN ('OPERATOR', 'ADMIN', 'OWNER')
)
AND "expiresAt" > NOW() + INTERVAL '7 days';
