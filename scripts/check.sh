#!/usr/bin/env bash
# Проверка типов и тестов для текущей рабочей копии — та же, что в CLAUDE.md, одной командой.
# Запускать из корня рабочей копии задачи: scripts/check.sh (или bash /opt/ihelp.am/scripts/check.sh — проверяется
# текущая папка, так тестировщик проверяет старую ветку, где этого скрипта ещё нет).
# Работает в образе сборки homecare-migrate, прод не трогает. Код возврата 0 — всё зелёное.
set -uo pipefail
root=$(pwd -P)
[ -f "$root/package.json" ] && [ -d "$root/prisma" ] || { echo "✗ Запускать из корня рабочей копии (здесь нет package.json и prisma/): $root"; exit 3; }
# Проверочные скрипты берём из папки самого check.sh, а не из проверяемой ветки: в ветках, созданных раньше, их нет
self=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
tools=()
[ -f "$self/check-migrations.mjs" ] && tools+=(-v "$self/check-migrations.mjs:/app/tools/check-migrations.mjs:ro")
# Seed проверяется только если ветка сама меняет prisma/seed.ts или prisma/migrations/.
# На результате слияния (gate.sh) проверка выполняется всегда — без этого условия.
if [ -f "$self/check-seed.mjs" ]; then
  _skip_seed=1
  if _base=$(git -C "$root" merge-base HEAD origin/main 2>/dev/null); then
    git -C "$root" diff --quiet "$_base" HEAD -- prisma/seed.ts prisma/migrations/ 2>/dev/null || _skip_seed=0
  else
    _skip_seed=0
  fi
  if [ "$_skip_seed" = "0" ]; then
    tools+=(-v "$self/check-seed.mjs:/app/tools/check-seed.mjs:ro")
  else
    tools+=(-e SKIP_SEED_CHECK=1)
  fi
fi
[ -f "$self/check-colors.sh" ] && tools+=(-v "$self/check-colors.sh:/app/tools/check-colors.sh:ro")
docker run --rm \
  -v "$root/src:/app/src" -v "$root/prisma:/app/prisma" -v "$root/messages:/app/messages" \
  -v "$root/deploy:/app/deploy:ro" -v "$root/scripts:/app/scripts:ro" \
  ${tools[@]+"${tools[@]}"} \
  -w /app --entrypoint bash homecare-migrate -c '
    set -o pipefail
    npx prisma generate >/dev/null 2>&1 || { echo "✗ prisma generate"; exit 1; }
    # Типы маршрутов .next/types в образе собраны с main: в ветке без этих маршрутов они дают ложные ошибки
    rm -rf .next
    echo "▶ Синтаксис скриптов"; for f in scripts/*.mjs; do node --check "$f" || { echo "  FAIL — синтаксическая ошибка в $f"; exit 1; }; done; echo "  OK — scripts/*.mjs разбираются"
    echo "▶ Проверка типов"; npx tsc --noEmit -p . || exit 1
    echo "▶ Тесты"; npx vitest run --maxWorkers=2 2>&1 | tail -n 25; vitest_exit=${PIPESTATUS[0]}
    echo "▶ Миграции"; if [ -f tools/check-migrations.mjs ]; then node tools/check-migrations.mjs || exit 1; else echo "  ! проверка миграций пропущена: рядом с check.sh нет check-migrations.mjs"; fi
    echo "▶ Демо-данные в seed"; if [ "${SKIP_SEED_CHECK:-0}" = "1" ]; then echo "  seed веткой не изменён — проверка пропущена"; elif [ -f tools/check-seed.mjs ]; then node tools/check-seed.mjs || exit 1; else echo "  ! проверка seed пропущена: рядом с check.sh нет check-seed.mjs"; fi
    echo "▶ Хардкод строк"; count=$(grep -rn --include="*.tsx" --include="*.ts" "На главную\|Русский\|English" src/ 2>/dev/null | grep -v "backlog\.ts\|SettingsEditor\.tsx\|\.test\." | wc -l); [ "$count" = "0" ] && echo "  OK — зашитых строк нет" || { echo "  FAIL — найдено зашитых строк: $count"; grep -rn --include="*.tsx" --include="*.ts" "На главную\|Русский\|English" src/ 2>/dev/null | grep -v "backlog\.ts\|SettingsEditor\.tsx\|\.test\."; exit 1; }
    echo "▶ Прямой доступ к базе в страницах"; db_hits=$(grep -rn --include="*.tsx" --include="*.ts" -F "@/server/db" src/app/ 2>/dev/null | grep "from" | grep -v "src/app/api/" || true); [ -z "$db_hits" ] && echo "  OK — страницы не обращаются к базе напрямую" || { echo "  FAIL — найдены прямые db-импорты в страницах:"; echo "$db_hits"; exit 1; }
    echo "▶ Строки мимо переводов"; cyr_out=$(grep -rnP ">\p{Cyrillic}" src/ --include="*.tsx" | grep -v "not-found\.tsx" || true); [ -z "$cyr_out" ] && echo "  OK — кириллица напрямую в JSX не найдена" || { echo "  FAIL — кириллица напрямую в JSX:"; echo "$cyr_out" | head -10; exit 1; }
    echo "▶ Хардкод цветов"; if [ -f tools/check-colors.sh ]; then bash tools/check-colors.sh || exit 1; else echo "  ! проверка цветов пропущена: рядом с check.sh нет check-colors.sh"; fi
    if [ "$vitest_exit" != "0" ]; then echo "✗ Тесты упали"; exit "$vitest_exit"; fi' 2>&1
code=$?
[ "$code" = 0 ] && echo "CHECK OK" || echo "CHECK FAILED"
exit "$code"
