#!/usr/bin/env bash
# Симуляция провала smoke-теста и автоотката — изолированный прогон без трогания прод-контейнеров.
# Проверяет цепочку: update.sh пишет метку → smoke падает → deploy-task.sh видит метку → rollback.sh
# переключает теги → ${project}-app:latest = прежний образ.
#
# ОБЯЗАТЕЛЬНЫЙ АРГУМЕНТ: --project ihelp-stand-<имя>
# Скрипт отказывается работать с именем проекта "homecare" (образы прода).
# Берёт замок data/deploy.lock, чтобы не пересечься с деплоером.
# После теста ВСЕ созданные теговые метки восстанавливаются.
#
#   scripts/test-rollback.sh --project ihelp-stand-dev64
#   scripts/test-rollback.sh --project ihelp-stand-dev64 --log /tmp/my.log
set -uo pipefail
cd "$(dirname "$0")/.."

# ── Аргументы ──────────────────────────────────────────────────────────────────
project=""
log_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    --project=*) project="${1#--project=}"; shift ;;
    --log) log_file="$2"; shift 2 ;;
    --log=*) log_file="${1#--log=}"; shift ;;
    *) echo "Неизвестный аргумент: $1"; exit 1 ;;
  esac
done

# ── Проверка имени проекта ──────────────────────────────────────────────────────
if [ -z "$project" ]; then
  echo "ОШИБКА: требуется --project ihelp-stand-<имя>"
  echo "Пример: scripts/test-rollback.sh --project ihelp-stand-dev64"
  exit 1
fi
if [ "$project" = "homecare" ]; then
  echo "ОШИБКА: имя проекта 'homecare' запрещено — это образы прода."
  echo "Передайте имя стенда: --project ihelp-stand-<имя>"
  exit 1
fi
if [[ "$project" != ihelp-stand-* ]]; then
  echo "ОШИБКА: имя проекта '$project' не соответствует формату ihelp-stand-*"
  echo "Пример: --project ihelp-stand-dev64"
  exit 1
fi

[ -n "$log_file" ] || log_file=$(mktemp /tmp/rollback-test-XXXX.log)
PASS=0
FAIL=0

ok()   { echo "  ✓ $1" | tee -a "$log_file"; ((PASS++)) || true; }
fail() { echo "  ✗ $1" | tee -a "$log_file"; ((FAIL++)) || true; }
hdr()  { echo "" | tee -a "$log_file"; echo "▶ $1" | tee -a "$log_file"; }

# ── Замок выкладки ──────────────────────────────────────────────────────────────
mkdir -p data
exec 9> data/deploy.lock
flock -n 9 || { echo "ОШИБКА: идёт другая выкладка (data/deploy.lock занят) — попробуйте позже"; exit 1; }

# ── Уборка тестовых тегов ───────────────────────────────────────────────────────
cleanup() {
  echo "" >> "$log_file"
  echo "── Уборка тестовых тегов стенда" | tee -a "$log_file"
  for tag in "${project}-app:latest" "${project}-app:previous" \
             "${project}-migrate:latest" "${project}-migrate:previous"; do
    docker rmi "$tag" > /dev/null 2>&1 && echo "  удалён: $tag" >> "$log_file" || true
  done
  echo "── Лог: $log_file"
}
trap cleanup EXIT

echo "=== Тест автоотката: $(date) ===" | tee "$log_file"
echo "Проект стенда: $project" >> "$log_file"
echo "Рабочая копия: $(pwd)" >> "$log_file"

# ── 1. Образы прода как база ────────────────────────────────────────────────────
hdr "1/6 Образы"
if ! docker image inspect homecare-app:latest > /dev/null 2>&1; then
  fail "homecare-app:latest не найден — нечего тестировать"
  echo "ROLLBACK TEST FAILED" | tee -a "$log_file"
  exit 1
fi
if ! docker image inspect homecare-migrate:latest > /dev/null 2>&1; then
  fail "homecare-migrate:latest не найден — нечего тестировать"
  echo "ROLLBACK TEST FAILED" | tee -a "$log_file"
  exit 1
fi
ok "homecare-app:latest существует (основа для тестовых образов стенда)"

# Создаём образы стенда, тегируя от homecare (не трогаем homecare-* теги)
docker tag homecare-app:latest "${project}-app:latest"
docker tag homecare-migrate:latest "${project}-migrate:latest"
ok "${project}-app:latest создан из homecare-app:latest"

# ── 2. Симулируем шаг update.sh: помечаем :latest как :previous ───────────────
hdr "2/6 Подготовка: помечаем :latest как :previous (шаг 2/7 update.sh)"
docker tag "${project}-app:latest" "${project}-app:previous"
docker tag "${project}-migrate:latest" "${project}-migrate:previous"
prev_sha=$(docker image inspect --format='{{.Id}}' "${project}-app:previous")
echo "  ${project}-app:previous = ${prev_sha:7:20}…" >> "$log_file"
ok "образы стенда :previous готовы"

# ── 3. Симулируем: update.sh записывает метку в лог (шаг 5/7) ─────────────────
hdr "3/6 Симуляция update.sh: метка в логе"
marker=$(< src/lib/deploy-marker.txt)
echo "▶ 5/7 Запуск на готовом образе" >> "$log_file"
echo "$marker" >> "$log_file"
echo "  docker compose up -d --no-build" >> "$log_file"
echo "▶ 6/7 Ожидание готовности" >> "$log_file"
echo "  healthy" >> "$log_file"
echo "  Метка: $marker" | tee -a "$log_file"
ok "метка '$marker' записана в лог перед docker compose up"

# ── 4. Симулируем провал smoke ─────────────────────────────────────────────────
hdr "4/6 Симуляция провала smoke"
echo "▶ 7/7 Smoke-тест" >> "$log_file"
echo "Контейнеры" >> "$log_file"
echo "  ✗ app healthy" >> "$log_file"
echo "Страницы" >> "$log_file"
echo "  ✗ /api/health → {\"ok\":true}" >> "$log_file"
echo "SMOKE FAILED" >> "$log_file"
ok "провал smoke записан в лог"

# Проверяем условие deploy-task.sh: grep -qF "$prod_marker" "$log"
if grep -qF "$marker" "$log_file"; then
  ok "условие отката выполнено: grep -qF '$marker' нашёл метку в логе"
else
  fail "ОШИБКА: метка '$marker' не найдена в логе — откат не будет вызван"
fi

# ── 5. Вызываем rollback.sh (ROLLBACK_SKIP_COMPOSE=1) ─────────────────────────
hdr "5/6 Вызов deploy/rollback.sh (ROLLBACK_SKIP_COMPOSE=1, PREFIX=${project})"
echo "  (docker compose up пропущен — тест изолированный)" | tee -a "$log_file"
if ROLLBACK_SKIP_COMPOSE=1 ROLLBACK_IMAGE_PREFIX="${project}" deploy/rollback.sh >> "$log_file" 2>&1; then
  ok "rollback.sh завершился успешно (код 0)"
else
  fail "rollback.sh завершился с ошибкой"
fi
grep "Образы переключены" "$log_file" > /dev/null && ok "строка 'Образы переключены' есть в логе" || \
  fail "строка 'Образы переключены' не найдена в логе"
grep "Откат выполнен" "$log_file" > /dev/null && ok "строка 'Откат выполнен' есть в логе" || \
  fail "строка 'Откат выполнен' не найдена в логе"

# ── 6. Проверяем что образ откатился ──────────────────────────────────────────
hdr "6/6 Проверка: ${project}-app:latest = прежний :previous"
new_latest_sha=$(docker image inspect --format='{{.Id}}' "${project}-app:latest")
echo "  SHA latest после отката: ${new_latest_sha:7:20}…" | tee -a "$log_file"
if [ "$prev_sha" = "$new_latest_sha" ]; then
  ok "${project}-app:latest совпадает с :previous — откат сработал"
else
  fail "${project}-app:latest не совпадает с :previous — откат не сработал"
  echo "  Ожидали: ${prev_sha:7:20}…" | tee -a "$log_file"
  echo "  Получили: ${new_latest_sha:7:20}…" | tee -a "$log_file"
fi

# ── Итог ───────────────────────────────────────────────────────────────────────
echo "" | tee -a "$log_file"
echo "=== Итог: $PASS ✓, $FAIL ✗ ===" | tee -a "$log_file"
if [ "$FAIL" -eq 0 ]; then
  echo "ROLLBACK TEST OK" | tee -a "$log_file"
  exit 0
else
  echo "ROLLBACK TEST FAILED" | tee -a "$log_file"
  exit 1
fi
