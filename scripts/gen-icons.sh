#!/usr/bin/env bash
# Генерация PNG-иконок приложения из public/img/icon.svg через Docker.
# Запускать из корня рабочей копии: scripts/gen-icons.sh
set -uo pipefail
root=$(pwd -P)
[ -f "$root/package.json" ] || { echo "✗ Запускать из корня проекта"; exit 1; }
docker run --rm \
  -v "$root/scripts:/app/scripts:ro" \
  -v "$root/public:/app/public" \
  -w /app --entrypoint sh homecare-migrate \
  -c 'node scripts/gen-icons.mjs'
