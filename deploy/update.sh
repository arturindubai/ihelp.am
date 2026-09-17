#!/usr/bin/env bash
# Обновление HomeCare: проверка git → бэкап → образы для отката → сборка → запуск → smoke-тест → очистка.
#   deploy/update.sh                                  — обновить
#   deploy/update.sh https://liacontentos.com …        — и проверить, что соседние сайты отвечают 200
# Откат, если что-то пошло не так: deploy/rollback.sh
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'echo "✗ Обновление прервано: $BASH_COMMAND. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"' ERR

if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незафиксированные изменения — сначала: git add -A && git commit -m '…'"
  git status --short
  exit 1
fi

echo "▶ 1/6 Бэкап перед обновлением"
if docker compose ps --status running --services | grep -qx backup; then
  timeout 900 docker compose exec -T backup sh /backup.sh once
else
  echo "  контейнер backup не запущен — пропускаю"
fi

echo "▶ 2/6 Сохраняю текущие образы для отката (:previous)"
for s in app migrate; do
  if docker image inspect "homecare-$s:latest" > /dev/null 2>&1; then docker tag "homecare-$s:latest" "homecare-$s:previous"; fi
done

echo "▶ 3/6 Сборка (на этом сервере — до 40 минут; лучше вне пиковых часов)"
docker compose build

echo "▶ 4/6 Запуск (миграции базы применяются автоматически)"
docker compose up -d

echo "▶ 5/6 Ожидание готовности приложения"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2> /dev/null)" = healthy ] && break
  sleep 5
done

echo "▶ 6/6 Smoke-тест"
trap - ERR
if ! deploy/smoke.sh "$@"; then
  echo "✗ Smoke-тест не прошёл. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"
  exit 1
fi

docker image prune -f > /dev/null
docker builder prune -f --filter until=720h > /dev/null
echo "✓ Обновление завершено: $(git log -1 --format='%h %s')"
