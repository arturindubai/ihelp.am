#!/usr/bin/env bash
# Полный изолированный стенд для проверки ветки деплоером:
# сборка образа, копия .env с продакшн-настройками, один-к-одному с продом.
#
# ВНИМАНИЕ: .env несёт настоящие токены. ALERT_BOT_TOKEN/ALERT_CHAT_ID могут
# отправить тех-алерты в реальный Telegram-чат. Флаг --no-notify обнуляет их.
# Уведомления Telegram/WhatsApp/почта хранятся в базе настроек — на свежем
# стенде их нет; не вводи их в настройках стенда без необходимости.
# Для лёгкого стенда без реальных токенов (dev-режим) — scripts/stand.sh.
#
#   deploy/staging.sh up <ветка> [--no-notify]  — поднять стенд (порт 8081 или первый свободный)
#   deploy/staging.sh down                       — снести стенд и тома полностью
#   deploy/staging.sh status                     — адрес работающего стенда
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd -P)
staging_dir="$(dirname "$root")/ihelp.am-staging"
proj="ihelp-staging"
common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)
info="$common/cc/staging.json"
mkdir -p "$(dirname "$info")"

_compose_down() {
  [ -d "$staging_dir" ] || return 0
  (cd "$staging_dir" && COMPOSE_PROJECT_NAME="$proj" docker compose down -v) 2>/dev/null || true
}

down() {
  _compose_down
  git -C "$root" worktree remove --force "$staging_dir" 2>/dev/null || rm -rf "$staging_dir" 2>/dev/null || true
  rm -f "$info"
  echo "✓ Стенд $proj снесён"
}

status_cmd() {
  [ -f "$info" ] || { echo "Стенд не запущен: deploy/staging.sh up <ветка>"; exit 1; }
  jq -r '"Стенд: http://127.0.0.1:\(.port)  ветка: \(.branch)\n  Вход: http://127.0.0.1:\(.port)/api/auth/link?token=\(.token)"' "$info"
}

up() {
  local branch="" no_notify=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-notify) no_notify=true ;;
      -*) echo "Неизвестный флаг: $1"; echo "Использование: deploy/staging.sh up <ветка> [--no-notify]"; exit 1 ;;
      *) branch="$1" ;;
    esac
    shift
  done
  [ -n "$branch" ] || { echo "Укажи ветку: deploy/staging.sh up <ветка> [--no-notify]"; exit 1; }
  [ -f "$root/.env" ] || { echo "✗ Файл .env не найден в $root"; exit 1; }

  # Найти свободный порт: 8081 — стенд деплоера, 8082–8099 — разработчики
  local port=0
  for p in 8081 $(seq 8082 8099); do
    ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN || { port=$p; break; }
  done
  [ "$port" -gt 0 ] || { echo "✗ Нет свободного порта 8081–8099"; exit 1; }

  # Снести предыдущий стенд
  if [ -f "$info" ] || [ -d "$staging_dir" ]; then
    echo "▶ Сносим предыдущий стенд..."
    _compose_down
    git -C "$root" worktree remove --force "$staging_dir" 2>/dev/null || rm -rf "$staging_dir" 2>/dev/null || true
    rm -f "$info"
  fi

  # Создать worktree с нужной веткой
  echo "▶ Получаем ветку $branch..."
  git -C "$root" fetch origin "$branch"
  git -C "$root" worktree add "$staging_dir" "origin/$branch"

  # Скопировать .env и подставить свежий токен входа (прод-токен не светим)
  cp "$root/.env" "$staging_dir/.env"
  local token
  token=$(openssl rand -hex 16)
  if grep -q '^ADMIN_LOGIN_TOKEN=' "$staging_dir/.env"; then
    sed -i "s|^ADMIN_LOGIN_TOKEN=.*|ADMIN_LOGIN_TOKEN=$token|" "$staging_dir/.env"
  else
    echo "ADMIN_LOGIN_TOKEN=$token" >> "$staging_dir/.env"
  fi

  # Предупреждение о реальных токенах
  printf '\n'
  printf '╔════════════════════════════════════════════════════════════════════════╗\n'
  printf '║  ВНИМАНИЕ: стенд использует копию .env с настоящими токенами.         ║\n'
  printf '║  ALERT_BOT_TOKEN/ALERT_CHAT_ID могут отправить тех-алерты в реальный  ║\n'
  printf '║  Telegram-чат. Передай --no-notify, чтобы обнулить их в staging .env. ║\n'
  printf '║  Уведомления Telegram/WhatsApp/почта хранятся в базе настроек;         ║\n'
  printf '║  на свежем стенде их нет — не вводи их в настройках без необходимости. ║\n'
  printf '╚════════════════════════════════════════════════════════════════════════╝\n'
  printf '\n'

  if $no_notify; then
    sed -i 's|^\(ALERT_BOT_TOKEN\)=.*|\1=|' "$staging_dir/.env"
    sed -i 's|^\(ALERT_CHAT_ID\)=.*|\1=|' "$staging_dir/.env"
    echo "▶ --no-notify: ALERT_BOT_TOKEN и ALERT_CHAT_ID обнулены в staging .env"
  fi

  # Запустить через docker compose (1:1 с продом)
  echo "▶ Собираем образ и запускаем стенд на порту $port..."
  (
    cd "$staging_dir"
    COMPOSE_PROJECT_NAME="$proj" \
    HTTP_BIND="127.0.0.1:$port" \
    HTTPS_BIND="127.0.0.1:$((port + 363))" \
    APP_URL="http://127.0.0.1:$port" \
      docker compose up -d --build
  )

  # Ждать готовности (до 5 минут — сборка Next.js долгая)
  echo "▶ Ожидаем готовности приложения (до 5 минут)..."
  local ok=false
  for _ in $(seq 1 100); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$port/api/health" 2>/dev/null)" = "200" ]; then
      ok=true; break
    fi
    sleep 3
  done

  if ! $ok; then
    echo "✗ Приложение не поднялось. Логи:"
    echo "  COMPOSE_PROJECT_NAME=$proj docker compose --project-directory $staging_dir logs app"
    _compose_down
    git -C "$root" worktree remove --force "$staging_dir" 2>/dev/null || true
    rm -f "$info"
    exit 1
  fi

  jq -n \
    --arg port "$port" \
    --arg branch "$branch" \
    --arg dir "$staging_dir" \
    --arg token "$token" \
    '{port:($port|tonumber), branch:$branch, dir:$dir, token:$token}' > "$info"

  echo "✓ Стенд $proj: http://127.0.0.1:$port (ветка $branch)"
  echo "  Вход владельцем: http://127.0.0.1:$port/api/auth/link?token=$token"
  echo "  Снести: deploy/staging.sh down"
}

case "${1:-}" in
  up)     shift; up "$@" ;;
  down)   down ;;
  status) status_cmd ;;
  *)      sed -n '2,14p' "$0"; exit 1 ;;
esac
