#!/usr/bin/env bash
# Выкладка в собственном юните systemd. Подключается из deploy-task.sh и deploy-batch.sh:
#   . scripts/deploy-unit.sh; deploy_in_unit "$0" "$@"
#
# Зачем. Воркер-деплоер живёт в своём юните systemd. Когда он завершает ход или упирается в лимит времени,
# systemd убивает всё, что он запустил, — 29.09.2026 так оборвалась выкладка DEV-85 посреди сборки.
# Пачка длится дольше 10 минут (предел одной команды воркера), поэтому обрыв повторялся бы каждый раз.
# Здесь скрипт переносит себя в отдельный юнит ihelp-deploy-…, а вызвавший процесс только следит за выводом.
# Убит вызвавший — выкладка доходит до конца. Повторный вызов при идущей выкладке вторую не начинает:
# показывает вывод идущей и дожидается её конца.
#
# Если перенос не удался (нет systemd, отказ systemd-run), выкладка идёт по-старому, в вызвавшем процессе:
# сама эта защита выкладку не останавливает.

# Корень — всегда основная копия; переменная оставлена для проверки самого механизма в песочнице
: "${DEPLOY_ROOT:=/opt/ihelp.am}"
DEPLOY_UNIT_STATE="$DEPLOY_ROOT/data/deploys/current-unit"

# Следить за юнитом до конца и вернуть его код. Нет файла с кодом — выкладка оборвана, код 1.
deploy_unit_follow() {
  local unit="$1" out="$2" tp code
  tail -n +1 -F "$out" 2> /dev/null &
  tp=$!
  while systemctl is-active --quiet "$unit" 2> /dev/null; do sleep 2; done
  sleep 1
  { kill "$tp"; wait "$tp"; } 2> /dev/null
  code=$(cat "$DEPLOY_ROOT/data/deploys/$unit.exit" 2> /dev/null)
  if ! [[ "$code" =~ ^[0-9]+$ ]]; then
    echo "✗ Выкладка в юните $unit оборвалась: кода возврата нет"
    code=1
  fi
  return "$code"
}

deploy_in_unit() {
  local self="$1"
  shift
  # Уже внутри юнита: при выходе записать код возврата — и работать дальше.
  # Вложенные вызовы (пачка запускает deploy-task.sh) код не пишут: итог пачки пишет сама пачка.
  if [ -n "${IHELP_DEPLOY_UNIT:-}" ]; then
    if [ -z "${IHELP_DEPLOY_TOP:-}" ] || [ "$IHELP_DEPLOY_TOP" = "$$" ]; then
      export IHELP_DEPLOY_TOP=$$
      trap 'echo $? > "$DEPLOY_ROOT/data/deploys/$IHELP_DEPLOY_UNIT.exit"' EXIT
    fi
    return 0
  fi
  [ -z "${DRY_RUN:-}" ] || return 0
  command -v systemd-run > /dev/null 2>&1 && [ -d /run/systemd/system ] || return 0
  # Не основная копия — отказ даст основная проверка скрипта, юнит не нужен
  [ "$(pwd -P)" = "$DEPLOY_ROOT" ] || return 0
  mkdir -p "$DEPLOY_ROOT/data/deploys"
  find "$DEPLOY_ROOT/data/deploys" -maxdepth 1 -name 'ihelp-deploy-*' -mtime +14 -delete 2> /dev/null || true

  local unit="" out=""
  # Выкладка уже идёт — дождаться её, вторую не начинать
  if [ -f "$DEPLOY_UNIT_STATE" ]; then
    read -r unit out < "$DEPLOY_UNIT_STATE" || true
    if [ -n "$unit" ] && [ -n "$out" ] && systemctl is-active --quiet "$unit" 2> /dev/null; then
      echo "▶ Выкладка уже идёт (юнит $unit) — вторую не начинаю, дожидаюсь идущей. Её вывод с начала:"
      deploy_unit_follow "$unit" "$out"
      exit $?
    fi
  fi

  unit="ihelp-deploy-$(date +%Y%m%d-%H%M%S)"
  out="$DEPLOY_ROOT/data/deploys/$unit.out"
  : > "$out"
  # В окружение юнита — только то, что нужно скриптам; ключей и токенов среди этого нет
  local envs=("--setenv=IHELP_DEPLOY_UNIT=$unit") v
  for v in HOME PATH CC_AGENT CC_WORKER DEPLOY_ROOT; do
    [ -n "${!v:-}" ] && envs+=("--setenv=$v")
  done
  if systemd-run --quiet --collect --unit="$unit" --working-directory="$DEPLOY_ROOT" \
    -p RuntimeMaxSec=10800 -p Nice=10 -p IOSchedulingClass=best-effort -p IOSchedulingPriority=7 \
    -p "StandardOutput=append:$out" -p "StandardError=append:$out" "${envs[@]}" \
    /bin/bash "$DEPLOY_ROOT/scripts/$(basename "$self")" "$@"; then
    echo "$unit $out" > "$DEPLOY_UNIT_STATE"
    deploy_unit_follow "$unit" "$out"
    exit $?
  fi
  echo "! Не удалось перенести выкладку в отдельный юнит — продолжаю в текущем процессе"
  rm -f "$out"
  return 0
}

# След оборванной выкладки: main впереди origin/main. Слияния незакрытых задач убираем — в origin они не уходили,
# на доске задачи не закрыты, деплоер выложит их заново. Если среди слияний есть закрытые задачи — значит,
# прошлый push не прошёл: пробуем ещё раз, при неудаче предупреждаем и продолжаем, как раньше.
deploy_recover_main() {
  local ahead keys k st open=1
  ahead=$(git rev-list --count origin/main..main 2> /dev/null) || return 0
  [ "${ahead:-0}" -gt 0 ] || return 0
  keys=$(git log --merges --first-parent --format=%s origin/main..main | sed -n 's/^Слияние task\/\([A-Z][A-Z0-9]*-[0-9A-Za-z]*\).*/\1/p' | sort -u)
  if [ -z "$keys" ]; then
    echo "! main впереди origin/main на $ahead коммитов, слияний задач среди них нет — не трогаю"
    return 0
  fi
  for k in $keys; do
    st=$(node scripts/cc.mjs show "$k" --json 2> /dev/null | jq -r '.task.status // ""' 2> /dev/null)
    [ "$st" = done ] && open=""
  done
  if [ -n "$open" ]; then
    echo "▶ След оборванной выкладки: в main остались слияния незакрытых задач ($(echo $keys)) — возвращаю main к origin/main"
    git reset -q --hard origin/main
  else
    echo "▶ main впереди origin/main, среди слияний есть закрытые задачи — отправляю main в origin"
    git push -q origin main || echo "! push в origin/main не прошёл — прод впереди репозитория, продолжаю"
  fi
  return 0
}
