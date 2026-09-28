#!/usr/bin/env bash
# Выкладка одной протестированной задачи — единственный путь в прод и для воркера-деплоера, и для чата-деплоера.
#   scripts/deploy-task.sh <КЛЮЧ> [--no-test [причина]] [--force-own причина]
# Порядок: одна выкладка за раз (замок) → основная копия чистая и на main → протестирован именно текущий коммит
# ветки → слияние → бэкап, если есть миграция → deploy/update.sh (сборка, запуск, smoke) → push и «Сделано» с доказательством.
# Провал: сборка упала — прод не тронут; smoke упал — deploy/rollback.sh. В обоих случаях локальный main
# возвращается назад (в origin ничего не ушло), задача возвращается на доработку с причиной, ошибка — в тех-чат.
# Код возврата: 0 — выложено, 1 — выкладка не прошла, 2 — задача возвращена (конфликт, не тот коммит), 3 — нельзя начать.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 3
KEY="${1:-}"
[ -n "$KEY" ] || { echo "Использование: scripts/deploy-task.sh <КЛЮЧ> [--no-test [причина]] [--force-own причина]"; exit 3; }
shift

# --no-test — только для человека или чата-деплоера, который проверил сам; воркеру (CC_WORKER=1) недоступен
# --no-test причина — при включённом пуле тестировщика причина обязательна и записывается в ленту
# --force-own причина — обход проверки «автор не выкладывает свою задачу»; только владелец (agentname=owner*)
NOTEST=""
NOTEST_REASON=""
FORCE_OWN=""
FORCE_OWN_REASON=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-test)
      [ -z "${CC_WORKER:-}" ] && NOTEST=1
      if [ $# -ge 2 ] && [ -n "${2:-}" ] && [[ "${2:-}" != --* ]]; then
        NOTEST_REASON="${2:-}"; shift
      fi
      ;;
    --force-own)
      if [ $# -ge 2 ] && [ -n "${2:-}" ] && [[ "${2:-}" != --* ]]; then
        FORCE_OWN=1; FORCE_OWN_REASON="${2:-}"; shift
      else
        echo "✗ --force-own требует причину: --force-own \"причина\""; exit 3
      fi
      ;;
  esac
  shift
done

AGENT="${CC_AGENT:-deployer}"
cc() { node scripts/cc.mjs "$@" --agent "$AGENT"; }
stop() { echo "✗ $1"; exit "${2:-3}"; }

# Только основная копия: из рабочей копии задачи или песочницы docker compose пересобрал бы прод чужим кодом
[ "$(pwd -P)" = /opt/ihelp.am ] && [ "$(git rev-parse --git-dir)" = .git ] || stop "Выкладка — только из основной копии /opt/ihelp.am"
mkdir -p data/deploys
exec 9> data/deploy.lock
flock -n 9 || stop "Уже идёт другая выкладка — жду своей очереди в следующий раз"

[ "$(git branch --show-current)" = main ] || stop "Основная копия не на main — выкладку не начинаю"
[ -z "$(git status --porcelain)" ] || stop "В основной копии незакоммиченные изменения (чужая работа?) — выкладку не начинаю"
git fetch -q origin || stop "Нет связи с GitHub"
git merge --ff-only -q origin/main || stop "Локальный main разошёлся с origin/main — нужен человек"

branch="task/$KEY"
card=$(node scripts/cc.mjs show "$KEY" --json) || stop "Задача $KEY не найдена"
status=$(jq -r '.task.status' <<< "$card")
tested=$(jq -r '.task.testedSha // ""' <<< "$card")
title=$(jq -r '.task.title' <<< "$card")
[ "$status" = review ] || stop "Задача $KEY не на проверке (статус $status)"

# Кто сдал задачу на проверку — автор последнего report-комментария
review_author=$(jq -r '[.comments[] | select(.kind == "report")] | last | .author // ""' <<< "$card")

# Автор задачи не выкладывает свою задачу: правило 4 из DEV_SYSTEM.md
if [ -n "$review_author" ] && [ "$AGENT" = "$review_author" ]; then
  if [ -z "$FORCE_OWN" ]; then
    stop "Автор задачи «$review_author» не может выкладывать свою же задачу $KEY — нарушение правила «кто пишет, тот не выкладывает». Обход — только владелец: --force-own \"причина\"" 3
  fi
  # Проверяем, что обход делает именно владелец (имя агента начинается с owner)
  agent_prefix="${AGENT%%[-_.]*}"
  if [ "${agent_prefix,,}" != "owner" ]; then
    stop "--force-own доступен только владельцу (CC_AGENT=owner…), текущий агент: $AGENT. Попросите владельца выложить вручную." 3
  fi
  cc note "$KEY" "⚠ Выкладку делает автор задачи ($AGENT). Обход правила «кто пишет, тот не выкладывает» — причина: $FORCE_OWN_REASON"
fi

head=$(git rev-parse --verify -q "origin/$branch") || stop "Ветки $branch нет в репозитории"

# Проверка тестировщика; если пул тестировщика включён — --no-test требует явной причины
if [ -n "$NOTEST" ]; then
  tester_pool_active=""
  node scripts/cc.mjs pool tester >/dev/null 2>&1 && tester_pool_active=1 || true
  if [ -n "$tester_pool_active" ] && [ -z "$NOTEST_REASON" ]; then
    stop "Пул тестировщика включён — --no-test требует причины: --no-test \"причина\"" 3
  fi
elif { [ -z "$tested" ] || [[ "$head" != "$tested"* ]]; }; then
  stop "Проверен коммит «${tested:-никакой}», а в ветке $head — сначала тестировщик" 2
fi

tested_label="Протестирован коммит ${tested:0:10}."
if [ -n "$NOTEST" ]; then
  if [ -n "$NOTEST_REASON" ]; then
    tested_label="Без отметки тестировщика (--no-test). Причина: $NOTEST_REASON"
    cc note "$KEY" "--no-test: пропущена проверка тестировщика. Причина: $NOTEST_REASON. Деплоер: $AGENT."
  else
    tested_label="Без отметки тестировщика (--no-test): проверял деплоер."
  fi
fi

prev=$(git rev-parse HEAD)
if ! git merge --no-ff -q "origin/$branch" -m "Слияние $branch: $title"; then
  files=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
  git merge --abort
  cc return "$KEY" "Конфликт при слиянии с main: ${files}. Обновите ветку от свежего main (git merge origin/main), проверьте и сдайте снова."
  stop "Конфликт при слиянии — задача возвращена" 2
fi
merge=$(git rev-parse HEAD)
changed=$(git diff --name-only "$prev" "$merge")
log="data/deploys/$KEY-$(date +%Y%m%d-%H%M%S).log"
prod_marker=$(< src/lib/deploy-marker.txt)
echo "▶ $KEY: слияние $merge, лог $log"

backup_file=""
if grep -q '^prisma/migrations/' <<< "$changed"; then
  echo "▶ Есть миграция — бэкап перед выкладкой"
  deploy_label="$(date +%H%M%S)-$KEY"
  if ! timeout 900 docker compose exec -T backup sh /backup.sh once "$deploy_label" >> "$log" 2>&1; then
    git reset -q --hard "$prev"
    cc note "$KEY" "Автовыкладка отменена: бэкап перед миграцией не снялся. Прод не тронут." --error
    stop "Бэкап не снялся — выкладку не начинаю" 1
  fi
  backup_file=$(grep ' db ok: /backups/' "$log" | tail -n 1 | grep -oE '/backups/db-[^ ]+' | sed 's|^/backups/|backups/|')
fi

fail() {
  local why="$1"
  local rolled="прод не тронут (сборка не дошла до запуска)"
  if grep -qF "$prod_marker" "$log"; then
    echo "▶ Откат на предыдущие образы"
    if deploy/rollback.sh >> "$log" 2>&1; then rolled="прод откатан на предыдущую версию (deploy/rollback.sh)"; else rolled="ОТКАТ НЕ УДАЛСЯ — нужен человек"; fi
  fi
  git reset -q --hard "$prev"
  local tail_txt
  tail_txt=$(grep -E '✗|SMOKE|Error|error' "$log" | tail -n 8)
  cc note "$KEY" "Автовыкладка не прошла: ${why}; ${rolled}. Лог: /opt/ihelp.am/${log}
${tail_txt}" --error
  cc return "$KEY" "Выкладка не прошла: ${why}; ${rolled}. Причина — в ленте (ошибка) и в логе ${log}. Исправьте и сдайте снова."
  echo "✗ $why; $rolled"
  exit 1
}

echo "▶ deploy/update.sh"
# DEPLOY_KEY передаётся для метки бэкапа; PREDEPLOY_DONE=1 — если бэкап уже снят при миграции
DEPLOY_KEY="$KEY" PREDEPLOY_DONE="${backup_file:+1}" deploy/update.sh >> "$log" 2>&1 || fail "deploy/update.sh завершился с ошибкой"
grep -q '^SMOKE OK' "$log" || fail "smoke-тест не подтвердил SMOKE OK"
if grep -q '^deploy/Caddyfile$' <<< "$changed"; then
  # Caddyfile подключён к контейнеру файлом: без перезапуска Caddy работает со старой версией
  echo "▶ Caddyfile изменился — перезапуск Caddy"
  { docker compose restart caddy && deploy/smoke.sh; } >> "$log" 2>&1 || fail "после перезапуска Caddy smoke-тест не прошёл"
fi

pushed="отправлено в origin/main"
git push -q origin main || pushed="ВНИМАНИЕ: push в origin/main не прошёл — прод впереди репозитория"
git push -q origin --delete "$branch" 2> /dev/null || true
checks=$(grep -c '✓' "$log")
neighbors=$(sed -n '/Соседние сайты/,/SMOKE/p' "$log" | grep -c '✓')
migr=""
if grep -q '^prisma/migrations/' <<< "$changed"; then
  if [ -n "$backup_file" ]; then
    migr=" Миграция применена, бэкап: /opt/ihelp.am/${backup_file}."
  else
    migr=" Миграция применена, бэкап снят (см. лог)."
  fi
fi
done_text="Деплоер: $AGENT. Автовыкладка ${merge:0:10}: SMOKE OK (${checks} проверок, соседних сайтов отвечают: ${neighbors}).${migr} ${tested_label} Слияние ${pushed}. Лог: /opt/ihelp.am/${log}"
if ! cc done "$KEY" --sha "$merge" "$done_text"; then
  # Прод уже выложен, но закрыть задачу не удалось — записываем ошибку и уходим с ненулевым кодом.
  # cc note --error с агентом deployer автоматически отправляет тех-алерт (ccWork.ts).
  cc note "$KEY" "cc done не прошла после выкладки коммита ${merge:0:10}: задача не закрыта, нужен человек. Лог: /opt/ihelp.am/${log}" --error 2>/dev/null || true
  echo "✗ cc done не прошла — задача выложена, но не закрыта в Control Center. Нужна ручная команда:"
  echo "  cc done $KEY --sha $merge \"$done_text\""
  exit 1
fi
[ "$pushed" = "отправлено в origin/main" ] || cc note "$KEY" "$pushed" --error
echo "▶ Уборка рабочих копий и образов стендов"
node scripts/cc.mjs gc --agent "$AGENT" 2>&1 | tee -a "$log" || true
echo "DEPLOY OK $merge"
