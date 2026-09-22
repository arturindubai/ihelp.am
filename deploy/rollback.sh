#!/usr/bin/env bash
# Откат приложения на образы, сохранённые deploy/update.sh перед последним обновлением.
#   deploy/rollback.sh [URL соседних сайтов для проверки]
# База данных НЕ откатывается. Если обновление меняло схему базы и старая версия с ней несовместима —
# восстановите бэкап, снятый перед обновлением (README → «Бэкапы»).
set -euo pipefail
cd "$(dirname "$0")/.."

for s in app migrate; do
  docker image inspect "homecare-$s:previous" > /dev/null 2>&1 || { echo "Нет образа homecare-$s:previous — откатывать не на что"; exit 1; }
done
for s in app migrate; do docker tag "homecare-$s:previous" "homecare-$s:latest"; done

# Без migrate: миграции старой версии не запускаем поверх новой схемы
docker compose up -d --no-build --no-deps app
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2> /dev/null)" = healthy ] && break
  sleep 5
done
deploy/smoke.sh "$@" || true

echo "Откат выполнен. Код в /opt/ihelp.am остался новым: следующий deploy/update.sh снова соберёт его —"
echo "сначала исправьте проблему или верните код: git revert <коммит>."
