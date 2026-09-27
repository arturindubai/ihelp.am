#!/usr/bin/env bash
# Обновить package-lock.json в образе сборки после изменения package.json.
# Запускать из корня рабочей копии: scripts/lock-update.sh
# Монтирует только package.json и package-lock.json, обновляет lock-файл без установки модулей в хосте.
# Флаги npm: --package-lock-only — не трогает node_modules; --ignore-scripts — не запускает install-хуки.
set -uo pipefail
root=$(pwd -P)
[ -f "$root/package.json" ] || { echo "✗ Запускать из корня рабочей копии (нет package.json): $root"; exit 3; }

echo "▶ Обновление package-lock.json в образе сборки..."
docker run --rm \
  -v "$root/package.json:/app/package.json" \
  -v "$root/package-lock.json:/app/package-lock.json" \
  -w /app homecare-migrate sh -c 'npm install --package-lock-only --ignore-scripts 2>&1'

echo "✓ package-lock.json обновлён"
