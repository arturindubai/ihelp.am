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
http_code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
state() { docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}' "homecare-$1-1" 2> /dev/null; }

echo "Контейнеры"
check "app healthy" [ "$(state app | cut -d'|' -f2)" = healthy ]
check "db healthy" [ "$(state db | cut -d'|' -f2)" = healthy ]
for s in caddy cron backup; do check "$s запущен" [ "$(state "$s" | cut -d'|' -f1)" = running ]; done
check "migrate завершился успешно" [ "$(state migrate | cut -d'|' -f1,3)" = "exited|0" ]
check "OTP_DEV_MODE выключен" [ "$(docker exec homecare-app-1 printenv OTP_DEV_MODE 2> /dev/null)" = false ]
check "ключ шифрования настроек задан" docker exec homecare-app-1 sh -c 'test ${#SETTINGS_ENCRYPTION_KEY} -eq 64'

echo "Страницы ($BASE)"
check "/api/health → {\"ok\":true}" [ "$(curl -s -m 20 "$BASE/api/health")" = '{"ok":true}' ]
for p in /ru /ru/login /robots.txt /sitemap.xml; do check "$p → 200" [ "$(http_code "$BASE$p")" = 200 ]; done
check "/ru/admin → 307 (вход)" [ "$(http_code "$BASE/ru/admin")" = 307 ]
check "/api/cron без секрета → 403" [ "$(http_code "$BASE/api/cron")" = 403 ]
og="$(curl -s -m 20 "$BASE/ru" | grep -oE '<meta property="og:image" content="[^"]+"' | head -n 1 | sed -E 's/.*content="([^"]+)"/\1/; s/&amp;/\&/g')"
og_ok() { [ -n "$og" ] && [ "$(curl -s -o /dev/null -m 30 -w '%{http_code} %{content_type}' "$BASE/${og#*://*/}")" = "200 image/png" ]; }
check "превью ссылок (og:image) → PNG" og_ok

echo "Заголовки"
robots="$(env_val ROBOTS_TAG)"
check "X-Robots-Tag: ${robots:-noindex, nofollow}" [ "$(curl -sI -m 20 "$BASE/ru" | tr -d '\r' | sed -n 's/^[Xx]-[Rr]obots-[Tt]ag: //p')" = "${robots:-noindex, nofollow}" ]

echo "Бэкапы"
check "бэкап базы моложе 26 часов" [ -n "$(find backups -maxdepth 1 -name 'db-*.sql.gz' -mmin -1560 2> /dev/null | head -n 1)" ]

neighbors=("$@")
if [ ${#neighbors[@]} -eq 0 ]; then read -r -a neighbors <<< "$(env_val NEIGHBORS | tr -d '"')"; fi
if [ ${#neighbors[@]} -gt 0 ]; then
  echo "Соседние сайты"
  for u in "${neighbors[@]}"; do check "$u → 200" [ "$(http_code -L "$u")" = 200 ]; done
fi

if [ "$fail" = 0 ]; then echo "SMOKE OK"; else echo "SMOKE FAILED"; fi
exit "$fail"
