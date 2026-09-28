#!/usr/bin/env bash
# Откат приложения на образы, сохранённые deploy/update.sh перед последним обновлением.
#   deploy/rollback.sh [URL соседних сайтов для проверки]
# База данных НЕ откатывается. Если обновление меняло схему базы и старая версия с ней несовместима —
# восстановите бэкап, снятый перед обновлением (README → «Бэкапы»).
# Тестирование цепочки (без docker compose up): ROLLBACK_SKIP_COMPOSE=1 deploy/rollback.sh
# Для изолированного стенда задать ROLLBACK_IMAGE_PREFIX=<имя-проекта> (по умолчанию homecare).
set -euo pipefail
cd "$(dirname "$0")/.."

prefix="${ROLLBACK_IMAGE_PREFIX:-homecare}"
for s in app migrate; do
  docker image inspect "${prefix}-$s:previous" > /dev/null 2>&1 || { echo "Нет образа ${prefix}-$s:previous — откатывать не на что"; exit 1; }
done
for s in app migrate; do docker tag "${prefix}-$s:previous" "${prefix}-$s:latest"; done
echo "Образы переключены: ${prefix}-{app,migrate}:latest → :previous"

if [ -z "${ROLLBACK_SKIP_COMPOSE:-}" ]; then
  # Без migrate: миграции старой версии не запускаем поверх новой схемы
  docker compose up -d --no-build --no-deps app
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2> /dev/null)" = healthy ] && break
    sleep 5
  done
  deploy/smoke.sh "$@" || true
fi

echo "Откат выполнен. Код в /opt/ihelp.am остался новым: следующий deploy/update.sh снова соберёт его —"
echo "сначала исправьте проблему или верните код: git revert <коммит>."
