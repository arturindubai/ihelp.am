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
if docker compose ps --status running --services | grep -qx backup; then
  timeout 900 docker compose exec -T backup sh /backup.sh once predeploy
else
  echo "  контейнер backup не запущен — пропускаю"
fi

echo "▶ 2/7 Сохраняю текущие образы для отката (:previous)"
for s in app migrate; do
  if docker image inspect "homecare-$s:latest" > /dev/null 2>&1; then docker tag "homecare-$s:latest" "homecare-$s:previous"; fi
done

echo "▶ 3/7 Сборка (на этом сервере — до 40 минут; лучше вне пиковых часов)"
docker compose build

echo "▶ 4/7 Гейт (хардкод цветов, строки мимо переводов, секреты в сборке)"
if ! deploy/gate.sh; then
  echo "✗ Гейт не прошёл. Прод не затронут. Исправить и запустить deploy/update.sh заново."
  exit 1
fi

echo "▶ 5/7 Запуск на готовом образе (миграции базы применяются автоматически)"
docker compose up -d --no-build

echo "▶ 6/7 Ожидание готовности приложения"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2> /dev/null)" = healthy ] && break
  sleep 5
done

echo "▶ 7/7 Smoke-тест"
trap - ERR
if ! deploy/smoke.sh "$@"; then
  echo "✗ Smoke-тест не прошёл. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"
  exit 1
fi

docker image prune -f > /dev/null
docker builder prune -f --filter until=720h > /dev/null
echo "✓ Обновление завершено: $(git log -1 --format='%h %s')"
