-- Дата автоматической разблокировки: сторож возвращает задачу на разбор в этот день
ALTER TABLE "Task" ADD COLUMN "blockedUntil" TIMESTAMP(3);

-- Заполнить blockedFrom для 11 заблокированных задач, у которых поле пустое.
-- Берём статус из последнего события перехода в «Заблокирована» из журнала.
-- Если событий нет — по умолчанию 'backlog' (безопаснее: пройдёт через триаж).
UPDATE "Task" t
SET "blockedFrom" = COALESCE(
  (SELECT e.from
   FROM "TaskEvent" e
   WHERE e."taskId" = t.id
     AND e.field = 'status'
     AND e.to = 'blocked'
   ORDER BY e."createdAt" DESC
   LIMIT 1),
  'backlog'
)
WHERE t.status = 'blocked' AND (t."blockedFrom" IS NULL OR t."blockedFrom" = '');

-- Задачи, отложенные до 10.10.2026 — дата текущая только текстом, ставим дату автоматической разблокировки
UPDATE "Task"
SET "blockedUntil" = '2026-10-10 00:00:00'::timestamp
WHERE key IN ('INFRA-5', 'LEGAL-4', 'OTP-2')
  AND status = 'blocked';
