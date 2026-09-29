# Уведомления

Сверено с кодом: 28.09.2026, коммит 5a23c30 (DEV-9) + ветка task/NOTIFY-2A (уведомления мастерам). Базовые правила совпадают с записями nocode-1 в ленте DEV-15 от 25.09.2026 (коммит 6d81bcf). Расхождения: (1) `notifyTech` без chatId теперь падает в `notifyMembers` — рассылает всем привязанным членам команды в личку через `services/teamBot`; (2) добавлены уведомления мастерам (NOTIFY-2A).

## Каналы

| Канал | Бот | Назначение |
|---|---|---|
| Группа команды | @ihelp_staff_bot (team.botToken) | Заказы, отмены, переносы команде |
| Личный чат мастера | @ihelp_staff_bot (team.botToken) | Визиты конкретного мастера |
| Тех-алерты | @ihelp_staff_bot или ALERT_BOT_TOKEN | Ошибки, бэкапы, диск |

Клиентские уведомления — отдельные задачи (NOTIFY-3*), ещё не реализованы.

### notifyTeam — уведомления команде

- Отправляется через очередь `NotifyQueue` (повторные попытки при сбое).
- Бот `@ihelp_staff_bot` → Telegram-группа сотрудников.
- Настройка: `s.notify.teamChatId` (или `telegramChatId`), тред `telegramOrderThreadId`.
- Токен бота: `s.team.botToken`.

### notifyTech — технические алерты

- Прямой `fetch` без очереди — при падении базы очередь тоже недоступна.
- Чат: `s.notify.techChatId` (отдельный тех-чат) или `teamChatId`, или `telegramChatId`.
- Тред: `telegramTechThreadId`, или `telegramOrderThreadId`, или без треда — логика зависит от наличия отдельного тех-чата.
- Если `chatId` не задан — рассылка в личные сообщения всем привязанным членам команды через `services/teamBot.notifyMembers`.

### Резервный бот

- Если настройки БД недоступны — `notifyTech` берёт `ALERT_BOT_TOKEN` и `ALERT_CHAT_ID` из `.env`.

## Правила

1. Уведомления команде (`notifyTeam`) отправляются в группу (notify.teamChatId) через @ihelp_staff_bot (team.botToken).
2. Тех-алерты (`notifyTech`) — в отдельный тех-чат (notify.techChatId) или в группу команды, если тех-чат не задан. Прямой fetch без очереди — работает при недоступной базе.
3. Все уведомления (кроме тех-алертов) проходят через очередь надёжной доставки (`NotifyQueue`): запись создаётся до отправки, при сбое остаётся со статусом pending и повторяется кроном каждые 15 минут.
4. Мастер получает личные уведомления через @ihelp_staff_bot — только если у него заполнен `staffChatId` (Master.staffChatId). Поле заполняется при привязке: мастер пишет /start в @ihelp_staff_bot и делится номером телефона.
5. Мастер без staffChatId сообщений не получает; в журнал ошибка не пишется.

## События → команде

| Событие | Где |
|---|---|
| Новый заказ | `booking.ts → createOrder` |
| Отмена / пропуск визита клиентом | `src/server/actions/account.ts` |
| Перенос визита | `src/server/services/booking.ts → scheduleVisit` |
| Пауза / возобновление подписки | `src/server/services/booking.ts` |
| Новый отзыв | `src/server/actions/reviews.ts` |
| Смена статуса визита | `src/server/actions/visits.ts` |
| Истечение пакета с неиспользованными | `src/app/api/cron/route.ts` → шаг `packages` |
| Визиты без мастера завтра | `src/app/api/cron/route.ts` → шаг `unassigned` (18:00 ежедневно) |

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

## Тех-алерты (alertTech)

- Спам-фильтр: одинаковый ключ — не чаще `everyMin` минут (умолч. 60). Счётчик в памяти процесса → сбрасывается при рестарте.
- Лимит: не более 20 алертов в час (`MAX_PER_HOUR=20`).
- Каждый вызов `alertTech` записывается в `AppError` (upsert по ключу, счётчик повторений) — независимо от спам-фильтра.

### Ключи алертов

| Ключ | Событие |
|---|---|
| `otp-delivery:CHANNEL` | Не удалось доставить OTP через канал |
| `otp-fails:PHONE` | 10 неверных кодов за сутки (возможный подбор) |
| `otp-blocked:PHONE` | 20 неверных кодов за сутки (номер заблокирован) |
| `google-unknown` / `apple-unknown` | Вход через OAuth с неизвестным аккаунтом |
| `admin-link-used` / `admin-link-denied` | Вход по ссылке владельца |
| `request:PATH` | Ошибка обработки HTTP-запроса (из `instrumentation.ts`) |
| `cron:NAME` | Шаг крона упал |
| `disk` | Предупреждение о заполнении диска |
| `backup-stale` / `backup-error` / `backup-restore-check` | Состояние бэкапов |
| `workers:POOL:STATUS` | Состояние воркеров |
| `cc:*` | Сторож задач Control Center |

## Где в коде

| Что | Файл / функция |
|---|---|
| Уведомления мастерам | `src/server/services/workerNotify.ts` |
| Чистые функции (мастера) | `src/lib/workerNotify.ts` → `masterCanReceive`, `tomorrowYmd`, `fillTemplate` |
| Отправка команде | `src/server/notify.ts` → `notifyTeam` |
| Тех-уведомление | `src/server/notify.ts` → `notifyTech` |
| Тех-алерт со спам-фильтром | `src/server/alerts.ts` → `alertTech` |
| Ошибки запросов | `src/server/alerts.ts` → `reportRequestError` |
| Очередь уведомлений | `src/server/services/notifyQueue.ts` → `enqueueAndSend`, `processQueue` |
| Задержка повтора | `src/lib/notifyBackoff.ts` |
| Вебхук и привязка мастеров | `src/server/services/teamBot.ts` → `notifyMembers` |
| Крон (шаги уведомлений) | `src/app/api/cron/route.ts` → шаги `unassigned`, `notify-queue`, `master-tomorrow` |

## Тесты

- `src/lib/workerNotify.test.ts` — чистые функции уведомлений мастерам

## История изменений

| Дата | Что | Задача |
|---|---|---|
| 2026-09-25 | Первая запись (DEV-15, nocode-1) | DEV-15 |
| 2026-09-26 | Уведомления команде через @ihelp_staff_bot; очередь с tokenPath | NOTIFY-1 |
| 2026-09-28 | Файл создан в git; выявлено расхождение: notifyTech без chatId использует notifyMembers | DEV-9 |
| 2026-09-28 | Уведомления мастерам: назначение, перенос, отмена, расписание на завтра | NOTIFY-2A |
