#!/usr/bin/env bash
# Выкладка одной протестированной задачи — единственный путь в прод и для воркера-деплоера, и для чата-деплоера.
#   scripts/deploy-task.sh <КЛЮЧ>
# Порядок: одна выкладка за раз (замок) → основная копия чистая и на main → протестирован именно текущий коммит
# ветки → слияние → бэкап, если есть миграция → deploy/update.sh (сборка, запуск, smoke) → push и «Сделано» с доказательством.
# Провал: сборка упала — прод не тронут; smoke упал — deploy/rollback.sh. В обоих случаях локальный main
# возвращается назад (в origin ничего не ушло), задача возвращается на доработку с причиной, ошибка — в тех-чат.
# Код возврата: 0 — выложено, 1 — выкладка не прошла, 2 — задача возвращена (конфликт, не тот коммит), 3 — нельзя начать.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 3
KEY="${1:-}"
[ -n "$KEY" ] || { echo "Использование: scripts/deploy-task.sh <КЛЮЧ> [--no-test]"; exit 3; }
# --no-test — только для человека или чата-деплоера, который проверил сам; воркеру (CC_WORKER=1) недоступен
NOTEST=""
[ "${2:-}" = "--no-test" ] && [ -z "${CC_WORKER:-}" ] && NOTEST=1
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
head=$(git rev-parse --verify -q "origin/$branch") || stop "Ветки $branch нет в репозитории"
if [ -z "$NOTEST" ] && { [ -z "$tested" ] || [[ "$head" != "$tested"* ]]; }; then
  stop "Проверен коммит «${tested:-никакой}», а в ветке $head — сначала тестировщик" 2
fi
tested_label="Протестирован коммит ${tested:0:10}."
[ -n "$NOTEST" ] && tested_label="Без отметки тестировщика (--no-test): проверял деплоер."

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
echo "▶ $KEY: слияние $merge, лог $log"

if grep -q '^prisma/migrations/' <<< "$changed"; then
  echo "▶ Есть миграция — бэкап перед выкладкой"
  if ! timeout 900 docker compose exec -T backup sh /backup.sh once >> "$log" 2>&1; then
    git reset -q --hard "$prev"
    cc note "$KEY" "Автовыкладка отменена: бэкап перед миграцией не снялся. Прод не тронут." --error
    stop "Бэкап не снялся — выкладку не начинаю" 1
  fi
fi

fail() {
  local why="$1"
  local rolled="прод не тронут (сборка не дошла до запуска)"
  if grep -q '▶ 4/6' "$log"; then
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
deploy/update.sh >> "$log" 2>&1 || fail "deploy/update.sh завершился с ошибкой"
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
migr=$(grep -q '^prisma/migrations/' <<< "$changed" && echo " Миграция применена, бэкап снят перед ней." || echo "")
cc done "$KEY" --sha "$merge" "Автовыкладка ${merge:0:10}: SMOKE OK (${checks} проверок, соседних сайтов отвечают: ${neighbors}).${migr} ${tested_label} Слияние ${pushed}. Лог: /opt/ihelp.am/${log}"
[ "$pushed" = "отправлено в origin/main" ] || cc note "$KEY" "$pushed" --error
echo "DEPLOY OK $merge"
