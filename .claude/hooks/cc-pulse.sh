#!/usr/bin/env bash
# Пульс исполнителя для Control Center (docs/DEV_SYSTEM.md, «Аренда, пульс и сторож»).
# Хук PostToolUse: пока чат работает над задачей, взятой через scripts/cc.mjs, не чаще раза в 5 минут
# продлевает её аренду. Так живой чат держит задачу сам, а брошенный — перестаёт, и сторож это видит.
# Какую задачу держит чат: ветка task/<КЛЮЧ> рабочей копии, в которой он работает, иначе — задача,
# которую этот чат взял командой take/next (запоминается по id сессии).
# Никогда не блокирует работу: любая ошибка — тихий выход с кодом 0. Если задачу вернули в очередь
# или перехватили, один раз говорит об этом Claude, чтобы тот остановился.
set -u
input=$(cat 2>/dev/null) || exit 0
command -v jq >/dev/null 2>&1 || exit 0
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }
cwd=$(field '.cwd')
[ -n "$cwd" ] && [ -d "$cwd" ] || exit 0
session=$(field '.session_id' | tr -cd 'A-Za-z0-9_-')
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
cc="$common/cc"

# Чат только что взял задачу — запоминаем, чтобы пульс шёл и из других папок
if [ -n "$session" ] && [ "$(field '.tool_name')" = "Bash" ] && field '.tool_input.command' | grep -q 'cc\.mjs \(take\|next\|test\)'; then
  taken=$(field '.tool_response.stdout // .tool_response' | sed -n 's/.*✓ \([A-Z][A-Z0-9-]*\) взята.*/\1/p' | head -n 1)
  [ -n "$taken" ] && mkdir -p "$cc/sessions" 2>/dev/null && printf '%s' "$taken" > "$cc/sessions/$session"
fi

key=""
branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
case "$branch" in task/*) key=${branch#task/} ;; esac
# Копия тестировщика — без ветки (коммит ветки задачи), папка test-<КЛЮЧ>
if [ -z "$key" ]; then
  top=$(basename "$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)")
  case "$top" in test-*) key=${top#test-} ;; esac
fi
if { [ -z "$key" ] || [ ! -f "$cc/tasks/$key.json" ]; } && [ -n "$session" ] && [ -f "$cc/sessions/$session" ]; then
  key=$(tr -cd 'A-Z0-9-' < "$cc/sessions/$session")
fi
state="$cc/tasks/$key.json"
[ -n "$key" ] && [ -f "$state" ] || exit 0
agent=$(jq -r '.agent // empty' "$state" 2>/dev/null)
[ -n "$agent" ] || exit 0

# Не чаще раза в 5 минут
stamp="$cc/pulse/$key"
mkdir -p "$cc/pulse" 2>/dev/null || exit 0
if [ -f "$stamp" ] && [ $(( $(date +%s) - $(stat -c %Y "$stamp" 2>/dev/null || echo 0) )) -lt 300 ]; then exit 0; fi
touch "$stamp" 2>/dev/null

root=$(dirname "$common")
env_val() { grep -E "^$1=" "$root/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"'"'"; }
api_key=${CC_AGENT_KEY:-$(env_val CC_AGENT_KEY)}
[ -n "$api_key" ] || exit 0
url=${CC_URL:-$(env_val CC_URL)}
url=${url:-http://127.0.0.1:8080/api/cc}

body=$(jq -nc --arg a "$agent" --arg k "$key" --arg b "task/$key" --arg s "$session" '{action:"heartbeat",agent:$a,key:$k,branch:$b,session:$s}')
# Ключ — через stdin, а не аргументом: иначе он виден в списке процессов (ps)
resp=$(printf 'x-cc-key: %s\n' "$api_key" | curl -s -m 3 -H @- -H 'Content-Type: application/json' -d "$body" "$url" 2>/dev/null)
# Ответ API — объект с полем ok (true или false); `// empty` здесь не годится: для jq false — «пусто»
answered=$(printf '%s' "$resp" | jq -r 'if type == "object" and has("ok") then "yes" else empty end' 2>/dev/null)
if [ -z "$answered" ]; then
  # Control Center не ответил — повторим через минуту, а не через 5
  touch -d "@$(( $(date +%s) - 240 ))" "$stamp" 2>/dev/null
  exit 0
fi
[ "$(printf '%s' "$resp" | jq -r '.lost // false' 2>/dev/null)" = "true" ] || exit 0

# Задача больше не за этим чатом: пульс по ней прекращаем
rm -f "$state" 2>/dev/null
[ -n "$session" ] && rm -f "$cc/sessions/$session" 2>/dev/null
status=$(printf '%s' "$resp" | jq -r '.status // "?"' 2>/dev/null)
holder=$(printf '%s' "$resp" | jq -r '.holder // "никто"' 2>/dev/null)
# Сдана, заблокирована или закрыта — это нормальный конец работы, тревожить не о чем
case "$status" in ready | backlog | in_progress) ;; *) exit 0 ;; esac
jq -nc --arg r "Задача $key больше не за вами (статус: $status, держит: $holder) — её вернул в очередь сторож или перехватил другой исполнитель. Остановитесь: не пушьте и не сдавайте. Посмотрите ленту (node scripts/cc.mjs show $key) и, если задача свободна, возьмите её заново (take $key); иначе сообщите владельцу." '{decision:"block",reason:$r}'
exit 0
