# Уведомления

Сверено с кодом: 2026-09-28, ветка task/NOTIFY-2A. Владелец правил: владелец (решение 25.09.2026, лента NOTIFY-2).

## Каналы

| Канал | Бот | Назначение |
|---|---|---|
| Группа команды | @ihelp_staff_bot (team.botToken) | Заказы, отмены, переносы команде |
| Личный чат мастера | @ihelp_staff_bot (team.botToken) | Визиты конкретного мастера |
| Тех-алерты | @ihelp_staff_bot или ALERT_BOT_TOKEN | Ошибки, бэкапы, диск |

Клиентские уведомления — отдельные задачи (NOTIFY-3*), ещё не реализованы.

## Правила

1. Уведомления команде (`notifyTeam`) отправляются в группу (notify.teamChatId) через @ihelp_staff_bot (team.botToken).
2. Тех-алерты (`notifyTech`) — в отдельный тех-чат (notify.techChatId) или в группу команды, если тех-чат не задан. Прямой fetch без очереди — работает при недоступной базе.
3. Все уведомления (кроме tех-алертов) проходят через очередь надёжной доставки (`NotifyQueue`): запись создаётся до отправки, при сбое остаётся со статусом pending и повторяется кроном каждые 15 минут.
4. Мастер получает личные уведомления через @ihelp_staff_bot — только если у него заполнен `staffChatId` (Master.staffChatId). Поле заполняется при привязке: мастер пишет /start в @ihelp_staff_bot и делится номером телефона.
5. Мастер без staffChatId сообщений не получает; в журнал ошибка не пишется.

## Когда уходят уведомления мастеру

| Событие | Функция | Вызывается в |
|---|---|---|
| Новый заказ с мастером | `notifyMasterAssigned` | `booking.ts:createOrder` |
| Назначение мастера оператором | `notifyMasterAssigned` | `operator.ts:operatorAssignMasterAction` |
| Назначение мастера в админке | `notifyMasterAssigned` | `admin/orders.ts:adminVisitAction` |
| Перенос визита клиентом | `notifyMasterRescheduled` | `account.ts:rescheduleVisitAction` |
| Перенос/смена даты в админке | `notifyMasterRescheduled` | `admin/orders.ts:adminVisitAction` |
| Отмена визита клиентом | `notifyMasterCancelled` | `account.ts:cancelVisitAction` |
| Расписание на завтра ~20:00 ERV | `sendMasterTomorrowSchedule` | `api/cron/route.ts` |

## Крайние случаи

- Мастер без staffChatId: все функции `notifyMaster*` проверяют поле и тихо выходят.
- Сбой Telegram API: сообщение остаётся в NotifyQueue (status=pending), крон повторяет по exponential backoff (notifyBackoff.ts).
- «Завтра» в Asia/Yerevan: расчёт через `addDays(ymd(now), 1)` с UTC+4 смещением. Тестируется в `workerNotify.test.ts`.
- Визитов на завтра нет: сообщение мастеру не отправляется.
- Крон вызывается каждые 15 мин, задача `master-tomorrow` защищена `daily(key, 20, ...)` — срабатывает один раз после 20:00 по Еревану.
- При переносе: мастеру приходит обновлённое время уже изменённого визита (функция вызывается после `scheduleVisit`).
- При отмене: мастеру приходит уведомление до изменения статуса, пока masterId ещё заполнен.

## Где в коде

- `src/server/services/workerNotify.ts` — уведомления мастерам
- `src/server/notify.ts` — базовые функции (notifyTeam, notifyTech, notifyMaster), очередь через enqueueAndSend
- `src/server/services/notifyQueue.ts` — очередь с retry
- `src/server/services/teamBot.ts` — вебхук @ihelp_staff_bot: задачи команды + привязка мастеров по контакту
- `src/server/alerts.ts` — тех-алерты с дедупликацией
- `src/lib/notifyBackoff.ts` — расчёт задержки повтора
- `src/lib/workerNotify.ts` — чистые функции (masterCanReceive, tomorrowYmd, fillTemplate), тест в `workerNotify.test.ts`

## История изменений

| Дата | Что | Задача |
|---|---|---|
| 2026-09-26 | Уведомления команде через @ihelp_staff_bot; очередь с tokenPath | NOTIFY-1 |
| 2026-09-28 | Уведомления мастерам: назначение, перенос, отмена, расписание на завтра | NOTIFY-2A |
