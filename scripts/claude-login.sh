#!/usr/bin/env bash
# Вход воркеров в Claude по вашей подписке — один раз (токен действует год).
# Воркеры (claude -p на сервере) тратят лимит подписки, а не API: для этого им нужен токен подписки.
#   scripts/claude-login.sh          — войти: откроется ссылка, войдите в свой аккаунт Claude, вставьте код сюда
#   scripts/claude-login.sh check    — проверить, что вход работает (одно короткое обращение к модели)
#   scripts/claude-login.sh remove   — удалить токен (воркеры перестанут запускаться)
# Токен сохраняется в /opt/ihelp.am/.env (CLAUDE_CODE_OAUTH_TOKEN) и нигде не печатается.
set -uo pipefail
# Токен всегда в .env основной копии (/opt/ihelp.am), даже если скрипт запущен из рабочей копии задачи
root=$(cd "$(dirname "$0")/.." && git rev-parse --path-format=absolute --git-common-dir 2> /dev/null | xargs -r dirname)
[ -n "$root" ] || root=$(cd "$(dirname "$0")/.." && pwd)
env="$root/.env"

save() {
  local tmp
  tmp=$(mktemp)
  grep -v '^CLAUDE_CODE_OAUTH_TOKEN=' "$env" > "$tmp"
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$1" >> "$tmp"
  cat "$tmp" > "$env"
  rm -f "$tmp"
  chmod 600 "$env"
}

check() {
  local tok
  tok=$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' "$env" | tail -n 1 | cut -d= -f2-)
  [ -n "$tok" ] || { echo "✗ Токена нет: scripts/claude-login.sh"; return 1; }
  local out
  out=$(cd /tmp && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN="$tok" timeout 120 claude -p "Ответь одним словом: работает" --model haiku --output-format text --strict-mcp-config 2>&1)
  if grep -qi "работает" <<< "$out"; then
    echo "✓ Вход работает: воркеры будут тратить лимит подписки Claude"
  else
    echo "✗ Вход не работает: ${out:0:200}"
    return 1
  fi
}

case "${1:-}" in
  check) check; exit $? ;;
  remove) save "" && sed -i '/^CLAUDE_CODE_OAUTH_TOKEN=$/d' "$env" && echo "✓ Токен удалён"; exit 0 ;;
esac

echo "Шаг 1 из 2. Сейчас Claude покажет ссылку. Откройте её, войдите в свой аккаунт Claude (тот, где тариф),"
echo "подтвердите доступ и вставьте код обратно в этот терминал."
echo
log=$(mktemp)
chmod 600 "$log"
# script сохраняет ввод и вывод, чтобы забрать токен без ручного копирования
script -q -c "claude setup-token" "$log"
# Длинный токен терминал переносит на несколько строк: убираем оформление и склеиваем продолжение
tok=$(python3 - "$log" << 'PY'
import re, sys
t = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
t = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", t)
t = re.sub(r"\x1b\][^\x07]*\x07", "", t).replace("\r", "")
i = t.rfind("sk-ant-oat")
if i < 0:
    sys.exit(0)
tok = ""
for line in t[i:].split("\n"):
    part = re.sub(r"^[^A-Za-z0-9_-]+|[^A-Za-z0-9_-]+$", "", line)
    if part and re.fullmatch(r"[A-Za-z0-9_-]+", part):
        tok += part
    elif not part and not tok:
        continue
    else:
        break
print(tok)
PY
)
shred -u "$log" 2> /dev/null || rm -f "$log"
if [ -z "$tok" ]; then
  echo
  echo "Не нашёл токен в выводе. Скопируйте его вручную (начинается с sk-ant-oat) и вставьте сюда — ввод скрыт:"
  read -rs tok
fi
[[ "$tok" == sk-ant-* ]] || { echo "✗ Это не похоже на токен Claude. Попробуйте ещё раз: scripts/claude-login.sh"; exit 1; }
# Настоящий токен подписки длиннее 90 символов: короче — значит, обрезан при переносе строки
[ "${#tok}" -ge 90 ] || { echo "✗ Токен обрезан (${#tok} символов). Растяните окно терминала шире и запустите снова: scripts/claude-login.sh"; exit 1; }
save "$tok"
echo
echo "Шаг 2 из 2. Проверяю вход…"
check
