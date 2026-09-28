#!/usr/bin/env bash
# Обновление iHelp: проверка git → бэкап → образы для отката → сборка → гейт → запуск → smoke-тест → очистка.
#   deploy/update.sh              — обновить (соседние сайты берутся из NEIGHBORS в .env)
#   deploy/update.sh https://… …  — проверить конкретные адреса соседей
# Откат, если что-то пошло не так: deploy/rollback.sh
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'echo "✗ Обновление прервано: $BASH_COMMAND. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"' ERR

if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незафиксированные изменения — сначала: git add -A && git commit -m '…'"
  git status --short
  exit 1
fi

echo "▶ 1/7 Бэкап перед обновлением"
if [ -z "${PREDEPLOY_DONE:-}" ]; then
  if docker compose ps --status running --services | grep -qx backup; then
    backup_label="$(date +%H%M%S)${DEPLOY_KEY:+-$DEPLOY_KEY}"
    timeout 900 docker compose exec -T backup sh /backup.sh once "$backup_label"
  else
    echo "  контейнер backup не запущен — пропускаю"
  fi
else
  echo "  бэкап снят до update.sh (PREDEPLOY_DONE) — пропускаю"
fi

echo "▶ 2/7 Сохраняю текущие образы для отката (:previous)"
for s in app migrate; do
  # Берём образ из контейнера, а не тег :latest — он мог обновиться после сборки без запуска
  running_id=$(docker inspect --format='{{.Image}}' "homecare-$s-1" 2>/dev/null || true)
  if [ -n "$running_id" ]; then
    docker tag "$running_id" "homecare-$s:previous"
  elif docker image inspect "homecare-$s:latest" > /dev/null 2>&1; then
    docker tag "homecare-$s:latest" "homecare-$s:previous"
  fi
done

echo "▶ 3/7 Получение образов приложения"
if [ -n "${APP_IMAGE:-}" ] && [ -n "${MIGRATE_IMAGE:-}" ]; then
  echo "  образы из CI registry: $APP_IMAGE / $MIGRATE_IMAGE"
  # Авторизация нужна для приватных пакетов GHCR; для публичных можно не задавать
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER:-arturindubai}" --password-stdin
  fi
  docker pull "${APP_IMAGE}"
  docker pull "${MIGRATE_IMAGE}"
  docker tag "${APP_IMAGE}" homecare-app:latest
  docker tag "${MIGRATE_IMAGE}" homecare-migrate:latest
else
  echo "  локальная сборка (APP_IMAGE / MIGRATE_IMAGE не заданы в .env — до 40 минут)"
  docker compose build
fi

echo "▶ 4/7 Гейт (хардкод цветов, строки мимо переводов, секреты в сборке)"
if ! deploy/gate.sh; then
  echo "✗ Гейт не прошёл. Прод не затронут. Исправить и запустить deploy/update.sh заново."
  exit 1
fi

echo "▶ 4b/7 Счётчики до выкладки (для smoke-теста)"
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  mkdir -p data/tmp
  predeploy_counts=""
  for table in Review Order; do
    count=$(docker compose exec -T db psql -U app -d homeservices -tAc "SELECT COUNT(*) FROM \"$table\"" 2>/dev/null | tr -d '[:space:]' || echo "?")
    predeploy_counts="${predeploy_counts}${table}:${count}"$'\n'
  done
  client_count=$(docker compose exec -T db psql -U app -d homeservices -tAc "SELECT COUNT(*) FROM \"User\" WHERE role = 'CLIENT'" 2>/dev/null | tr -d '[:space:]' || echo "?")
  predeploy_counts="${predeploy_counts}UserClient:${client_count}"$'\n'
  printf '%s' "$predeploy_counts" > data/tmp/predeploy-counts.txt
  echo "  сохранены в data/tmp/predeploy-counts.txt"
else
  echo "  БД не запущена — пропускаю"
fi

echo "▶ 5/7 Запуск на готовом образе (миграции базы применяются автоматически)"
echo "$(< src/lib/deploy-marker.txt)"
docker compose up -d --no-build
# Пересоздаём backup, чтобы получить актуальный /backup.sh (git при merge меняет inode файла)
echo "  пересоздаём контейнер backup"
docker compose up -d --no-build --force-recreate backup

echo "▶ 6/7 Ожидание готовности приложения"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2> /dev/null)" = healthy ] && break
  sleep 5
done

echo "▶ 7/7 Smoke-тест"
trap - ERR
if ! PREDEPLOY_COUNTS_FILE=data/tmp/predeploy-counts.txt deploy/smoke.sh "$@"; then
  echo "✗ Smoke-тест не прошёл. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"
  exit 1
fi

docker image prune -f > /dev/null
# Кэш сборки ограничиваем 10 ГБ; --keep-storage поддерживается с Docker 20.10
docker builder prune -f --keep-storage 10g > /dev/null 2>&1 || docker builder prune -f --filter until=168h > /dev/null
echo "✓ Обновление завершено: $(git log -1 --format='%h %s')"
