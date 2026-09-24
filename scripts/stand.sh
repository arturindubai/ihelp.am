#!/usr/bin/env bash
# Лёгкий изолированный стенд для проверки ветки: свежая база с миграциями и демо-данными из этой ветки,
# приложение в режиме разработки на 127.0.0.1:<порт>. Без сборки образа, без копии .env: настоящих токенов
# (Telegram, SMS, почта) на стенде нет — уведомления никуда не уйдут. Прод и соседи не затрагиваются.
#   scripts/stand.sh up [порт]   — поднять из текущей рабочей копии (порт по умолчанию — первый свободный 8082–8099)
#   scripts/stand.sh status      — адрес, порт и ссылка входа владельца
#   scripts/stand.sh down        — снести стенд вместе с базой
# Скриншоты: node scripts/stand-shot.mjs <путь> [путь…]  (вход владельцем — сам)
set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
name="ihelp-stand-$(basename "$root" | tr 'A-Z_' 'a-z-' | tr -cd 'a-z0-9-')"
common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)
info="$common/cc/stands/$name.json"
mkdir -p "$(dirname "$info")"

down() {
  docker rm -f "$name-app" "$name-db" > /dev/null 2>&1
  docker network rm "$name" > /dev/null 2>&1
  rm -f "$info"
  echo "✓ Стенд $name снесён"
}

case "${1:-}" in
  down) down; exit 0 ;;
  status)
    [ -f "$info" ] || { echo "Стенда нет: scripts/stand.sh up"; exit 1; }
    jq -r '"Стенд: http://127.0.0.1:\(.port)  ·  вход владельцем: http://127.0.0.1:\(.port)/api/auth/link?token=\(.token)"' "$info"
    exit 0 ;;
  up) ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac

port="${2:-}"
if [ -z "$port" ]; then
  for p in $(seq 8082 8099); do ss -ltn "sport = :$p" | grep -q LISTEN || { port=$p; break; }; done
fi
[ -n "$port" ] || { echo "✗ Нет свободного порта 8082–8099"; exit 1; }
down > /dev/null
token=$(openssl rand -hex 16)
cckey=$(openssl rand -hex 16)
db="postgresql://app:stand@$name-db:5432/homeservices"
mounts=(-v "$root/src:/app/src:ro" -v "$root/prisma:/app/prisma:ro" -v "$root/messages:/app/messages:ro")

docker network create "$name" > /dev/null || exit 1
docker run -d --name "$name-db" --network "$name" --memory 512m -e POSTGRES_DB=homeservices -e POSTGRES_USER=app -e POSTGRES_PASSWORD=stand postgres:16-alpine > /dev/null || exit 1
for _ in $(seq 1 30); do docker exec "$name-db" pg_isready -U app -d homeservices > /dev/null 2>&1 && break; sleep 1; done

echo "▶ Миграции и демо-данные ветки"
docker run --rm --network "$name" "${mounts[@]}" -e DATABASE_URL="$db" -e ADMIN_PHONE=+37400000099 -w /app --entrypoint bash homecare-migrate \
  -c 'npx prisma generate > /dev/null 2>&1 && npx prisma migrate deploy 2>&1 | tail -n 2 && npx tsx prisma/seed.ts 2>&1 | tail -n 3' || { echo "✗ Миграции или сид упали"; down > /dev/null; exit 1; }

echo "▶ Приложение (режим разработки)"
docker run -d --name "$name-app" --network "$name" -p "127.0.0.1:$port:3000" --memory 3g "${mounts[@]}" \
  -e DATABASE_URL="$db" -e SESSION_SECRET="$(openssl rand -hex 32)" -e CRON_SECRET="$(openssl rand -hex 16)" \
  -e CC_AGENT_KEY="$cckey" -e ADMIN_LOGIN_TOKEN="$token" -e ADMIN_PHONE=+37400000099 \
  -e APP_URL="http://127.0.0.1:$port" -e OTP_DEV_MODE=false -e COOKIE_SECURE=false -e UPLOAD_DIR=/tmp/uploads \
  -e SETTINGS_ENCRYPTION_KEY="$(openssl rand -hex 32)" -e NEXT_TELEMETRY_DISABLED=1 \
  -w /app --entrypoint bash homecare-migrate -c 'npx prisma generate > /dev/null 2>&1; mkdir -p /tmp/uploads; npx next dev -p 3000' > /dev/null || { down > /dev/null; exit 1; }

for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 60 "http://127.0.0.1:$port/api/health")" = 200 ] && break
  sleep 3
done
[ "$(curl -s -o /dev/null -w '%{http_code}' -m 60 "http://127.0.0.1:$port/api/health")" = 200 ] || { echo "✗ Приложение не поднялось: docker logs $name-app"; exit 1; }
jq -n --arg port "$port" --arg token "$token" --arg name "$name" --arg cckey "$cckey" '{name:$name, port:($port|tonumber), token:$token, ccKey:$cckey}' > "$info"
echo "✓ Стенд $name: http://127.0.0.1:$port (первое открытие страницы компилируется до минуты)"
echo "  Вход владельцем: http://127.0.0.1:$port/api/auth/link?token=$token · Снести: scripts/stand.sh down"
echo "  Control Center стенда из командной строки: CC_URL=http://127.0.0.1:$port/api/cc CC_AGENT_KEY=$cckey node scripts/cc.mjs …"
