#!/usr/bin/env bash
# Проверка типов и тестов для текущей рабочей копии — та же, что в CLAUDE.md, одной командой.
# Запускать из корня рабочей копии задачи: scripts/check.sh (или bash /opt/ihelp.am/scripts/check.sh — проверяется
# текущая папка, так тестировщик проверяет старую ветку, где этого скрипта ещё нет).
# Работает в образе сборки homecare-migrate, прод не трогает. Код возврата 0 — всё зелёное.
set -uo pipefail
root=$(pwd -P)
[ -f "$root/package.json" ] && [ -d "$root/prisma" ] || { echo "✗ Запускать из корня рабочей копии (здесь нет package.json и prisma/): $root"; exit 3; }
# Проверку миграций берём из папки самого check.sh, а не из проверяемой ветки: в ветках, созданных до DEV-80, её нет
self=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
tools=()
[ -f "$self/check-migrations.mjs" ] && tools=(-v "$self/check-migrations.mjs:/app/tools/check-migrations.mjs:ro")
docker run --rm \
  -v "$root/src:/app/src" -v "$root/prisma:/app/prisma" -v "$root/messages:/app/messages" \
  -v "$root/deploy:/app/deploy:ro" -v "$root/scripts:/app/scripts:ro" \
  ${tools[@]+"${tools[@]}"} \
  -w /app --entrypoint bash homecare-migrate -c '
    set -o pipefail
    npx prisma generate >/dev/null 2>&1 || { echo "✗ prisma generate"; exit 1; }
    # Типы маршрутов .next/types в образе собраны с main: в ветке без этих маршрутов они дают ложные ошибки
    rm -rf .next
    echo "▶ Проверка типов"; npx tsc --noEmit -p . || exit 1
    echo "▶ Тесты"; npx vitest run 2>&1 | tail -n 25; vitest_exit=${PIPESTATUS[0]}
    echo "▶ Миграции"; if [ -f tools/check-migrations.mjs ]; then node tools/check-migrations.mjs || exit 1; else echo "  ! проверка миграций пропущена: рядом с check.sh нет check-migrations.mjs"; fi
    echo "▶ Хардкод строк"; count=$(grep -rn --include="*.tsx" --include="*.ts" "На главную\|Русский\|English" src/ 2>/dev/null | grep -v "backlog\.ts\|SettingsEditor\.tsx\|\.test\." | wc -l); [ "$count" = "0" ] && echo "  OK — зашитых строк нет" || { echo "  FAIL — найдено зашитых строк: $count"; grep -rn --include="*.tsx" --include="*.ts" "На главную\|Русский\|English" src/ 2>/dev/null | grep -v "backlog\.ts\|SettingsEditor\.tsx\|\.test\."; exit 1; }
    if [ "$vitest_exit" != "0" ]; then echo "✗ Тесты упали"; exit "$vitest_exit"; fi' 2>&1
code=$?
[ "$code" = 0 ] && echo "CHECK OK" || echo "CHECK FAILED"
exit "$code"
