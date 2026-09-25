#!/usr/bin/env bash
# Гейт перед выкладкой: хардкод цветов, строки мимо переводов, секреты в сборке.
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

# ── 1. Хардкод цветов ────────────────────────────────────────────────────────
# Нарушение DESIGN.md: в компонентах только токены темы (bg-brand, text-ink…),
# никаких #hex, bg-white, text-black, bg-[#…].
# Исключения по DESIGN.md:
#   opengraph-image.tsx — генератор OG-картинок, не читает CSS, цвета продублированы
#   ContentManagers.tsx — color-picker баннеров, данные для поля ввода
#   строки с themeColor  — цвет панели браузера в layout.tsx
echo "Гейт: хардкод цветов"
colors=$(grep -rn --include="*.tsx" \
  -E '#[0-9a-fA-F]{6}|\b(bg|text)-(white|black)\b|bg-\[#' \
  src/ \
  | grep -v 'opengraph-image\.tsx' \
  | grep -v 'ContentManagers\.tsx' \
  | grep -v 'themeColor' \
  || true)
report "хардкод #hex / bg-white / text-black в компонентах" "$colors"

# ── 2. Строки интерфейса мимо next-intl ──────────────────────────────────────
# Нарушение DESIGN.md: тексты — только через messages/*.json, не строками в коде.
# Исключение — ARCH-7 (отдельная задача): страницы 404 содержат русский fallback
# намеренно (при сбое i18n-контекста показывается русский текст).
echo "Гейт: строки интерфейса мимо next-intl"
strings=$(grep -rnP '>\p{Cyrillic}' src/ --include="*.tsx" \
  | grep -v 'not-found\.tsx' \
  || true)
report "кириллица напрямую в JSX (не через t())" "$strings"

# ── 3. Секреты в собранном .next/static ──────────────────────────────────────
# Клиентский JS не должен содержать имена секретных переменных окружения —
# их не должны видеть ни браузер, ни сканер ответов (техаудит 21.09, раздел 6).
# Проверяем внутри образа, собранного «docker compose build».
echo "Гейт: секреты в собранном коде"
if ! docker image inspect homecare-app:latest > /dev/null 2>&1; then
  echo "  ⚠ образ homecare-app:latest не найден — секреты не проверены (запустите через deploy/update.sh)"
else
  secret_pat="POSTGRES_PASSWORD|SESSION_SECRET|CRON_SECRET|SETTINGS_ENCRYPTION_KEY"
  secret_pat="$secret_pat|CC_AGENT_KEY|CLAUDE_CODE_OAUTH_TOKEN|ADMIN_LOGIN_TOKEN"
  secret_pat="$secret_pat|DATABASE_URL|OTP_DEV_MODE"
  secrets=$(docker run --rm homecare-app:latest sh -c \
    "grep -rl \"$secret_pat\" /app/.next/static/ 2>/dev/null" \
    || true)
  report "имена секретных переменных в клиентском JS" "$secrets"
fi

if [ "$fail" = 0 ]; then echo "GATE OK"; else echo "GATE FAILED"; fi
exit "$fail"
