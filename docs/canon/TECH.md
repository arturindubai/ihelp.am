# Технические данные iHelp

Справочник «где что»: сервер, домены, контейнеры, ключи, таймеры, бэкапы. Значений секретов здесь нет и быть не должно — только имена и места. Актуально на 25.09.2026; меняется задачей вместе с кодом.

## Сервер

- Хост `vmi2727891`, IP `37.60.236.202`, Ubuntu (ядро 6.8), 23 ГБ ОЗУ, диск 145 ГБ (занято ~67%).
- Вход — SSH под `root`. На сервере живут и **чужие проекты**: сайты в `/var/www`, хостовой nginx на портах 80/443, pm2, WireGuard. К iHelp они отношения не имеют.
- Проект целиком в `/opt/ihelp.am` (git, ветка `main` = прод). `/opt/homecare` — старая символическая ссылка туда же.
- Рабочие копии задач: `/opt/ihelp.am/.claude/worktrees/<КЛЮЧ>` (ветка `task/<КЛЮЧ>`), копии тестировщика — `test-<КЛЮЧ>`.

## Домены и HTTPS

- `ihelp.am`, `www.ihelp.am` → хостовой nginx (`/etc/nginx/sites-available/ihelp.am.conf`, единственный файл вне проекта, который принадлежит iHelp) → `127.0.0.1:8080` → Caddy в контейнере → приложение.
- Сертификат Let's Encrypt, `/etc/letsencrypt/live/ihelp.am`, продлевает системный таймер `certbot.timer`.
- DNS — Cloudflare (записи домена, DKIM/SPF/DMARC для Resend).
- Соседние сайты для smoke-теста — переменная `NEIGHBORS` в `.env`.

## Контейнеры (docker compose, проект `homecare`)

| Сервис | Образ | Назначение |
|---|---|---|
| `app` | `homecare-app` (сборка из Dockerfile, Next.js 15, Node 20) | приложение, порт 3000 внутри сети |
| `db` | `postgres:16-alpine` | база `homeservices`, пользователь `app`, ~12 МБ |
| `migrate` | `homecare-migrate` | при каждой выкладке: `prisma migrate deploy` + сид (бэклог, эпики, Библиотека) |
| `backup` | `postgres:16-alpine` + `deploy/backup.sh` | ночной дамп в `BACKUP_AT` (по умолчанию 23:30), хранение `BACKUP_KEEP_DAYS` (14), проверка восстановления |
| `caddy` | `caddy:2-alpine` | `0.0.0.0:8080` → приложение; `127.0.0.1:8443` |
| `cron` | `curlimages/curl` + `deploy/cron.sh` | дёргает `/api/cron` с `CRON_SECRET`: сторож, уведомления, фоновые задачи |

Тома: `pgdata` (база), `uploads` (картинки каталога и файлы задач), `caddy_data`, `caddy_config`. Образы прошлой версии помечаются `:previous` для `deploy/rollback.sh`.

## Стек

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind 4 (токены `src/app/theme.css`), Prisma 6, PostgreSQL 16, next-intl (ru/en/am), vitest, Playwright для скриншотов стенда. Образ сборки `homecare-migrate` используется и для `scripts/check.sh`.

## Ключи и секреты — где лежат

- **`.env` в `/opt/ihelp.am`** (в git не попадает): `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `CC_AGENT_KEY` (API Control Center для агентов), `ADMIN_LOGIN_TOKEN` (ссылка входа владельца), `ADMIN_PHONE`, `CONTACT_*`, `APP_URL`, `SITE_ADDRESS`, `HTTP_BIND`, `HTTPS_BIND`, `COOKIE_SECURE`, `ROBOTS_TAG`, `BACKUP_*`, `OTP_DEV_MODE` (всегда `false`), `NEIGHBORS`, `CLAUDE_CODE_OAUTH_TOKEN` (подписка Claude для воркеров, `scripts/claude-login.sh`).
- **Control Center → «Ключи»** (в базе, зашифрованы `SETTINGS_ENCRYPTION_KEY`, в ночном бэкапе): токен бота команды, токен бота уведомлений и входа, Telegram Gateway, Twilio, WhatsApp Cloud API, Resend, Google Client Secret, ключ Apple `.p8`. Реестр — `src/lib/keys.ts`.
- **Копия `.env` вне сервера** — задача DB-8 (менеджер паролей владельца). **Копия бэкапов вне сервера** — DB-1.
- SSH-ключ для GitHub: `/root/.ssh/ihelp_deploy` (deploy key с правом записи).

## Внешние сервисы

- GitHub: `github.com/arturindubai/ihelp.am`, `origin` по SSH.
- Telegram: бот команды (задачи и статус, Control Center → «Ключи»), бот входа и уведомлений `@ihelp_am_bot`, бот сотрудников `@ihelp_staff_bot` (группа сотрудников — NOTIFY-9).
- Resend: домен `ihelp.am` подтверждён, регион eu-west-1, письма и коды входа по email.
- Twilio (SMS): отложено до 10.10.2026 (KYC), Sender ID до 03.12.2026.
- Google Cloud / Apple Developer: вход через Google и Apple — код готов, ключи ждут владельца (AUTH-8, AUTH-9).

## Таймеры и фоновые процессы

| Что | Где | Как часто |
|---|---|---|
| Диспетчер воркеров | `/etc/systemd/system/ihelp-dispatcher.timer` → `scripts/dispatcher.mjs` | раз в минуту |
| Запуски воркеров | юниты `ihelp-w-<агент>-<id>` (`systemd-run`, `scripts/worker-run.sh`) | по плану диспетчера |
| Сторож, уведомления, фон | контейнер `cron` → `/api/cron` | каждые 15 минут и по расписанию |
| Бэкап базы | контейнер `backup` | ночью, `BACKUP_AT` |
| Продление сертификата | `certbot.timer` | дважды в сутки |

Стоп-кран: `systemctl stop 'ihelp-w-*' ihelp-dispatcher.timer` или общий выключатель на вкладке «Воркеры».

## Порты

- `8080` — Caddy (HTTP от хостового nginx), `8443` — Caddy HTTPS только на localhost.
- `8082–8099` — стенды веток (`scripts/stand.sh up`), по одному на рабочую копию.
- `80/443` — чужой nginx, не трогать.

## Выкладка и откат

- Только `scripts/deploy-task.sh <КЛЮЧ>` из `/opt/ihelp.am` (деплоер): замок `data/deploy.lock`, слияние, бэкап при миграции, `deploy/update.sh` (сборка до 40 минут, миграции, smoke с соседями), push `main`, «Сделано» с коммитом. Логи — `data/deploys/`.
- Откат: `deploy/rollback.sh` (образы `:previous`; база не откатывается).
- Smoke вручную: `deploy/smoke.sh`. Бэкап вручную: `docker compose exec -T backup sh /backup.sh once`.

## Где смотреть, если что-то не так

- Control Center → «Здоровье» (сервер, база, диспетчер, воркеры, проверка доски), «Логи» (ошибки приложения без секретов), «Воркеры» (журнал запусков).
- На сервере: `docker compose ps`, `docker compose logs --tail 50 app`, `journalctl -u ihelp-dispatcher.service`, `node scripts/cc.mjs attention`, `node scripts/cc-audit.mjs`.
