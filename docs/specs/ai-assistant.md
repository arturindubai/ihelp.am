# Спецификация: ИИ-помощник расписания

Задача ROUTE-5 (L): часть 1 (ROUTE-8) — очередь запросов; часть 2 (ROUTE-9) — предложение расстановки визитов.

## Архитектура

ИИ-помощник работает на подписке Claude Max, а не на API-ключе. Подписка доступна только с сервера через `claude -p` (так работают воркеры). Приложение живёт в контейнере без доступа к подписке — нужен мост:

```
приложение (контейнер) → AiRequest (база) → диспетчер (сервер) → claude -p → ответ в базе
```

## Модель AiRequest

Поля:

| Поле | Тип | Описание |
|---|---|---|
| `id` | `String` | cuid |
| `kind` | `String` | Тип задачи: `echo` \| `schedule` |
| `input` | `Json` | Входные данные (только необходимое, без лишних ПДн) |
| `output` | `Json?` | Ответ модели; null до завершения |
| `status` | `String` | `queued` → `running` → `done` \| `failed` |
| `error` | `String?` | Текст ошибки при `failed` |
| `tokens` | `Int` | Суммарное число токенов (input + output + cache) |
| `requestedBy` | `String?` | userId или имя агента |
| `createdAt` | `DateTime` | Время создания |
| `startedAt` | `DateTime?` | Начало выполнения |
| `finishedAt` | `DateTime?` | Конец выполнения |

## Сервис aiQueue.ts

### Пользовательский API (требует раздел `schedule`)

- `enqueue(kind, input)` — создать запрос, `status=queued`
- `get(id)` — получить запрос по id
- `cancel(id)` — отменить `queued`-запрос
- `getMonthTokens()` — токены за текущий месяц (для чипа в drawer ROUTE-5)

### Внутренний API (вызывается диспетчером)

- `popQueued()` — взять следующий `queued`-запрос
- `markRunning(id)` — отметить как запущенный
- `markDone(id, output, tokens)` — записать результат
- `markFailed(id, error, loginError?)` — записать ошибку; при `loginError=true` — тех-алерт

## Диспетчер

Функция `processAiQueue()` вызывается в конце каждого прохода диспетчера после worker-reconcile. Максимум 3 запроса за проход (защита от зависания).

Для каждого запроса:
1. Получить через `GET /api/cc?resource=ai-queue`
2. Отметить `running` через `POST /api/cc {action: "ai-queue-start"}`
3. Собрать промпт: системная инструкция по `kind` + `input` как JSON
4. Запустить `claude -p` — без инструментов, модель `sonnet`, таймаут 3 минуты
5. Записать результат через `ai-queue-done` или `ai-queue-fail`

### Системные промпты по kind

| `kind` | Назначение | Промпт |
|---|---|---|
| `echo` | Тест очереди | Вернуть поле `input.text` в `output` |
| `schedule-proposal` | Предложить расстановку визитов дня (ROUTE-9) | Анализ слотов мастеров и выбор оптимальных пар «визит → мастер + время» |

### Обработка ошибок

- Нет токена подписки → все запросы получают `failed`, тех-алерт, прерываем проход
- `claude -p` вернул `is_error` → `failed` с текстом ошибки
- Ошибка выглядит как проблема входа → `loginError=true` в API → тех-алерт через `markFailed`
- Ответ модели не парсится как JSON → `output = { raw: "..." }`

## API /api/cc (для диспетчера)

### GET

- `?resource=ai-queue` — следующий `queued`-запрос: `{ request: { id, kind, input } | null }`
- `?resource=ai-tokens` — токены за месяц: `{ tokens: N }`

### POST

- `{action: "ai-queue-start", id}` — отметить running
- `{action: "ai-queue-done", id, output, tokens}` — записать результат
- `{action: "ai-queue-fail", id, error, loginError?}` — записать ошибку (+ тех-алерт при loginError)
- `{action: "tech-alert", key, text}` — тех-алерт от диспетчера

Все действия требуют `agent: "dispatcher"`.

## Персональные данные в промпте

Правило: в промпт ИИ передаётся **только то, что нужно для задачи**.

| kind | Что передаётся | Что НЕ передаётся |
|---|---|---|
| `echo` | Только тестовые данные | — |
| `schedule-proposal` | id мастеров, временны́е интервалы, адрес (район/улица без имени клиента) | Имя клиента, телефон, email, история платежей |

Подробнее — `docs/PERSONAL_DATA.md` (раздел «ИИ-ассистент»).

## Тест kind=echo

Для проверки очереди на живом сервере:

```bash
# 1. Создать запрос через API (или через будущий интерфейс ROUTE-9)
# В базе напрямую (только для теста):
docker compose exec -T db psql -U app -d homeservices -c \
  "INSERT INTO \"AiRequest\"(id, kind, input, status, \"createdAt\") \
   VALUES ('test-echo-1', 'echo', '{\"text\": \"ping\"}', 'queued', now())"

# 2. Дождаться прохода диспетчера (≤1 минута) или запустить вручную:
node /opt/ihelp.am/scripts/dispatcher.mjs

# 3. Проверить результат:
docker compose exec -T db psql -U app -d homeservices -tAc \
  "SELECT status, output, tokens FROM \"AiRequest\" WHERE id='test-echo-1'"

# Ожидаемый результат: status=done, output содержит {"output":"ping"}, tokens > 0
```

## Сервис scheduleAssistant.ts (ROUTE-9)

Файл: `src/server/services/scheduleAssistant.ts`

### requestScheduleProposal(date, requestedBy?)

Собирает нераспределённые визиты дня (scheduledAt на дату, masterId=null) и занятость всех активных мастеров,
ставит запрос `kind=schedule-proposal` в очередь через `enqueueInternal`. Возвращает `{ requestId, visitCount }`.

Поле `travelMatrix` в input зарезервировано для ROUTE-4 (матрица времени в пути между адресами).

### parseAndValidateProposal(output)

Разбирает `output` AiRequest по схеме zod. Каждое назначение проверяется:
1. Визит существует в БД
2. Мастер активен
3. Мастер имеет навык для услуги визита
4. Слот свободен с учётом bufferMin (`isMasterFree` из `src/lib/slots.ts`)

Невалидные назначения возвращаются с полем `valid=false` и `invalidReason`. Порядок важен: первое
валидное назначение добавляется в in-memory busy мастера, чтобы второе назначение того же мастера
учитывало его.

### Actions: src/server/actions/admin/schedule.ts

- `requestProposalAction(date)` — поставить запрос, проверка права `schedule`, аудит
- `applyProposalAction(requestId)` — применить: назначить мастеров через `scheduleVisit`, аудит
- `rejectProposalAction(requestId)` — отклонить: только аудит, расписание не меняется

### Системный промпт kind=schedule-proposal

Добавлен в `scripts/dispatcher.mjs` → `AI_SYSTEM_PROMPTS['schedule-proposal']`.
Промпт указывает формат выхода (JSON с assignments + explanation) и правила назначения.

## Расход токенов (критерий 3 ROUTE-5)

Функция `sumMonthTokens()` суммирует поле `tokens` по всем `AiRequest` за текущий месяц.
Вызывается из `getMonthTokens()` (с проверкой прав `schedule`) для чипа в шапке drawer.

Токены считаются как сумма всех компонентов usage из ответа `claude -p`:
`input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens`
