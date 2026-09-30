#!/usr/bin/env bash
# Выкладка пачкой: несколько протестированных задач одной сборкой.
#   scripts/deploy-batch.sh KEY1 [KEY2 ...] [--no-test] [--dry-run]
#
# Флаг --dry-run: проверка плана пачки без выкладки. Работает во временной рабочей копии
#   (git worktree на origin/main), сливает ветки, гоняет scripts/check.sh на результате,
#   делит при провале и печатает план: что войдёт в пачку, что исключено и почему, что
#   пошло бы отдельно. Доску задач не трогает, deploy/update.sh не вызывает, временную
#   копию удаляет. Принимает ветки по KEY: задача должна быть на проверке или иметь ветку
#   task/KEY (origin или локальную). При --dry-run статус задачи — предупреждение, не стоп.
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
DRY_RUN=""
for arg in "$@"; do
  if [ "$arg" = "--no-test" ]; then
    [ -z "${CC_WORKER:-}" ] && NOTEST=1
  elif [ "$arg" = "--dry-run" ]; then
    DRY_RUN=1
  else
    KEYS+=("$arg")
  fi
done

[ ${#KEYS[@]} -gt 0 ] || { echo "Использование: scripts/deploy-batch.sh KEY1 [KEY2 ...] [--no-test] [--dry-run]"; exit 2; }
[ ${#KEYS[@]} -eq 1 ] && [ -z "$DRY_RUN" ] && { echo "▶ Одна задача — используем deploy-task.sh"; exec scripts/deploy-task.sh "${KEYS[0]}" ${NOTEST:+--no-test}; }

# Выкладка идёт в собственном юните systemd и не гибнет вместе с вызвавшим её воркером (scripts/deploy-unit.sh).
# Пробный прогон (--dry-run) остаётся в вызвавшем процессе.
[ -f scripts/deploy-unit.sh ] && . scripts/deploy-unit.sh && deploy_in_unit "$0" "$@"

AGENT="${CC_AGENT:-deployer}"
cc() { node scripts/cc.mjs "$@" --agent "$AGENT"; }
stop() { echo "✗ $1"; exit 2; }

# Настройка git merge driver для автоматического слияния файлов переводов (идемпотентно)
git config merge.translations.name "Слияние файлов переводов JSON"
git config merge.translations.driver "node scripts/merge-translations.mjs %O %A %B"

# Переменные для dry-run (заполняются при DRY_RUN=1)
DRY_TMPWT=""
DRY_LOG=""
DRY_CHECK_FAILED=()
DRY_ORIG_DIR=""

cleanup_dryrun() {
  [ -z "$DRY_TMPWT" ] && return
  cd "$DRY_ORIG_DIR" 2>/dev/null || cd / 2>/dev/null || true
  git -C "$DRY_ORIG_DIR" worktree remove --force "$DRY_TMPWT" 2>/dev/null || true
  rm -rf "$DRY_TMPWT"
  [ -n "${DRY_LOG:-}" ] && rm -f "$DRY_LOG" || true
}

if [ -n "$DRY_RUN" ]; then
  # Режим проверки без выкладки: временная рабочая копия, прод и доска не трогаются
  echo "▶ [DRY-RUN] Проверка пачки [${KEYS[*]}] без выкладки"
  git fetch -q origin || stop "Нет связи с GitHub"
  DRY_ORIG_DIR="$(pwd -P)"
  mkdir -p "$DRY_ORIG_DIR/data/tmp"
  DRY_TMPWT=$(mktemp -d "$DRY_ORIG_DIR/data/tmp/dryrun-batch-XXXXXX")
  git worktree add --detach -q "$DRY_TMPWT" origin/main 2>/dev/null \
    || { rm -rf "$DRY_TMPWT"; stop "Не удалось создать временную рабочую копию"; }
  trap cleanup_dryrun EXIT
  cd "$DRY_TMPWT" || stop "Не удалось перейти во временную рабочую копию"
  # В режиме проверки cc-вызовы не меняют доску — только пишут в лог
  cc() { echo "  [dry-run: cc $*]"; }
  # Открываем dummy fd 9 — чтобы exec 9>&- в путях ниже не давал ошибку
  exec 9>/dev/null
  prev=$(git rev-parse HEAD)
  DRY_LOG=$(mktemp "$DRY_ORIG_DIR/data/tmp/dryrun-log-XXXXXX.log")
  log="$DRY_LOG"
  echo "▶ [DRY-RUN] Временная копия: $DRY_TMPWT (origin/main @${prev:0:10})"
else
  # Только из основной копии: рабочая копия задачи или песочница пересобрала бы прод
  [ "$(pwd -P)" = /opt/ihelp.am ] && [ "$(git rev-parse --git-dir)" = .git ] || stop "Выкладка — только из основной копии /opt/ihelp.am"
  mkdir -p data/deploys
  exec 9> data/deploy.lock
  flock -n 9 || stop "Уже идёт другая выкладка — жду своей очереди в следующий раз"

  [ "$(git branch --show-current)" = main ] || stop "Основная копия не на main — выкладку не начинаю"
  # Неотслеживаемые файлы (??) убираем в сторону — они выкладке не мешают.
  # Изменённые отслеживаемые файлы (M, D и т.п.) останавливают выкладку: это чья-то работа.
  _porcelain=$(git status --porcelain)
  if [ -n "$_porcelain" ]; then
    _tracked=$(printf '%s\n' "$_porcelain" | grep -v '^?? ' || true)
    [ -n "$_tracked" ] && stop "В основной копии незакоммиченные изменения — выкладку не начинаю"
    _stray_dir="data/tmp/stray/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$_stray_dir"
    _stray_list=""
    while IFS= read -r _stray_line; do
      [ -z "$_stray_line" ] && continue
      _fp="${_stray_line:3}"
      _fp="${_fp%/}"
      _dest_dir="$_stray_dir/$(dirname "$_fp")"
      mkdir -p "$_dest_dir"
      if mv "$_fp" "$_dest_dir/"; then
        _stray_list="${_stray_list} ${_fp}"
        echo "▶ Лишний файл убран в сторону: $_fp → ${_dest_dir}/"
      else
        stop "Не удалось убрать лишний файл из основной копии: $_fp"
      fi
    done < <(printf '%s\n' "$_porcelain" | grep '^?? ' || true)
    echo "▶ Лишние файлы перенесены в $_stray_dir:${_stray_list}"
    for _sk in "${KEYS[@]}"; do
      cc note "$_sk" "Пачковая выкладка: перед стартом убраны неотслеживаемые файлы в ${_stray_dir}:${_stray_list}" 2>/dev/null || true
    done
  fi
  git fetch -q origin || stop "Нет связи с GitHub"
  declare -F deploy_recover_main > /dev/null && deploy_recover_main
  git merge --ff-only -q origin/main || stop "Локальный main разошёлся с origin/main — нужен человек"

  prod_marker=$(< src/lib/deploy-marker.txt)
  prev=$(git rev-parse HEAD)
  log="data/deploys/batch-$(date +%Y%m%d-%H%M%S).log"
  echo "▶ Пачка [${KEYS[*]}], лог $log"
fi

# ─── Шаг 1: проверить задачи, разделить на безопасные и рискованные ───────────
VALID_KEYS=()
RISKY_KEYS=()
SKIP_KEYS=()
PREMERGED_KEYS=()

for KEY in "${KEYS[@]}"; do
  branch="task/$KEY"

  if [ -n "$DRY_RUN" ]; then
    # В dry-run: ветка обязательна (origin или локальная), CC статус — предупреждение
    head=$(git rev-parse --verify -q "origin/$branch" 2>/dev/null) \
      || head=$(git rev-parse --verify -q "$branch" 2>/dev/null) \
      || {
        # Ветки нет — ищем существующее слияние в origin/main (задача выложена в другой пачке)
        found_sha=$(git log --merges --first-parent --format="%H %s" origin/main \
          | grep -m1 -E " Слияние (пачки )?task/${KEY}:" | awk '{print $1}')
        if [ -n "${found_sha:-}" ]; then
          echo "▶ [DRY-RUN] $KEY уже влита в origin/main (${found_sha:0:10}) — будет закрыта без сборки"
          PREMERGED_KEYS+=("$KEY:$found_sha")
        else
          echo "▶ [DRY-RUN] $KEY: ветки $branch нет ни на origin, ни локально — пропускаем"
          SKIP_KEYS+=("$KEY")
        fi
        continue
      }
    # Ветка есть — проверяем, не влита ли она уже в main
    if git merge-base --is-ancestor "$head" "$(git rev-parse HEAD)" 2>/dev/null; then
      found_sha=$(git log --merges --first-parent --format="%H %s" origin/main \
        | grep -m1 -E " Слияние (пачки )?task/${KEY}:" | awk '{print $1}')
      if [ -n "${found_sha:-}" ]; then
        echo "▶ [DRY-RUN] $KEY уже влита в HEAD (${found_sha:0:10}) — будет закрыта без сборки"
        PREMERGED_KEYS+=("$KEY:$found_sha")
        continue
      fi
    fi
    card=$(node scripts/cc.mjs show "$KEY" --json 2>/dev/null) || true
    if [ -n "${card:-}" ]; then
      task_status=$(jq -r '.task.status // ""' <<< "$card")
      tested=$(jq -r '.task.testedSha // ""' <<< "$card")
      [ "$task_status" != review ] && echo "▶ [DRY-RUN] ПРЕДУПРЕЖДЕНИЕ: $KEY статус «${task_status:-?}» (не на проверке)"
      if [ -z "$NOTEST" ] && [ -n "$tested" ] && [[ "$head" != "$tested"* ]]; then
        echo "▶ [DRY-RUN] ПРЕДУПРЕЖДЕНИЕ: $KEY testedSha не совпадает с HEAD ветки"
      fi
    else
      echo "▶ [DRY-RUN] ПРЕДУПРЕЖДЕНИЕ: $KEY не найдена в Control Center"
    fi
  else
    card=$(node scripts/cc.mjs show "$KEY" --json 2>/dev/null) || { echo "! $KEY не найдена — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }
    task_status=$(jq -r '.task.status' <<< "$card")
    tested=$(jq -r '.task.testedSha // ""' <<< "$card")

    [ "$task_status" = review ] || { echo "! $KEY не на проверке (статус $task_status) — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }

    head=$(git rev-parse --verify -q "origin/$branch" 2>/dev/null) || true
    # Если ветки нет или её голова уже влита в origin/main — ищем коммит слияния в истории
    if [ -z "$head" ] || git merge-base --is-ancestor "$head" "origin/main" 2>/dev/null; then
      found_sha=$(git log --merges --first-parent --format="%H %s" origin/main \
        | grep -m1 -E " Слияние (пачки )?task/${KEY}:" | awk '{print $1}')
      if [ -n "${found_sha:-}" ]; then
        echo "▶ $KEY уже влита в origin/main (${found_sha:0:10}) — закроем без сборки" | tee -a "$log"
        PREMERGED_KEYS+=("$KEY:$found_sha")
        continue
      fi
    fi
    [ -n "$head" ] || { echo "! $KEY: ветки $branch нет в репозитории и слияния не найдено — пропускаем"; SKIP_KEYS+=("$KEY"); continue; }

    if [ -z "$NOTEST" ] && { [ -z "$tested" ] || [[ "$head" != "$tested"* ]]; }; then
      echo "! $KEY: проверен «${tested:-никакой}», в ветке $head — нужна проверка тестировщиком, пропускаем"
      SKIP_KEYS+=("$KEY")
      continue
    fi
  fi

  # Рискованные: миграции базы, правки скриптов выкладки / диспетчера / cc, docker-compose, package
  # В dry-run используем уже разрешённый $head (SHA, работает и для локальных веток)
  if [ -n "$DRY_RUN" ]; then local_diff_ref="$head"; else local_diff_ref="origin/$branch"; fi
  risky_files=$(git diff --name-only "origin/main...$local_diff_ref" 2>/dev/null \
    | grep -E '^(prisma/migrations/|scripts/deploy-task\.sh|scripts/deploy-batch\.sh|scripts/deploy-unit\.sh|scripts/dispatcher\.mjs|scripts/cc\.mjs|scripts/worker-run\.sh|scripts/check\.sh|deploy/update\.sh|deploy/rollback\.sh|deploy/smoke\.sh|deploy/gate\.sh|deploy/Caddyfile|docker-compose\.yml|package\.json|package-lock\.json)' \
    || true)

  if [ -n "$risky_files" ]; then
    echo "▶ $KEY рискованная ($(echo "$risky_files" | head -2 | tr '\n' ' ')) — выложим отдельно"
    RISKY_KEYS+=("$KEY")
  else
    VALID_KEYS+=("$KEY")
  fi
done

echo "▶ Безопасных: ${#VALID_KEYS[@]}, рискованных: ${#RISKY_KEYS[@]}, пропущено: ${#SKIP_KEYS[@]}, уже влитых: ${#PREMERGED_KEYS[@]}" | tee -a "$log"

# ─── Если безопасных нет — только рискованные поштучно (+ уже влитые без сборки) ────────────────────────
if [ ${#VALID_KEYS[@]} -eq 0 ]; then
  echo "▶ Безопасных задач нет — выкладываем рискованные по одной$([ ${#PREMERGED_KEYS[@]} -gt 0 ] && echo ", уже влитые закрываем")" | tee -a "$log"
  if [ -n "$DRY_RUN" ]; then
    echo ""
    echo "▶ [DRY-RUN] ══════════════════════ ПЛАН ПАЧКИ ══════════════════════"
    echo "▶ [DRY-RUN] Запрошено: [${KEYS[*]}]"
    echo "▶ [DRY-RUN] Безопасных: 0, рискованных: ${#RISKY_KEYS[@]}, пропущено: ${#SKIP_KEYS[@]}, уже влитых: ${#PREMERGED_KEYS[@]}"
    echo "▶ [DRY-RUN] Вошли бы в пачку: (нет — все задачи рискованные, пропущены или уже влиты)"
    [ ${#RISKY_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Рискованные (выложить отдельно): [${RISKY_KEYS[*]}]"
    [ ${#SKIP_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Пропущено: [${SKIP_KEYS[*]}]"
    if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
      echo "▶ [DRY-RUN] Уже влитые (закрыть без сборки):"
      for entry in "${PREMERGED_KEYS[@]}"; do
        _pm_sha="${entry##*:}"
        echo "▶ [DRY-RUN]   ${entry%%:*} → ${_pm_sha:0:10} (уже влита)"
      done
    fi
    echo "▶ [DRY-RUN] ═══════════════════════════════════════════════════════"
    exit 0
  fi
  # Закрыть задачи, уже влитые в origin/main (без сборки — smoke подтверждает текущее состояние)
  if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
    if deploy/smoke.sh >> "$log" 2>&1; then
      for entry in "${PREMERGED_KEYS[@]}"; do
        KEY="${entry%%:*}"; found_sha="${entry##*:}"
        batch_subj=$(git log -1 --format="%s" "$found_sha" 2>/dev/null || echo "?")
        pm_done="Деплоер: $AGENT. Выложена ранее: ${batch_subj}. Коммит: ${found_sha:0:10}. SMOKE OK. Лог: /opt/ihelp.am/${log}"
        if ! cc done "$KEY" --sha "$found_sha" "$pm_done" >> "$log" 2>&1; then
          mkdir -p data/tmp
          printf 'Задача %s уже влита в main (%s), cc done не прошла.\nГотовая команда:\n  node /opt/ihelp.am/scripts/cc.mjs done %s --sha %s --agent %s\n' \
            "$KEY" "${found_sha:0:10}" "$KEY" "$found_sha" "$AGENT" > "data/tmp/block-done-$KEY.md"
          cc block "$KEY" --on tech --text-file "data/tmp/block-done-$KEY.md" >> "$log" 2>&1 || true
          echo "✗ cc done не прошла для $KEY (уже влита) — заблокирована на технике" | tee -a "$log"
        else
          echo "✓ $KEY закрыта (ранее влита)" | tee -a "$log"
        fi
      done
    else
      echo "! Smoke не прошёл — задачи, уже влитые в main, не закрыты" | tee -a "$log"
    fi
  fi
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
declare -A BATCH_MERGE_SHAS

# Попытка смёрджить набор задач; конфликтующие исключаются и возвращаются разработчику.
# Записывает имена смёрджанных задач в BATCH_MERGED (глобальный массив).
BATCH_MERGED=()
do_merges() {
  local keys=("$@")
  local KEY
  BATCH_MERGED=()
  git reset -q --hard "$prev"
  for KEY in "${keys[@]}"; do
    local branch="origin/task/$KEY"
    # В dry-run: если ветки нет на origin, пробуем локальную
    if [ -n "$DRY_RUN" ]; then
      git rev-parse --verify -q "$branch" >/dev/null 2>&1 || branch="task/$KEY"
    fi
    local title
    title=$(node scripts/cc.mjs show "$KEY" --json 2>/dev/null | jq -r '.task.title' 2>/dev/null || echo "$KEY")
    if git merge --no-ff -q "$branch" -m "Слияние пачки task/$KEY: $title" >> "$log" 2>&1; then
      BATCH_MERGE_SHAS[$KEY]=$(git rev-parse HEAD)
      BATCH_MERGED+=("$KEY")
    else
      # Читаем конфликтные файлы ДО abort — после abort список всегда пустой
      local cfiles
      cfiles=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ', ')
      git merge --abort >> "$log" 2>&1
      # Вернуть только один раз
      local already=false
      for ret in "${CONFLICT_RETURNED[@]:-}"; do [ "$ret" = "$KEY" ] && already=true && break; done
      if ! $already; then
        CONFLICT_RETURNED+=("$KEY")
        cc return "$KEY" "Конфликт слияния в пачке: ${cfiles%,}. Обновите ветку (git merge origin/main) и сдайте снова." >> "$log" 2>&1 || true
        echo "▶ $KEY конфликт → возвращён разработчику" | tee -a "$log"
      fi
    fi
  done
}

# Найти наибольший работающий поднабор через последовательное двоичное деление.
# При провале check.sh делим пополам и проверяем каждую половину независимо.
# Задача, которая одна не проходит check.sh, возвращается разработчику.
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

  if [ ${#BATCH_MERGED[@]} -eq 1 ]; then
    # Одиночная задача провалила check.sh — возвращаем разработчику, чтобы не блокировать очередь
    local bad="${BATCH_MERGED[0]}"
    local tail_txt; tail_txt=$(grep -E 'error|Error|✗|FAILED|Expected|Cannot' "$log" | tail -n 5 | head -c 500 || true)
    cc return "$bad" "check.sh не прошёл с этой задачей в пачке (задача одна). Исправьте ошибку и сдайте снова.
${tail_txt:-(см. лог /opt/ihelp.am/${log})}" >> "$log" 2>&1 || true
    echo "▶ $bad check.sh → возвращён разработчику" | tee -a "$log"
    DRY_CHECK_FAILED+=("$bad")
    return 1
  fi

  # Сохраняем набор до рекурсии — вложенные do_merges перезаписывают BATCH_MERGED
  local merged=("${BATCH_MERGED[@]}")
  local half=$(( ${#merged[@]} / 2 ))
  local rest=$(( ${#merged[@]} - half ))
  echo "▶ Делим пополам, пробуем первые $half задач" | tee -a "$log"

  if find_deployable "${merged[@]:0:$half}"; then
    # Первая половина нашла рабочий поднабор — добавляем вторую половину по одной задаче
    local second=("${merged[@]:$half}")
    local add_key
    for add_key in "${second[@]}"; do
      echo "▶ Расширяем пачку [${BATCH_RESULT[*]}] + $add_key" | tee -a "$log"
      local saved_result=("${BATCH_RESULT[@]}")
      do_merges "${BATCH_RESULT[@]}" "$add_key"
      if [ ${#BATCH_MERGED[@]} -gt 0 ] && scripts/check.sh >> "$log" 2>&1; then
        echo "CHECK OK с $add_key в пачке [${BATCH_MERGED[*]}]" | tee -a "$log"
        BATCH_RESULT=("${BATCH_MERGED[@]}")
      else
        git reset -q --hard "$prev"
        echo "▶ $add_key не прошёл check.sh — пропускаем, восстанавливаем [${saved_result[*]}]" | tee -a "$log"
        BATCH_RESULT=("${saved_result[@]}")
        do_merges "${BATCH_RESULT[@]}"
        DRY_CHECK_FAILED+=("$add_key")
      fi
    done
    return 0
  fi

  # Первая половина полностью не прошла — пробуем вторые $rest задач
  echo "▶ Первая половина не прошла, пробуем вторые $rest задач" | tee -a "$log"
  find_deployable "${merged[@]:$half}"
}

find_deployable "${VALID_KEYS[@]}"

if [ ${#BATCH_RESULT[@]} -eq 0 ]; then
  echo "✗ Ни одна задача из пачки не прошла check.sh" | tee -a "$log"
  git reset -q --hard "$prev"
  if [ -n "$DRY_RUN" ]; then
    echo ""
    echo "▶ [DRY-RUN] ══════════════════════ ПЛАН ПАЧКИ ══════════════════════"
    echo "▶ [DRY-RUN] Запрошено: [${KEYS[*]}]"
    echo "▶ [DRY-RUN] Безопасных: ${#VALID_KEYS[@]}, рискованных: ${#RISKY_KEYS[@]}, пропущено: ${#SKIP_KEYS[@]}, уже влитых: ${#PREMERGED_KEYS[@]}"
    echo "▶ [DRY-RUN] Вошли бы в пачку: (нет — check.sh не прошёл ни для одного поднабора)"
    [ ${#CONFLICT_RETURNED[@]} -gt 0 ] && echo "▶ [DRY-RUN] Конфликт слияния: [${CONFLICT_RETURNED[*]}]"
    [ ${#DRY_CHECK_FAILED[@]} -gt 0 ] && echo "▶ [DRY-RUN] Не прошли check.sh: [${DRY_CHECK_FAILED[*]}]"
    [ ${#RISKY_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Рискованные (выложить отдельно): [${RISKY_KEYS[*]}]"
    [ ${#SKIP_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Пропущено: [${SKIP_KEYS[*]}]"
    if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
      echo "▶ [DRY-RUN] Уже влитые (закрыть без сборки):"
      for entry in "${PREMERGED_KEYS[@]}"; do
        _dr_sha="${entry##*:}"
        echo "▶ [DRY-RUN]   ${entry%%:*} → ${_dr_sha:0:10} (уже влита)"
      done
    fi
    echo "▶ [DRY-RUN] ═══════════════════════════════════════════════════════"
    exec 9>&- 2>/dev/null || true
    exit 0
  fi
  for KEY in "${VALID_KEYS[@]}"; do
    cc note "$KEY" "Пачковая выкладка не начата: check.sh провалился на всём наборе. Задача остаётся на проверке." --error >> "$log" 2>&1 || true
  done
  # Закрыть уже влитые задачи (даже если batch не прошёл)
  if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
    if deploy/smoke.sh >> "$log" 2>&1; then
      for entry in "${PREMERGED_KEYS[@]}"; do
        KEY="${entry%%:*}"; found_sha="${entry##*:}"
        batch_subj=$(git log -1 --format="%s" "$found_sha" 2>/dev/null || echo "?")
        pm_done="Деплоер: $AGENT. Выложена ранее: ${batch_subj}. Коммит: ${found_sha:0:10}. SMOKE OK. Лог: /opt/ihelp.am/${log}"
        if ! cc done "$KEY" --sha "$found_sha" "$pm_done" >> "$log" 2>&1; then
          mkdir -p data/tmp
          printf 'Задача %s уже влита в main (%s), cc done не прошла.\nГотовая команда:\n  node /opt/ihelp.am/scripts/cc.mjs done %s --sha %s --agent %s\n' \
            "$KEY" "${found_sha:0:10}" "$KEY" "$found_sha" "$AGENT" > "data/tmp/block-done-$KEY.md"
          cc block "$KEY" --on tech --text-file "data/tmp/block-done-$KEY.md" >> "$log" 2>&1 || true
          echo "✗ cc done не прошла для $KEY (уже влита) — заблокирована на технике" | tee -a "$log"
        else
          echo "✓ $KEY закрыта (ранее влита)" | tee -a "$log"
        fi
      done
    else
      echo "! Smoke не прошёл — задачи, уже влитые в main, не закрыты" | tee -a "$log"
    fi
  fi
  # Всё равно попробуем рискованные
  exec 9>&-
  exit_code=1
  for KEY in "${RISKY_KEYS[@]}"; do
    scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1 || exit_code=1
  done
  exit $exit_code
fi

echo "▶ Пачка готова к выкладке: [${BATCH_RESULT[*]}]" | tee -a "$log"

# В режиме проверки — печатаем план и выходим без выкладки
if [ -n "$DRY_RUN" ]; then
  echo ""
  echo "▶ [DRY-RUN] ══════════════════════ ПЛАН ПАЧКИ ══════════════════════"
  echo "▶ [DRY-RUN] Запрошено: [${KEYS[*]}]"
  echo "▶ [DRY-RUN] Безопасных: ${#VALID_KEYS[@]}, рискованных: ${#RISKY_KEYS[@]}, пропущено: ${#SKIP_KEYS[@]}, уже влитых: ${#PREMERGED_KEYS[@]}"
  echo "▶ [DRY-RUN] Вошли бы в пачку: [${BATCH_RESULT[*]}]"
  echo "▶ [DRY-RUN] Коммиты закрытия (каждая задача — своим коммитом слияния):"
  for KEY in "${BATCH_RESULT[@]}"; do
    _dr_sha="${BATCH_MERGE_SHAS[$KEY]:-?}"
    echo "▶ [DRY-RUN]   $KEY → ${_dr_sha:0:10} (новое слияние)"
  done
  if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
    echo "▶ [DRY-RUN] Уже влитые (закрыть без сборки):"
    for entry in "${PREMERGED_KEYS[@]}"; do
      _dr_sha="${entry##*:}"
      echo "▶ [DRY-RUN]   ${entry%%:*} → ${_dr_sha:0:10} (уже влита)"
    done
  fi
  [ ${#CONFLICT_RETURNED[@]} -gt 0 ] && echo "▶ [DRY-RUN] Конфликт слияния (вернули бы разработчику): [${CONFLICT_RETURNED[*]}]"
  [ ${#DRY_CHECK_FAILED[@]} -gt 0 ] && echo "▶ [DRY-RUN] Не прошли check.sh (вернули бы разработчику): [${DRY_CHECK_FAILED[*]}]"
  [ ${#RISKY_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Рискованные (выложить отдельно): [${RISKY_KEYS[*]}]"
  [ ${#SKIP_KEYS[@]} -gt 0 ] && echo "▶ [DRY-RUN] Пропущено: [${SKIP_KEYS[*]}]"
  echo "▶ [DRY-RUN] check.sh прошёл — пачка готова к выкладке"
  echo "▶ [DRY-RUN] ═══════════════════════════════════════════════════════"
  exit 0
fi

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
  local consec_fail=0
  for KEY in "${BATCH_RESULT[@]}"; do
    echo "▶ $KEY — отдельно..." | tee -a "$log"
    if scripts/deploy-task.sh "$KEY" ${NOTEST:+--no-test} >> "$log" 2>&1; then
      echo "✓ $KEY выложено" | tee -a "$log"
      any_ok=true
      consec_fail=0
    else
      echo "✗ $KEY: не выложено (возможный виновник)" | tee -a "$log"
      consec_fail=$(( consec_fail + 1 ))
      if [ "$consec_fail" -ge 2 ]; then
        cc note "${BATCH_RESULT[0]}" "Smoke-тест провалился дважды подряд при поштучной выкладке пачки. Нужна ручная проверка. Лог: /opt/ihelp.am/${log}" --error >> "$log" 2>&1 || true
        echo "✗ Два провала подряд — останавливаю поштучную выкладку, нужен человек" | tee -a "$log"
        break
      fi
    fi
  done
  $any_ok && exit 1 || exit 1
}

echo "▶ deploy/update.sh" | tee -a "$log"
# Метка вида batch-N-HHMMSS без пробелов и двоеточий; перечень задач — только в логе
batch_deploy_label="batch-${#BATCH_RESULT[@]}-$(date +%H%M%S)"
echo "▶ Метка выкладки: $batch_deploy_label, задачи: [${BATCH_RESULT[*]}]" | tee -a "$log"
DEPLOY_KEY="$batch_deploy_label" PREDEPLOY_DONE="${backup_file:+1}" deploy/update.sh >> "$log" 2>&1 || fail "deploy/update.sh завершился с ошибкой"
grep -q '^SMOKE OK' "$log" || fail "smoke-тест не подтвердил SMOKE OK"

if grep -q '^deploy/Caddyfile$' <<< "$changed"; then
  echo "▶ Caddyfile изменился — перезапуск Caddy" | tee -a "$log"
  { docker compose restart caddy && deploy/smoke.sh; } >> "$log" 2>&1 || fail "после перезапуска Caddy smoke-тест не прошёл"
fi

# ─── Шаг 6: отправить main, закрыть каждую задачу её собственным коммитом слияния ─────────────────────────────────
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

all_done=true
mkdir -p data/tmp
for KEY in "${BATCH_RESULT[@]}"; do
  # Каждая задача закрывается своим коммитом слияния (BATCH_MERGE_SHAS[$KEY])
  task_sha="${BATCH_MERGE_SHAS[$KEY]:-$merge}"
  task_done_text="Пачковая выкладка ${task_sha:0:10}: SMOKE OK (${checks} проверок, соседних сайтов: ${neighbors}).${migr} ${tested_label} Слияние ${pushed}. Лог: /opt/ihelp.am/${log}"
  if ! cc done "$KEY" --sha "$task_sha" "$task_done_text" >> "$log" 2>&1; then
    cc note "$KEY" "cc done не прошла после выкладки коммита ${task_sha:0:10}: задача выложена, но не закрыта. Лог: /opt/ihelp.am/${log}" --error 2>/dev/null || true
    printf 'Задача %s выложена (коммит %s), cc done не прошла.\nГотовая команда:\n  node /opt/ihelp.am/scripts/cc.mjs done %s --sha %s --agent %s "%s"\n' \
      "$KEY" "${task_sha:0:10}" "$KEY" "$task_sha" "$AGENT" "$task_done_text" > "data/tmp/block-done-$KEY.md"
    cc block "$KEY" --on tech --text-file "data/tmp/block-done-$KEY.md" >> "$log" 2>&1 || true
    echo "✗ cc done не прошла для $KEY — задача заблокирована на технике с готовой командой" | tee -a "$log"
    all_done=false
  fi
done
[ "$pushed" = "отправлено в origin/main" ] || cc note "${BATCH_RESULT[0]}" "$pushed" --error 2>/dev/null || true

# Закрыть задачи, уже влитые в origin/main до этой выкладки (smoke уже прошёл)
if [ ${#PREMERGED_KEYS[@]} -gt 0 ]; then
  echo "▶ Закрываем задачи, выложенные ранее: [$(for e in "${PREMERGED_KEYS[@]}"; do printf '%s ' "${e%%:*}"; done)]" | tee -a "$log"
  for entry in "${PREMERGED_KEYS[@]}"; do
    KEY="${entry%%:*}"; found_sha="${entry##*:}"
    batch_subj=$(git log -1 --format="%s" "$found_sha" 2>/dev/null || echo "?")
    pm_done="Деплоер: $AGENT. Выложена ранее: ${batch_subj}. Коммит: ${found_sha:0:10}. SMOKE OK. Лог: /opt/ihelp.am/${log}"
    if ! cc done "$KEY" --sha "$found_sha" "$pm_done" >> "$log" 2>&1; then
      printf 'Задача %s уже влита в main (%s), cc done не прошла.\nГотовая команда:\n  node /opt/ihelp.am/scripts/cc.mjs done %s --sha %s --agent %s\n' \
        "$KEY" "${found_sha:0:10}" "$KEY" "$found_sha" "$AGENT" > "data/tmp/block-done-$KEY.md"
      cc block "$KEY" --on tech --text-file "data/tmp/block-done-$KEY.md" >> "$log" 2>&1 || true
      echo "✗ cc done не прошла для $KEY (уже влита) — заблокирована на технике" | tee -a "$log"
      all_done=false
    else
      echo "✓ $KEY закрыта (ранее влита)" | tee -a "$log"
    fi
  done
fi

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
