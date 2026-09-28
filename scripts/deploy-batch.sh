#!/usr/bin/env bash
# Выкладка пачкой: несколько протестированных задач одной сборкой.
#   scripts/deploy-batch.sh KEY1 [KEY2 ...] [--no-test]
#
# Алгоритм:
#   1. Проверить каждую задачу (статус, testedSha, ветка); разделить на безопасные и рискованные.
#      Рискованные (миграция базы или правки скриптов выкладки / диспетчера) — выкладываются отдельно.
#   2. Безопасные: слить ветки по очереди; ветка с конфликтом — исключается, возвращается разработчику.
#   3. На результате слияния запустить scripts/check.sh; при провале — делить пополам и проверять снова.
#   4. Одна сборка, один перезапуск, один smoke на всю пачку.
#   5. Провал smoke: откат всей пачки + освободить замок + выкладка каждой задачи отдельно (deploy-task.sh).
#   6. Закрыть каждую задачу пачки с общим коммитом и логом.
#   7. Рискованные задачи — отдельно через deploy-task.sh.
#
# Код возврата: 0 — всё выложено, 1 — частичный провал, 2 — нельзя начать (замок, не на main и т. п.).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

KEYS=()
NOTEST=""
for arg in "$@"; do
  if [ "$arg" = "--no-test" ]; then
    [ -z "${CC_WORKER:-}" ] && NOTEST=1
  else
    KEYS+=("$arg")
  fi
done

[ ${#KEYS[@]} -gt 0 ] || { echo "Использование: scripts/deploy-batch.sh KEY1 [KEY2 ...] [--no-test]"; exit 2; }
[ ${#KEYS[@]} -eq 1 ] && { echo "▶ Одна задача — используем deploy-task.sh"; exec scripts/deploy-task.sh "${KEYS[0]}" ${NOTEST:+--no-test}; }

AGENT="${CC_AGENT:-deployer}"
cc() { node scripts/cc.mjs "$@" --agent "$AGENT"; }
stop() { echo "✗ $1"; exit 2; }

# Только из основной копии: рабочая копия задачи или песочница пересобрала бы прод
[ "$(pwd -P)" = /opt/ihelp.am ] && [ "$(git rev-parse --git-dir)" = .git ] || stop "Выкладка — только из основной копии /opt/ihelp.am"
mkdir -p data/deploys
exec 9> data/deploy.lock
flock -n 9 || stop "Уже идёт другая выкладка — жду своей очереди в следующий раз"

[ "$(git branch --show-current)" = main ] || stop "Основная копия не на main — выкладку не начинаю"
[ -z "$(git status --porcelain)" ] || stop "В основной копии незакоммиченные изменения — выкладку не начинаю"
git fetch -q origin || stop "Нет связи с GitHub"
git merge --ff-only -q origin/main || stop "Локальный main разошёлся с origin/main — нужен человек"

prod_marker=$(< src/lib/deploy-marker.txt)
prev=$(git rev-parse HEAD)
log="data/deploys/batch-$(date +%Y%m%d-%H%M%S).log"
echo "▶ Пачка [${KEYS[*]}], лог $log"

# ─── Шаг 1: проверить задачи, разделить на безопасные и рискованные ───────────
VALID_KEYS=()
RISKY_KEYS=()
SKIP_KEYS=()

for KEY in "${KEYS[@]}"; do
  card=$(node scripts/cc.mjs show "$KEY" --json 2>/dev/null) || { echo "! $KEY не найдена — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }
  task_status=$(jq -r '.task.status' <<< "$card")
  tested=$(jq -r '.task.testedSha // ""' <<< "$card")
  branch="task/$KEY"

  [ "$task_status" = review ] || { echo "! $KEY не на проверке (статус $task_status) — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }

  head=$(git rev-parse --verify -q "origin/$branch" 2>/dev/null) || { echo "! $KEY: ветки $branch нет в репозитории — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }

  if [ -z "$NOTEST" ] && { [ -z "$tested" ] || [[ "$head" != "$tested"* ]]; }; then
    echo "! $KEY: проверен «${tested:-никакой}», в ветке $head — нужна проверка тестировщиком, пропускаем"
    SKIP_KEYS+=("$KEY")
    continue
  fi

  # Рискованные: миграции базы или правки скриптов выкладки / диспетчера
  risky_files=$(git diff --name-only "origin/main...origin/$branch" 2>/dev/null \
    | grep -E '^(prisma/migrations/|scripts/deploy-task\.sh|scripts/deploy-batch\.sh|scripts/dispatcher\.mjs|deploy/update\.sh|deploy/rollback\.sh)' \
    || true)

  if [ -n "$risky_files" ]; then
    echo "▶ $KEY рискованная ($(echo "$risky_files" | head -2 | tr '\n' ' ')) — выложим отдельно"
    RISKY_KEYS+=("$KEY")
  else
    VALID_KEYS+=("$KEY")
  fi
done

echo "▶ Безопасных: ${#VALID_KEYS[@]}, рискованных: ${#RISKY_KEYS[@]}, пропущено: ${#SKIP_KEYS[@]}" | tee -a "$log"

# ─── Если безопасных нет — только рискованные поштучно ────────────────────────
if [ ${#VALID_KEYS[@]} -eq 0 ]; then
  echo "▶ Безопасных задач нет — все выкладываем по одной" | tee -a "$log"
  exec 9>&-
  exit_code=0
  for KEY in "${RISKY_KEYS[@]}"; do
    scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1 || exit_code=1
  done
  exit $exit_code
fi

# ─── Шаг 2–3: найти работающий поднабор безопасных задач ──────────────────────
CONFLICT_RETURNED=()
BATCH_RESULT=()

# Попытка смёрджить набор задач; конфликтующие исключаются и возвращаются разработчику
# Записывает имена смёрджанных задач в BATCH_MERGED (глобальный массив)
BATCH_MERGED=()
do_merges() {
  local keys=("$@")
  BATCH_MERGED=()
  git reset -q --hard "$prev"
  for KEY in "${keys[@]}"; do
    local branch="origin/task/$KEY"
    local title
    title=$(node scripts/cc.mjs show "$KEY" --json 2>/dev/null | jq -r '.task.title' 2>/dev/null || echo "$KEY")
    if git merge --no-ff -q "$branch" -m "Слияние пачки task/$KEY: $title" >> "$log" 2>&1; then
      BATCH_MERGED+=("$KEY")
    else
      git merge --abort >> "$log" 2>&1
      # Вернуть только один раз
      local already=false
      for ret in "${CONFLICT_RETURNED[@]:-}"; do [ "$ret" = "$KEY" ] && already=true && break; done
      if ! $already; then
        CONFLICT_RETURNED+=("$KEY")
        local cfiles
        cfiles=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ', ')
        cc return "$KEY" "Конфликт слияния в пачке: ${cfiles%,}. Обновите ветку (git merge origin/main) и сдайте снова." >> "$log" 2>&1 || true
        echo "▶ $KEY конфликт → возвращён разработчику" | tee -a "$log"
      fi
    fi
  done
}

# Найти наибольший работающий поднабор через последовательное двоичное деление
# При провале check.sh делим пополам и пробуем снова
find_deployable() {
  local keys=("$@")
  [ ${#keys[@]} -eq 0 ] && return 1

  do_merges "${keys[@]}"
  [ ${#BATCH_MERGED[@]} -eq 0 ] && return 1

  echo "▶ Смёрджено [${BATCH_MERGED[*]}], проверка типов и тестов..." | tee -a "$log"
  if scripts/check.sh >> "$log" 2>&1; then
    echo "CHECK OK для пачки [${BATCH_MERGED[*]}]" | tee -a "$log"
    BATCH_RESULT=("${BATCH_MERGED[@]}")
    return 0
  fi

  echo "! CHECK FAILED для [${BATCH_MERGED[*]}]" | tee -a "$log"
  git reset -q --hard "$prev"

  [ ${#BATCH_MERGED[@]} -le 1 ] && return 1

  local half=$(( ${#BATCH_MERGED[@]} / 2 ))
  echo "▶ Делим пополам, пробуем первые $half задач" | tee -a "$log"
  find_deployable "${BATCH_MERGED[@]:0:$half}"
}

find_deployable "${VALID_KEYS[@]}"

if [ ${#BATCH_RESULT[@]} -eq 0 ]; then
  echo "✗ Ни одна задача из пачки не прошла check.sh" | tee -a "$log"
  git reset -q --hard "$prev"
  for KEY in "${VALID_KEYS[@]}"; do
    cc note "$KEY" "Пачковая выкладка не начата: check.sh провалился на всём наборе. Задача остаётся на проверке." --error >> "$log" 2>&1 || true
  done
  # Всё равно попробуем рискованные
  exec 9>&-
  exit_code=1
  for KEY in "${RISKY_KEYS[@]}"; do
    scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1 || exit_code=1
  done
  exit $exit_code
fi

echo "▶ Пачка готова к выкладке: [${BATCH_RESULT[*]}]" | tee -a "$log"

# ─── Шаг 4: бэкап при миграции, затем сборка и smoke ─────────────────────────
merge=$(git rev-parse HEAD)
changed=$(git diff --name-only "$prev" "$merge")

backup_file=""
if grep -q '^prisma/migrations/' <<< "$changed"; then
  echo "▶ Есть миграция — бэкап перед выкладкой"
  deploy_label="$(date +%H%M%S)-batch"
  if ! timeout 900 docker compose exec -T backup sh /backup.sh once "$deploy_label" >> "$log" 2>&1; then
    git reset -q --hard "$prev"
    for KEY in "${BATCH_RESULT[@]}"; do
      cc note "$KEY" "Пачковая выкладка отменена: бэкап перед миграцией не снялся. Прод не тронут." --error >> "$log" 2>&1 || true
    done
    echo "✗ Бэкап не снялся — выкладку не начинаю" | tee -a "$log"
    exec 9>&-
    exit 1
  fi
  backup_file=$(grep ' db ok: /backups/' "$log" | tail -n 1 | grep -oE '/backups/db-[^ ]+' | sed 's|^/backups/|backups/|')
fi

# ─── Провал выкладки: откат + поштучная выкладка ──────────────────────────────
fail() {
  local why="$1"
  local rolled="прод не тронут (сборка не дошла до запуска)"
  if grep -qF "$prod_marker" "$log"; then
    echo "▶ Откат на предыдущие образы" | tee -a "$log"
    if deploy/rollback.sh >> "$log" 2>&1; then rolled="прод откатан на предыдущую версию"; else rolled="ОТКАТ НЕ УДАЛСЯ — нужен человек"; fi
  fi
  git reset -q --hard "$prev"
  local tail_txt
  tail_txt=$(grep -E '✗|SMOKE|Error|error' "$log" | tail -n 8)
  for KEY in "${BATCH_RESULT[@]}"; do
    cc note "$KEY" "Пачковая выкладка не прошла: ${why}; ${rolled}. Лог: /opt/ihelp.am/${log}
${tail_txt}" --error 2>/dev/null || true
  done

  echo "▶ Выкладываем задачи пачки по одной — ищем виновника" | tee -a "$log"
  # Освобождаем батч-замок: deploy-task.sh берёт собственный
  exec 9>&-
  local any_ok=false
  for KEY in "${BATCH_RESULT[@]}"; do
    echo "▶ $KEY — отдельно..." | tee -a "$log"
    if scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1; then
      echo "✓ $KEY выложено" | tee -a "$log"
      any_ok=true
    else
      echo "✗ $KEY: не выложено (возможный виновник)" | tee -a "$log"
    fi
  done
  $any_ok && exit 1 || exit 1
}

echo "▶ deploy/update.sh" | tee -a "$log"
DEPLOY_KEY="batch:${BATCH_RESULT[*]}" PREDEPLOY_DONE="${backup_file:+1}" deploy/update.sh >> "$log" 2>&1 || fail "deploy/update.sh завершился с ошибкой"
grep -q '^SMOKE OK' "$log" || fail "smoke-тест не подтвердил SMOKE OK"

if grep -q '^deploy/Caddyfile$' <<< "$changed"; then
  echo "▶ Caddyfile изменился — перезапуск Caddy" | tee -a "$log"
  { docker compose restart caddy && deploy/smoke.sh; } >> "$log" 2>&1 || fail "после перезапуска Caddy smoke-тест не прошёл"
fi

# ─── Шаг 6: отправить main, закрыть каждую задачу ────────────────────────────
pushed="отправлено в origin/main"
git push -q origin main || pushed="ВНИМАНИЕ: push в origin/main не прошёл — прод впереди репозитория"

# Удалить ветки всех задач пачки
for KEY in "${BATCH_RESULT[@]}"; do
  git push -q origin --delete "task/$KEY" 2>/dev/null || true
done

checks=$(grep -c '✓' "$log" 2>/dev/null || echo "?")
neighbors=$(sed -n '/Соседние сайты/,/SMOKE/p' "$log" 2>/dev/null | grep -c '✓' || echo "0")
migr=""
if grep -q '^prisma/migrations/' <<< "$changed"; then
  if [ -n "$backup_file" ]; then
    migr=" Миграция применена, бэкап: /opt/ihelp.am/${backup_file}."
  else
    migr=" Миграция применена, бэкап снят (см. лог)."
  fi
fi
tested_label="Протестированы тестировщиком."
[ -n "$NOTEST" ] && tested_label="Без отметки тестировщика (--no-test)."

batch_size=${#BATCH_RESULT[@]}
done_text="Пачковая выкладка ${merge:0:10}: SMOKE OK (${checks} проверок, соседних сайтов: ${neighbors}, задач в пачке: ${batch_size}).${migr} ${tested_label} Слияние ${pushed}. Лог: /opt/ihelp.am/${log}"

all_done=true
for KEY in "${BATCH_RESULT[@]}"; do
  if ! cc done "$KEY" --sha "$merge" "$done_text"; then
    cc note "$KEY" "cc done не прошла после выкладки коммита ${merge:0:10}: задача не закрыта, нужен человек. Лог: /opt/ihelp.am/${log}" --error 2>/dev/null || true
    echo "✗ cc done не прошла для $KEY — задача выложена, но не закрыта в Control Center" | tee -a "$log"
    all_done=false
  fi
done
[ "$pushed" = "отправлено в origin/main" ] || cc note "${BATCH_RESULT[0]}" "$pushed" --error 2>/dev/null || true

echo "▶ Уборка рабочих копий и образов стендов" | tee -a "$log"
node scripts/cc.mjs gc --agent "$AGENT" 2>&1 | tee -a "$log" || true

# ─── Шаг 7: рискованные задачи — отдельно ────────────────────────────────────
if [ ${#RISKY_KEYS[@]} -gt 0 ]; then
  echo "▶ Теперь рискованные задачи по одной: [${RISKY_KEYS[*]}]" | tee -a "$log"
  exec 9>&-
  risky_exit=0
  for KEY in "${RISKY_KEYS[@]}"; do
    echo "▶ $KEY (рискованная) — отдельно..." | tee -a "$log"
    scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1 || risky_exit=1
  done
  $all_done && [ $risky_exit -eq 0 ] && echo "DEPLOY BATCH OK $merge" || exit 1
else
  $all_done && echo "DEPLOY BATCH OK $merge" || exit 1
fi
