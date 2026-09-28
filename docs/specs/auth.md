# Вход и роли

Сверено с кодом: 28.09.2026, коммит 5a23c30. Базовые правила совпадают с записями nocode-1 в ленте DEV-15 от 25.09.2026 (коммит 6d81bcf). Расхождения: (1) срок сессии стал настраиваемым (7 дней для персонала / 60 дней для клиентов по умолчанию); (2) добавлена отдельная константа `ALERT_FAILS_PER_DAY=10` и ключ алерта `otp-blocked:PHONE` при достижении `MAX_FAILS_PER_DAY`.

## Роли

| Роль | Группа |
|---|---|
| `CLIENT` | — |
| `MASTER` | — |
| `OPERATOR` | `STAFF_ROLES` |
| `ADMIN` | `STAFF_ROLES`, `ADMIN_ROLES` |
| `OWNER` | `STAFF_ROLES`, `ADMIN_ROLES` |

`STAFF_ROLES = ["OPERATOR", "ADMIN", "OWNER"]`, `ADMIN_ROLES = ["ADMIN", "OWNER"]` — константы в `src/server/auth.ts`.

## Потоки входа

### 1. Телефон + OTP

1. `sendCodeAction` → `sendOtp` — создаёт код и отправляет через включённый канал: `WHATSAPP`, `TELEGRAM`, `SMS`.
2. Нет включённых каналов → код пишется в лог сервера (`docker compose logs app | grep otp`).
3. `verifyCodeAction` → `verifyOtp` → `createSession`.
4. Новый номер: ответ содержит `needSignup=true` + `signupTicket` → пользователь вводит имя и email → `finishSignupAction` → создание аккаунта (оба контакта подтверждены).
5. Пользователь без имени (старые данные): `needName=true` → `setNameAction`, сессия создаётся после.

### 2. Email + OTP

6. Работает только для адресов с `emailVerifiedAt != null`.
7. Ответ `sendEmailLoginCodeAction` одинаков для существующего, неизвестного и заблокированного адреса (против перебора). Если адрес не найден — код создаётся, лимиты списываются, письмо не уходит (`skipDelivery`).

### 3. Google OAuth

8. Только по HTTPS. Только для аккаунтов с совпадающим email. Новый аккаунт не создаётся.

### 4. Apple Sign In

9. Аналогично Google OAuth.

### 5. Telegram Login Widget

10. `alertTech` при каждом входе.

### 6. Ссылка владельца

11. `GET /api/auth/link?token=ADMIN_LOGIN_TOKEN` → сессия. `alertTech` при каждом использовании и при отказе (пустой токен = выключен).

## Регистрация

Код телефона → `signupTicket` → ввод имени + email → OTP на email → создание аккаунта (оба контакта подтверждены).

## Привязка мастера

При входе по телефону: если номер найден в таблице `Master` без `userId` — роль меняется на `MASTER`.

## Сессия

- Cookie `sid`, `httpOnly`, `sameSite=lax`, `COOKIE_SECURE=true` в проде.
- Токен: 32 случайных байта (`base64url`), хранится как `HMAC-SHA256` в таблице `Session`.
- Срок: настраивается — по умолчанию 60 дней для клиентов (`clientSessionDays`), 7 дней для персонала (`staffSessionDays`).
- Выход: запись из `Session` удаляется, cookie очищается.

## Лимиты OTP

| Параметр | Значение по умолчанию |
|---|---|
| Пауза между кодами | `resendSec = 60 с` |
| TTL кода | `ttlMin = 5 мин` |
| Длина кода | `codeLength = 4 цифры` |
| Попыток на один код | `maxAttempts = 5` |
| Кодов на номер в час | 5 |
| Кодов на номер в сутки | `MAX_CODES_PER_DAY = 10` |
| Неверных кодов в сутки | `MAX_FAILS_PER_DAY = 20` |
| Кодов с IP в час | 20 |

Тех-алерт `otp-fails:PHONE` при достижении `ALERT_FAILS_PER_DAY = 10` неверных. Тех-алерт `otp-blocked:PHONE` при блокировке (≥ `MAX_FAILS_PER_DAY`).

## Где в коде

| Что | Файл / функция |
|---|---|
| Сессия | `src/server/auth.ts` → `createSession`, `getCurrentUser`, `logout` |
| OTP (отправка и проверка) | `src/server/otp.ts` → `sendOtp`, `verifyOtp` |
| Actions входа | `src/server/actions/auth.ts` → `sendCodeAction`, `verifyCodeAction`, `finishSignupAction` |
| OAuth | `src/server/services/oauth.ts` |
| Ссылка владельца | `src/app/api/auth/link/route.ts` |
| Роли | `src/server/auth.ts` → `STAFF_ROLES`, `ADMIN_ROLES` |

Тесты: `src/lib/__tests__/firstOrder.test.ts` (косвенно затрагивает логику сессии).

## История изменений

- 25.09.2026 — первая запись (DEV-15, nocode-1).
- 28.09.2026 — файл создан в git (DEV-9); выявлены расхождения: срок сессии стал настраиваемым, добавлен `ALERT_FAILS_PER_DAY=10` и алерт `otp-blocked`.
