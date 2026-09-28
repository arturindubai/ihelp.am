# Уведомления

Сверено с кодом: 28.09.2026, коммит 5a23c30. Базовые правила совпадают с записями nocode-1 в ленте DEV-15 от 25.09.2026 (коммит 6d81bcf). Расхождение: `notifyTech` без chatId теперь падает в `notifyMembers` — рассылает всем привязанным членам команды в личку через `services/teamBot`.

## Каналы

### notifyTeam — уведомления команде

- Отправляется через очередь `NotifyQueue` (повторные попытки при сбоге).
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
| Отправка команде | `src/server/notify.ts` → `notifyTeam` |
| Тех-уведомление | `src/server/notify.ts` → `notifyTech` |
| Тех-алерт со спам-фильтром | `src/server/alerts.ts` → `alertTech` |
| Ошибки запросов | `src/server/alerts.ts` → `reportRequestError` |
| Очередь уведомлений | `src/server/services/notifyQueue.ts` → `enqueueAndSend`, `processQueue` |
| Рассылка членам команды | `src/server/services/teamBot.ts` → `notifyMembers` |
| Крон (шаги уведомлений) | `src/app/api/cron/route.ts` → шаги `unassigned`, `notify-queue` |

## История изменений

- 25.09.2026 — первая запись (DEV-15, nocode-1).
- 28.09.2026 — файл создан в git (DEV-9); выявлено расхождение: `notifyTech` без chatId использует `notifyMembers` (teamBot) вместо молчания.
