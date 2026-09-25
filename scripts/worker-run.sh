#!/usr/bin/env bash
# Один запуск воркера: claude -p под подпиской Claude, в которую вошёл Claude Code на сервере, — не API.
# Запускает диспетчер (scripts/dispatcher.mjs) через systemd-run; вручную запускать не нужно.
#   scripts/worker-run.sh <triage|dev|nocode|tester|deployer> <модель> <файл с заданием>
# Права: только инструменты своей роли. Код в прод попадает только через scripts/deploy-task.sh (деплоер),
# .env и чужие проекты не читаются, в main напрямую не пушится. Ответ — JSON claude -p в stdout.
set -uo pipefail
role="$1"
model="$2"
prompt="$3"

# Никаких API-ключей: иначе claude -p тратил бы деньги API вместо лимита подписки
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX
# Вход по подписке: токен, выпущенный scripts/claude-login.sh (claude setup-token), хранится в .env
root=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE_CODE_OAUTH_TOKEN=$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' "$root/.env" 2> /dev/null | tail -n 1 | cut -d= -f2-)
export CLAUDE_CODE_OAUTH_TOKEN
[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ] || { echo '{"is_error":true,"result":"Not logged in: нет токена подписки, нужен scripts/claude-login.sh"}'; exit 2; }

# Команды в обычных формах: «cd папка && …», «bash scripts/check.sh 2>&1», полный путь к скрипту.
# Составная команда проходит, только если разрешена каждая её часть: cd сам по себе ничего не меняет
common=("Bash(cd *)" "Bash(node scripts/cc.mjs *)" "Bash(node */scripts/cc.mjs *)")
check=("Bash(scripts/check.sh*)" "Bash(bash scripts/check.sh*)" "Bash(*/scripts/check.sh*)" "Bash(bash */scripts/check.sh*)"
  "Bash(scripts/stand.sh *)" "Bash(bash scripts/stand.sh *)" "Bash(*/scripts/stand.sh *)" "Bash(bash */scripts/stand.sh *)" "Bash(node scripts/stand-shot.mjs *)" "Bash(node */scripts/stand-shot.mjs *)")
allow=(Read Glob Grep Edit Write TodoWrite "${common[@]}" "${check[@]}"
  "Bash(git *)"
  "Bash(ls *)" "Bash(ls)" "Bash(pwd)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(jq *)"
  "Bash(diff *)" "Bash(sort *)" "Bash(sed -n *)" "Bash(node --check *)" "Bash(bash -n *)" "Bash(python3 -c *)" "Bash(mkdir *)" "Bash(date)"
  "Bash(curl -s http://127.0.0.1:*)")
deny=("Bash(git push origin main*)" "Bash(git push * main)" "Bash(git push -f*)" "Bash(git push --force*)" "Bash(git push * --force*)"
  "Bash(sudo *)" "Bash(systemctl *)" "Bash(systemd-run *)" "Bash(pm2 *)" "Bash(rm -rf *)" "Bash(docker *)"
  "Bash(deploy/update.sh*)" "Bash(deploy/rollback.sh*)" "Bash(cat *.env*)" "Bash(grep * .env*)" "Bash(* /opt/ihelp.am/.env*)"
  "Read(//opt/ihelp.am/.env)" "Read(//var/www/**)" "Read(//etc/**)" "Read(//root/.claude/**)"
  # Субагенты удваивают расход лимита подписки и работают вне этих правил — воркеру они не нужны
  "Agent")

case "$role" in
  deployer)
    # Деплоер ничего не правит руками: только проверка и одна команда выкладки
    allow=(Read Glob Grep TodoWrite "${common[@]}" "Bash(git log *)" "Bash(git diff *)" "Bash(git show *)" "Bash(git status)" "Bash(git fetch *)" "Bash(git rev-parse *)"
      "Bash(scripts/deploy-task.sh *)" "Bash(bash scripts/deploy-task.sh *)" "Bash(/opt/ihelp.am/scripts/deploy-task.sh *)"
      "Bash(deploy/smoke.sh*)" "Bash(bash deploy/smoke.sh*)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(ls *)")
    deny+=("Edit" "Write" "Bash(git merge *)" "Bash(git checkout *)" "Bash(git reset *)" "Bash(git commit *)" "Bash(git push *)")
    ;;
  tester)
    # Тестировщик код не правит: проверяет и пишет вердикт
    deny+=("Edit" "Write" "Bash(git commit *)" "Bash(git push *)")
    ;;
  triage)
    # Триаж только читает код и документы и работает с карточками через scripts/cc.mjs (поля — через --data)
    allow=(Read Glob Grep TodoWrite "${common[@]}" "Bash(git log *)" "Bash(git show *)" "Bash(git diff *)" "Bash(git status)"
      "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)")
    deny+=("Edit" "Write" "Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(cat >*)" "Bash(cat *>*)")
    ;;
  nocode)
    # «Продукт и не-код»: читает проект, ищет и читает страницы в интернете, проверяет DNS, работает с карточками.
    # Файлы не правит, git не пишет: результат — в карточке. Аккаунты, оплату и пароли делает человек
    allow=(Read Glob Grep TodoWrite WebSearch WebFetch "${common[@]}" "Bash(dig *)" "Bash(host *)" "Bash(nslookup *)" "Bash(whois *)"
      "Bash(git log *)" "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)")
    deny+=("Edit" "Write" "NotebookEdit" "Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(cat >*)" "Bash(cat *>*)" "Bash(curl *)")
    ;;
  dev) ;;
  *) echo '{"is_error":true,"result":"неизвестная роль"}'; exit 2 ;;
esac

exec claude -p --model "$model" --output-format json --permission-mode dontAsk --strict-mcp-config \
  --allowedTools "${allow[@]}" --disallowedTools "${deny[@]}" < "$prompt"
