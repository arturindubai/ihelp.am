#!/usr/bin/env bash
# Проверка типов и тестов для текущей рабочей копии — та же, что в CLAUDE.md, одной командой.
# Запускать из корня рабочей копии задачи: scripts/check.sh
# Работает в образе сборки homecare-migrate, прод не трогает. Код возврата 0 — всё зелёное.
set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
docker run --rm \
  -v "$root/src:/app/src" -v "$root/prisma:/app/prisma" -v "$root/messages:/app/messages" \
  -w /app --entrypoint bash homecare-migrate -c '
    set -o pipefail
    npx prisma generate >/dev/null 2>&1 || { echo "✗ prisma generate"; exit 1; }
    echo "▶ Проверка типов"; npx tsc --noEmit -p . || exit 1
    echo "▶ Тесты"; npx vitest run 2>&1 | tail -n 25' 2>&1
code=$?
[ "$code" = 0 ] && echo "CHECK OK" || echo "CHECK FAILED"
exit "$code"
