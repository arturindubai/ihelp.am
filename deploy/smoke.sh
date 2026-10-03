#!/usr/bin/env bash
# Smoke-тест iHelp после деплоя: контейнеры, страницы, защита, заголовки, бэкапы. Ничего не меняет.
#   deploy/smoke.sh                — iHelp и, если задан NEIGHBORS в .env, сайты соседей по серверу
#   deploy/smoke.sh https://… …    — проверить конкретные адреса соседей
# Соседи — чужие проекты на этом же сервере: они обязаны отвечать 200 после нашей выкладки.
# Список держим в .env (NEIGHBORS), чтобы чужие домены не попадали в репозиторий.
set -uo pipefail
cd "$(dirname "$0")/.."

env_val() { grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2-; }
bind="$(env_val HTTP_BIND)"
port="${bind##*:}"
BASE="http://127.0.0.1:${port:-80}"
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; fail=1; fi
}
warn() {
  local name="$1"
  shift
  if "$@"; then echo "  ✓ $name"; else echo "  ! $name (предупреждение)"; fi
}
http_code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
state() { docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}' "homecare-$1-1" 2> /dev/null; }

echo "Контейнеры"
check "app healthy" [ "$(state app | cut -d'|' -f2)" = healthy ]
check "db healthy" [ "$(state db | cut -d'|' -f2)" = healthy ]
for s in caddy cron backup; do check "$s запущен" [ "$(state "$s" | cut -d'|' -f1)" = running ]; done
check "migrate завершился успешно" [ "$(state migrate | cut -d'|' -f1,3)" = "exited|0" ]
check "OTP_DEV_MODE выключен" [ "$(docker exec homecare-app-1 printenv OTP_DEV_MODE 2> /dev/null)" = false ]
check "ключ шифрования настроек задан" docker exec homecare-app-1 sh -c 'test ${#SETTINGS_ENCRYPTION_KEY} -eq 64'

echo "Привязка порта"
port_bind_ok() {
  local p="${port:-80}"
  # Нестандартный порт (не 80/443) — контейнер за реверс-прокси: слушать должен только на 127.0.0.1
  case "$p" in 80|443) return 0;; esac
  local bad
  bad=$(ss -ltn 2>/dev/null | grep "LISTEN" | grep ":${p}" | grep -v "127\.0\.0\.1:${p}")
  if [ -n "$bad" ]; then
    printf "    порт %s открыт не на 127.0.0.1 — установите HTTP_BIND=127.0.0.1:%s в .env и пересоздайте caddy\n" "$p" "$p"
    return 1
  fi
}
check "HTTP-порт ${port:-80} слушает только на 127.0.0.1" port_bind_ok

echo "Уведомления"
tech_alert_ok() {
  curl -s -m 20 "$BASE/api/health?check=alert" | grep -q '"ok":true'
}
warn "адресат тех-алертов задан (нет — красная плашка в Здоровье)" tech_alert_ok

echo "Страницы ($BASE)"
check "/api/health → {\"ok\":true}" [ "$(curl -s -m 20 "$BASE/api/health")" = '{"ok":true}' ]
for p in /ru /en /am /ru/login /robots.txt /sitemap.xml; do check "$p → 200" [ "$(http_code "$BASE$p")" = 200 ]; done
check "/ru/admin → 307 (вход)" [ "$(http_code "$BASE/ru/admin")" = 307 ]
check "/api/cron без секрета → 403" [ "$(http_code "$BASE/api/cron")" = 403 ]
og="$(curl -s -m 20 "$BASE/ru" | grep -oE '<meta property="og:image" content="[^"]+"' | head -n 1 | sed -E 's/.*content="([^"]+)"/\1/; s/&amp;/\&/g')"
og_ok() { [ -n "$og" ] && [ "$(curl -s -o /dev/null -m 30 -w '%{http_code} %{content_type}' "$BASE/${og#*://*/}")" = "200 image/png" ]; }
check "превью ссылок (og:image) → PNG" og_ok

echo "Control Center"
# Ключ агента читается без вывода в лог: env_val возвращает значение, не эхо
cc_api_ok() {
  local key response http_code body
  key="$(env_val CC_AGENT_KEY)"
  [ -z "$key" ] && return 1
  response=$(curl -s -m 20 -w '\n%{http_code}' -H "x-cc-key: $key" "$BASE/api/cc")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  [ "$http_code" = "200" ] || return 1
  # Список задач непустой: JSON содержит хотя бы один объект задачи
  echo "$body" | grep -q '"tasks":\[{'
}
check "API воркеров: список задач (200, не пуст)" cc_api_ok
db_schema_ok() {
  # Проверяет, что все поля Task, Epic, WorkerRun из schema.prisma реально есть в базе.
  # Если миграция добавила столбец с неверным именем, запрос упадёт с ERROR: column "..." does not exist.
  # stdout (✓-строки) скрыт; stderr (имя отсутствующей таблицы/колонки) виден в логе smoke.
  node scripts/check-migrations.mjs --db >/dev/null
}
check "схема Prisma и база согласованы (Task, Epic, WorkerRun)" db_schema_ok

echo "Серверные скрипты (диспетчер воркеров)"
scripts_syntax_ok() {
  for f in scripts/*.mjs; do
    node --check "$f" 2>/dev/null || { echo "    синтаксическая ошибка: $f"; return 1; }
  done
}
check "node --check scripts/*.mjs (синтаксис)" scripts_syntax_ok
check "dispatcher.mjs загружается (импорты и --check)" node scripts/dispatcher.mjs --check

echo "Счётчики данных (выкладка не должна создавать записи)"
# Сверка выполняется только при запуске через deploy/update.sh — тот передаёт PREDEPLOY_COUNTS_FILE.
# Прямой запуск smoke.sh (тестировщик, вручную, rollback.sh) сверку пропускает.
counts_file="${PREDEPLOY_COUNTS_FILE:-}"
if [ -n "$counts_file" ] && [ -f "$counts_file" ]; then
  file_age=$(( $(date +%s) - $(stat -c %Y "$counts_file") ))
  if [ "$file_age" -gt 1200 ]; then
    echo "  ⚠ файл счётчиков устарел (${file_age}с > 20 мин) — пропускаю"
    rm -f "$counts_file"
  else
    mismatches=""
    while IFS=: read -r name before; do
      [ -z "$name" ] && continue
      case "$name" in
        Review)     sql="SELECT COUNT(*) FROM \"Review\"";;
        Order)      sql="SELECT COUNT(*) FROM \"Order\"";;
        UserClient) sql="SELECT COUNT(*) FROM \"User\" WHERE role = 'CLIENT'";;
        *) continue;;
      esac
      after=$(docker exec homecare-db-1 psql -U app -d homeservices -tAc "$sql" 2>/dev/null | tr -d '[:space:]')
      if [ "$before" = "?" ]; then
        echo "  ⚠ $name: счётчик до выкладки неизвестен — пропускаю"
      elif [ "$before" != "$after" ]; then
        echo "  ! $name: до выкладки $before, после $after"
        mismatches="${mismatches}${name}: было ${before}, стало ${after}; "
      else
        echo "  ✓ $name: $after (без изменений)"
      fi
    done < "$counts_file"
    rm -f "$counts_file"
    if [ -n "$mismatches" ]; then
      echo "  ⚠ счётчики изменились: возможно клиент зарегистрировался во время выкладки или seed создал записи"
      cc_key="$(env_val CC_AGENT_KEY)"
      if [ -n "$cc_key" ]; then
        alert_msg="⚠ Счётчики данных изменились при выкладке: ${mismatches%%; }"
        alert_json="{\"message\":\"${alert_msg}\"}"
        if curl -s -m 20 -X POST \
            -H "Content-Type: application/json" \
            -H "x-cc-key: ${cc_key}" \
            --data-binary "$alert_json" \
            "$BASE/api/internal/alert" | grep -q '"ok":true'; then
          echo "  ✓ тех-алерт отправлен"
        else
          echo "  ⚠ тех-алерт не отправлен (API недоступно или ключ неверен)"
        fi
      else
        echo "  ⚠ тех-алерт не отправлен (CC_AGENT_KEY не задан)"
      fi
    fi
  fi
else
  echo "  ⚠ сверка пропущена (только при запуске через deploy/update.sh)"
fi

echo "Логи приложения"
# Первые 60 секунд после запуска контейнера — не должно быть MISSING_MESSAGE (next-intl) или
# необработанных исключений Node.js, которые сигнализируют о пропавших ключах перевода / багах.
app_logs_clean() {
  local started started_epoch end_ts errors
  started=$(docker inspect -f '{{.State.StartedAt}}' homecare-app-1 2>/dev/null) || return 0
  started_epoch=$(date -d "$started" +%s 2>/dev/null) || return 0
  end_ts=$(date -u -d "@$((started_epoch + 60))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null) || return 0
  errors=$(docker logs homecare-app-1 --since "$started" --until "$end_ts" 2>&1 | \
    grep -E "(MISSING_MESSAGE|UnhandledPromiseRejection)" | head -5)
  if [ -n "$errors" ]; then
    echo ""
    while IFS= read -r line; do printf '    %s\n' "$line"; done <<< "$errors"
    return 1
  fi
}
check "нет MISSING_MESSAGE / необработанных исключений" app_logs_clean

echo "Заголовки"
robots="$(env_val ROBOTS_TAG)"
check "X-Robots-Tag: ${robots:-noindex, nofollow}" [ "$(curl -sI -m 20 "$BASE/ru" | tr -d '\r' | sed -n 's/^[Xx]-[Rr]obots-[Tt]ag: //p')" = "${robots:-noindex, nofollow}" ]

echo "Бэкапы"
check "бэкап базы моложе 26 часов" [ -n "$(find backups -maxdepth 1 -name 'db-*.sql.gz' -mmin -1560 2> /dev/null | head -n 1)" ]
backup_script_ok() {
  local host_sum cont_sum
  host_sum=$(md5sum deploy/backup.sh 2>/dev/null | cut -d' ' -f1) || return 1
  cont_sum=$(docker exec homecare-backup-1 md5sum /backup.sh 2>/dev/null | cut -d' ' -f1) || return 1
  [ "$host_sum" = "$cont_sum" ]
}
check "скрипт бэкапа совпадает с репозиторием" backup_script_ok

neighbors=("$@")
if [ ${#neighbors[@]} -eq 0 ]; then read -r -a neighbors <<< "$(env_val NEIGHBORS | tr -d '"')"; fi
if [ ${#neighbors[@]} -gt 0 ]; then
  echo "Соседние сайты"
  for u in "${neighbors[@]}"; do check "$u → 200" [ "$(http_code -L "$u")" = 200 ]; done
fi

if [ "$fail" = 0 ]; then echo "SMOKE OK"; else echo "SMOKE FAILED"; fi
exit "$fail"
