#!/usr/bin/env bash
# Гейт перед выкладкой: только секреты в собранном коде.
# Проверки по исходному коду (цвета, строки мимо переводов, демо-данные, миграции)
# перенесены в scripts/check.sh, который запускается ДО сборки образа.
# Вызывается из deploy/update.sh после сборки образа.
# Запустить вручную: deploy/gate.sh
# Код 0 — чисто; 1 — нарушения, выкладка не продолжается.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

# Выводит результат проверки; при нарушениях показывает до 10 строк и устанавливает fail=1.
report() {
  local name="$1" output="$2"
  if [ -z "$output" ]; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name:"
    echo "$output" | head -10 | sed 's/^/    /'
    fail=1
  fi
}

# ── Секреты в собранном .next/static ──────────────────────────────────────
# Клиентский JS не должен содержать имена секретных переменных окружения —
# их не должны видеть ни браузер, ни сканер ответов (техаудит 21.09, раздел 6).
# Проверяем внутри образа, собранного «docker compose build».
echo "Гейт: секреты в собранном коде"
if ! docker image inspect homecare-app:latest > /dev/null 2>&1; then
  echo "  ⚠ образ homecare-app:latest не найден — секреты не проверены (запустите через deploy/update.sh)"
else
  secret_pat="POSTGRES_PASSWORD|SESSION_SECRET|CRON_SECRET|SETTINGS_ENCRYPTION_KEY"
  secret_pat="$secret_pat|CC_AGENT_KEY|CLAUDE_CODE_OAUTH_TOKEN|ADMIN_LOGIN_TOKEN"
  secret_pat="$secret_pat|DATABASE_URL|OTP_DEV_MODE|VAPID_PRIVATE_KEY"
  secrets=$(docker run --rm homecare-app:latest sh -c \
    "grep -rl \"$secret_pat\" /app/.next/static/ 2>/dev/null" \
    || true)
  report "имена секретных переменных в клиентском JS" "$secrets"
fi

if [ "$fail" = 0 ]; then echo "GATE OK"; else echo "GATE FAILED"; fi
exit "$fail"
