#!/usr/bin/env bash
# Откат приложения на образы :previous по blue-green схеме (без простоя).
# Схема: :previous → :latest → app-next поднимается со старым образом →
#        ждать healthy → остановить app → перезапустить app со старым образом →
#        ждать healthy → остановить app-next.
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

# Переключаем образы: :previous → :latest (app-next будет запущен с этим образом)
for s in app migrate; do docker tag "${prefix}-$s:previous" "${prefix}-$s:latest"; done
echo "Образы переключены: ${prefix}-{app,migrate}:latest → :previous"

if [ -z "${ROLLBACK_SKIP_COMPOSE:-}" ]; then
  # Убрать старый app-next если есть (мог остаться от прерванного деплоя),
  # кроме случая когда он запущен и принимает трафик
  _anext_was_running=false
  if docker inspect homecare-app-next-1 >/dev/null 2>&1; then
    _anext_was_running="$(docker inspect -f '{{.State.Running}}' homecare-app-next-1 2>/dev/null || echo false)"
    if [ "$_anext_was_running" != "true" ]; then
      docker compose --profile deploy rm -f -s app-next 2>/dev/null || true
      _anext_was_running=false
    fi
  fi

  if [ "$_anext_was_running" = "true" ]; then
    # app-next уже запущен и принимает трафик (прерванный деплой).
    # app перезапускаем с образом :previous (уже назначен как :latest).
    echo "  app-next уже запущен — перезапускаем app с образом :previous"
    docker compose stop app 2>/dev/null || true
    docker compose up --no-build --no-deps -d app
    _app_ok=0
    for _ in $(seq 1 15); do
      [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2>/dev/null)" = healthy ] && _app_ok=1 && break
      sleep 5
    done
    docker compose --profile deploy rm -f -s app-next 2>/dev/null || true
    if [ "$_app_ok" -ne 1 ]; then echo "⚠ app не стал healthy за 75 с — проверьте логи"; fi
  else
    # Нормальный откат: запускаем app-next со старым образом (:latest = :previous),
    # ждём healthy, останавливаем app, перезапускаем app, останавливаем app-next.
    echo "  запускаем app-next с образом :previous"
    docker compose --profile deploy up --no-build --no-deps -d app-next
    _anext_ok=0
    for _ in $(seq 1 15); do
      [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-next-1 2>/dev/null)" = healthy ] && _anext_ok=1 && break
      sleep 5
    done

    if [ "$_anext_ok" -eq 1 ]; then
      echo "  ✓ app-next healthy — Caddy переключится на него пока app перезапускается"
      docker compose stop app
      docker compose up --no-build --no-deps -d app
      for _ in $(seq 1 15); do
        [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2>/dev/null)" = healthy ] && break
        sleep 5
      done
      docker compose --profile deploy rm -f -s app-next
      echo "  ✓ app healthy — откат завершён без простоя"
    else
      # app-next не стал healthy — откатываем напрямую (возможен кратковременный простой)
      echo "  ⚠ app-next не готов — откат напрямую (без blue-green)"
      docker compose --profile deploy rm -f -s app-next 2>/dev/null || true
      # Без migrate: миграции старой версии не запускаем поверх новой схемы
      docker compose up --no-build --no-deps -d app
      for _ in $(seq 1 15); do
        [ "$(docker inspect -f '{{.State.Health.Status}}' homecare-app-1 2>/dev/null)" = healthy ] && break
        sleep 5
      done
    fi
  fi

  deploy/smoke.sh "$@" || true
fi

echo "Откат выполнен. Код в /opt/ihelp.am остался новым: следующий deploy/update.sh снова соберёт его —"
echo "сначала исправьте проблему или верните код: git revert <коммит>."
