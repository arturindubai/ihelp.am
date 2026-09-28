#!/usr/bin/env bash
# Симуляция провала smoke-теста и автоотката — изолированный прогон без трогания прод-контейнеров.
# Проверяет цепочку: update.sh пишет метку → smoke падает → deploy-task.sh видит метку → rollback.sh
# переключает теги → homecare-app:latest = прежний образ.
#
# Использует ROLLBACK_SKIP_COMPOSE=1, чтобы rollback.sh не запускал docker compose up.
# После теста ВСЕ изменённые теги восстанавливаются.
#
#   scripts/test-rollback.sh
#   scripts/test-rollback.sh --log /tmp/my.log   # сохранить лог в нужное место
set -uo pipefail
cd "$(dirname "$0")/.."

log_arg="${2:-}"
log_file="${log_arg:-$(mktemp /tmp/rollback-test-XXXX.log)}"
PASS=0
FAIL=0

# SHA образов до теста (для восстановления)
saved_latest_id=""
saved_previous_id=""
had_previous=0

ok()   { echo "  ✓ $1" | tee -a "$log_file"; ((PASS++)) || true; }
fail() { echo "  ✗ $1" | tee -a "$log_file"; ((FAIL++)) || true; }
hdr()  { echo "" | tee -a "$log_file"; echo "▶ $1" | tee -a "$log_file"; }

cleanup() {
  echo "" >> "$log_file"
  echo "── Уборка тестовых тегов" | tee -a "$log_file"
  # Восстанавливаем homecare-app:latest на прежний образ
  if [ -n "$saved_latest_id" ]; then
    docker tag "$saved_latest_id" homecare-app:latest 2>/dev/null && \
      echo "  homecare-app:latest восстановлен" >> "$log_file" || \
      echo "  ПРЕДУПРЕЖДЕНИЕ: не удалось восстановить homecare-app:latest" >> "$log_file"
  fi
  # Восстанавливаем homecare-app:previous (если был)
  if [ "$had_previous" = 1 ] && [ -n "$saved_previous_id" ]; then
    docker tag "$saved_previous_id" homecare-app:previous 2>/dev/null && \
      echo "  homecare-app:previous восстановлен" >> "$log_file" || \
      echo "  ПРЕДUPРЕЖДЕНИЕ: не удалось восстановить homecare-app:previous" >> "$log_file"
  elif [ "$had_previous" = 0 ]; then
    docker rmi homecare-app:previous 2>/dev/null || true
  fi
  # То же для homecare-migrate:previous
  if docker image inspect homecare-migrate:previous > /dev/null 2>&1; then
    docker rmi homecare-migrate:previous 2>/dev/null || true
  fi
  echo "── Лог: $log_file"
}
trap cleanup EXIT

echo "=== Тест автоотката: $(date) ===" | tee "$log_file"
echo "Рабочая копия: $(pwd)" >> "$log_file"

# ── 1. Образы ──────────────────────────────────────────────────────────────────
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
ok "homecare-app:latest существует"
ok "homecare-migrate:latest существует"

# Сохраняем ID текущих образов для восстановления
saved_latest_id=$(docker image inspect --format='{{.Id}}' homecare-app:latest)
echo "  SHA latest: ${saved_latest_id:7:20}…" | tee -a "$log_file"

if docker image inspect homecare-app:previous > /dev/null 2>&1; then
  had_previous=1
  saved_previous_id=$(docker image inspect --format='{{.Id}}' homecare-app:previous)
  echo "  SHA previous: ${saved_previous_id:7:20}…" | tee -a "$log_file"
  ok "homecare-app:previous существует"
else
  had_previous=0
  ok "homecare-app:previous отсутствует — создадим из :latest (оба SHA совпадут, механизм всё равно проверится)"
fi

# ── 2. Симулируем шаг update.sh: помечаем :latest как :previous ───────────────
hdr "2/6 Подготовка: помечаем :latest как :previous (шаг 2/7 update.sh)"
docker tag homecare-app:latest homecare-app:previous
docker tag homecare-migrate:latest homecare-migrate:previous
prev_sha_after=$(docker image inspect --format='{{.Id}}' homecare-app:previous)
echo "  homecare-app:previous = ${prev_sha_after:7:20}…" >> "$log_file"
ok "образы :previous готовы"

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
hdr "5/6 Вызов deploy/rollback.sh (ROLLBACK_SKIP_COMPOSE=1)"
echo "  (docker compose up пропущен — тест изолированный)" | tee -a "$log_file"
if ROLLBACK_SKIP_COMPOSE=1 deploy/rollback.sh >> "$log_file" 2>&1; then
  ok "rollback.sh завершился успешно (код 0)"
else
  fail "rollback.sh завершился с ошибкой"
fi
grep "Образы переключены" "$log_file" > /dev/null && ok "строка 'Образы переключены' есть в логе" || \
  fail "строка 'Образы переключены' не найдена в логе"
grep "Откат выполнен" "$log_file" > /dev/null && ok "строка 'Откат выполнен' есть в логе" || \
  fail "строка 'Откат выполнен' не найдена в логе"

# ── 6. Проверяем что образ откатился ──────────────────────────────────────────
hdr "6/6 Проверка: homecare-app:latest = прежний :previous"
new_latest_sha=$(docker image inspect --format='{{.Id}}' homecare-app:latest)
echo "  SHA latest после отката: ${new_latest_sha:7:20}…" | tee -a "$log_file"
if [ "$prev_sha_after" = "$new_latest_sha" ]; then
  ok "homecare-app:latest совпадает с :previous — откат сработал"
else
  fail "homecare-app:latest не совпадает с :previous — откат не сработал"
  echo "  Ожидали: ${prev_sha_after:7:20}…" | tee -a "$log_file"
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
