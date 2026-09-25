#!/usr/bin/env bash
# Ежемесячное обновление базовых образов iHelp (node:22, postgres:16, caddy:2).
# Без apt upgrade на хосте и без изменений package-lock.json — только слои Docker.
# npm update (изменение package-lock.json) — ручной шаг через обычный деплой.
# Выполняется таймером ihelp-refresh.timer; ручной запуск: cd /opt/ihelp.am && deploy/refresh-images.sh
# Откат при необходимости: deploy/rollback.sh
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'echo "[$(date +%T)] ✗ Прервано: $BASH_COMMAND. Откат: deploy/rollback.sh"' ERR

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "▶ Ежемесячное обновление базовых образов iHelp"

log "▶ 1/6 Бэкап перед обновлением"
if docker compose ps --status running --services | grep -qx backup; then
  timeout 900 docker compose exec -T backup sh /backup.sh once refresh
else
  log "  контейнер backup не запущен — пропускаю"
fi

log "▶ 2/6 Сохраняю текущие образы для отката (:previous)"
for s in app migrate; do
  if docker image inspect "homecare-$s:latest" >/dev/null 2>&1; then
    docker tag "homecare-$s:latest" "homecare-$s:previous"
  fi
done

log "▶ 3/6 Подтягиваю последние теги базовых образов (postgres:16-alpine, caddy:2-alpine)"
docker compose pull --quiet

log "▶ 4/6 Пересборка образов приложения со свежим node:22-bookworm-slim"
docker compose build --pull --quiet

log "▶ 5/6 Перезапуск контейнеров"
docker compose up -d

log "  Ожидание готовности приложения (до 5 минут)"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2>/dev/null)" = healthy ] && break
  sleep 5
done

log "▶ 6/6 Smoke-тест"
trap - ERR
if ! deploy/smoke.sh; then
  log "✗ Smoke-тест не прошёл. Логи: docker compose logs --tail 100 app migrate. Откат: deploy/rollback.sh"
  exit 1
fi

docker image prune -f >/dev/null
docker builder prune -f --filter until=720h >/dev/null
log "✓ Обновление базовых образов завершено"
log "  npm-зависимости (package-lock.json) обновляются отдельно через обычный деплой."
