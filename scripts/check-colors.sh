#!/usr/bin/env bash
# Проверяет src/ на хардкод цветов: #hex, bg-white, text-white, text-black, bg-[#…]
# в компонентах. Нарушение DESIGN.md: в компонентах только токены темы (bg-brand, text-ink…).
#
# Исключения по DESIGN.md:
#   opengraph-image.tsx — генератор OG-картинок, CSS не применяется, цвета продублированы
#   ContentManagers.tsx — color-picker баннеров, данные для поля ввода
#   строки с themeColor  — цвет панели браузера в layout.tsx
#
# Код возврата: 0 — чисто; 1 — нарушения найдены.
set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
colors=$(grep -rn --include="*.tsx" \
  -E '#[0-9a-fA-F]{6}|\b(bg|text)-(white|black)\b|bg-\[#' \
  "$root/src/" \
  | grep -v 'opengraph-image\.tsx' \
  | grep -v 'ContentManagers\.tsx' \
  | grep -v 'themeColor' \
  || true)
if [ -z "$colors" ]; then
  echo "  ✓ хардкод цветов не найден"
  exit 0
else
  echo "  ✗ найдены хардкод цвета (#hex / bg-white / text-white / text-black):"
  echo "$colors" | head -10
  exit 1
fi
