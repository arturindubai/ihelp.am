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

# Команды в обычных формах: «bash scripts/check.sh», полный путь к скрипту. Единая форма команды доски для всех ролей —
# «node /opt/ihelp.am/scripts/cc.mjs команда КЛЮЧ … --agent имя»: без cd, по одной команде за вызов (DEV-79).
# Составная команда проходит, только если разрешена каждая её часть. Правило «Bash(cd *)» разрешает переход только
# внутри рабочей папки запуска: cd, ls, cat, grep с путём вне неё Claude Code отклоняет сам, независимо от этого списка.
# Поэтому «cd /opt/ihelp.am && …» у разработчика и тестировщика (они запущены в .claude/worktrees/…) не проходит.
# После правки этого файла и docs/roles/ — сверка: node scripts/check-role-commands.mjs
common=("Bash(cd *)" "Bash(node scripts/cc.mjs *)" "Bash(node */scripts/cc.mjs *)")
check=("Bash(scripts/check.sh*)" "Bash(bash scripts/check.sh*)" "Bash(*/scripts/check.sh*)" "Bash(bash */scripts/check.sh*)"
  "Bash(scripts/stand.sh *)" "Bash(bash scripts/stand.sh *)" "Bash(*/scripts/stand.sh *)" "Bash(bash */scripts/stand.sh *)" "Bash(node scripts/stand-shot.mjs *)" "Bash(node */scripts/stand-shot.mjs *)")
# Обновление package-lock.json в образе сборки (нужно, если задача меняет package.json)
lockupdate=("Bash(scripts/lock-update.sh*)" "Bash(bash scripts/lock-update.sh*)" "Bash(*/scripts/lock-update.sh*)" "Bash(bash */scripts/lock-update.sh*)")
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
      "Bash(scripts/deploy-task.sh *)" "Bash(bash scripts/deploy-task.sh *)" "Bash(/opt/ihelp.am/scripts/deploy-task.sh *)" "Bash(bash /opt/ihelp.am/scripts/deploy-task.sh *)"
      "Bash(scripts/deploy-batch.sh *)" "Bash(bash scripts/deploy-batch.sh *)" "Bash(/opt/ihelp.am/scripts/deploy-batch.sh *)" "Bash(bash /opt/ihelp.am/scripts/deploy-batch.sh *)"
      "Bash(deploy/smoke.sh*)" "Bash(bash deploy/smoke.sh*)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(ls *)"
      "Write(//opt/ihelp.am/data/tmp/deployer/**)" "Edit(//opt/ihelp.am/data/tmp/deployer/**)")
    deny+=("Bash(git merge *)" "Bash(git checkout *)" "Bash(git reset *)" "Bash(git commit *)" "Bash(git push *)")
    ;;
  tester)
    # Тестировщик код не правит: проверяет и пишет вердикт.
    # Сбрасываем allow: убираем широкие Edit/Write из базового массива, оставляем только tmp-папку
    allow=(Read Glob Grep TodoWrite "${common[@]}" "${check[@]}"
      "Bash(git *)"
      "Bash(ls *)" "Bash(ls)" "Bash(pwd)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(jq *)"
      "Bash(diff *)" "Bash(sort *)" "Bash(sed -n *)" "Bash(node --check *)" "Bash(bash -n *)" "Bash(python3 -c *)" "Bash(mkdir *)" "Bash(date)"
      "Bash(curl -s http://127.0.0.1:*)"
      "Write(//opt/ihelp.am/data/tmp/tester/**)" "Edit(//opt/ihelp.am/data/tmp/tester/**)")
    deny+=("Bash(git commit *)" "Bash(git push *)")
    ;;
  triage)
    # Триаж только читает код и документы и работает с карточками через scripts/cc.mjs (поля — через --data).
    # Write/Edit не нужны в deny: dontAsk блокирует всё, чего нет в allow; tmp-папка — для --text-file при длинных текстах
    allow=(Read Glob Grep TodoWrite "${common[@]}" "Bash(git log *)" "Bash(git show *)" "Bash(git diff *)" "Bash(git status)"
      "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)"
      "Write(//opt/ihelp.am/data/tmp/triage/**)" "Edit(//opt/ihelp.am/data/tmp/triage/**)")
    deny+=("Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(cat >*)" "Bash(cat *>*)")
    ;;
  product)
    # Продакт: читает проект, документы и Библиотеку, ищет в интернете, работает с карточками и записями Библиотеки через cc.mjs.
    # Файлы не правит, git не пишет: требования живут в карточках и в Библиотеке; tmp-папка — для --text-file
    allow=(Read Glob Grep TodoWrite WebSearch WebFetch "${common[@]}" "Bash(git log *)" "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)" "Bash(mkdir *)" "Bash(cat >*)" "Bash(cat *>*)"
      "Write(//opt/ihelp.am/data/tmp/product/**)" "Edit(//opt/ihelp.am/data/tmp/product/**)")
    deny+=("NotebookEdit" "Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(curl *)")
    ;;
  designer)
    # Дизайнер: то же, что продакт, плюс макеты — HTML в data/mockups/<КЛЮЧ>/, скриншоты scripts/mockup-shot.mjs, вложение cc.mjs attach.
    # Писать может только в data/mockups и data/tmp/designer: код проекта закрыт (режим dontAsk запрещает всё, чего нет в allow)
    allow=(Read Glob Grep TodoWrite WebSearch WebFetch "${common[@]}" "Write(//opt/ihelp.am/data/mockups/**)" "Edit(//opt/ihelp.am/data/mockups/**)"
      "Write(//opt/ihelp.am/data/tmp/designer/**)" "Edit(//opt/ihelp.am/data/tmp/designer/**)"
      "Bash(node scripts/mockup-shot.mjs *)" "Bash(node */scripts/mockup-shot.mjs *)" "Bash(mkdir -p data/mockups/*)" "Bash(mkdir -p /opt/ihelp.am/data/mockups/*)"
      "Bash(git log *)" "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)")
    deny+=("NotebookEdit" "Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(curl *)")
    ;;
  nocode)
    # «Продукт и не-код»: читает проект, ищет и читает страницы в интернете, проверяет DNS, работает с карточками.
    # Файлы не правит, git не пишет: результат — в карточке; tmp-папка — для --text-file при длинных отчётах
    allow=(Read Glob Grep TodoWrite WebSearch WebFetch "${common[@]}" "Bash(dig *)" "Bash(host *)" "Bash(nslookup *)" "Bash(whois *)"
      "Bash(git log *)" "Bash(ls *)" "Bash(ls)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(date)"
      "Write(//opt/ihelp.am/data/tmp/nocode/**)" "Edit(//opt/ihelp.am/data/tmp/nocode/**)")
    deny+=("NotebookEdit" "Bash(git commit *)" "Bash(git push *)" "Bash(git checkout *)" "Bash(git merge *)" "Bash(git reset *)" "Bash(cat >*)" "Bash(cat *>*)" "Bash(curl *)")
    ;;
  dev)
    # Разработчик пишет только в свою рабочую копию (.claude/worktrees/**) и data/tmp/dev/.
    # Незащищённые Edit/Write из базового массива убраны: запись в корень /opt/ihelp.am
    # и в .claude/worktrees/ напрямую запрещена (именно так однажды возник .claire/ в корне).
    # lock-update.sh разрешён явно: он нужен при изменении package.json.
    allow=(Read Glob Grep TodoWrite "${common[@]}" "${check[@]}" "${lockupdate[@]}"
      "Bash(git *)"
      "Bash(ls *)" "Bash(ls)" "Bash(pwd)" "Bash(cat *)" "Bash(head *)" "Bash(tail *)" "Bash(grep *)" "Bash(find *)" "Bash(wc *)" "Bash(jq *)"
      "Bash(diff *)" "Bash(sort *)" "Bash(sed -n *)" "Bash(node --check *)" "Bash(bash -n *)" "Bash(python3 -c *)" "Bash(mkdir *)" "Bash(date)"
      "Bash(curl -s http://127.0.0.1:*)"
      "Write(//opt/ihelp.am/.claude/worktrees/**)" "Edit(//opt/ihelp.am/.claude/worktrees/**)"
      "Write(//opt/ihelp.am/data/tmp/dev/**)" "Edit(//opt/ihelp.am/data/tmp/dev/**)")
    ;;
  *) echo '{"is_error":true,"result":"неизвестная роль"}'; exit 2 ;;
esac

# Временная папка роли для --text-file (длинные тексты в cc.mjs note/block/review/…)
mkdir -p "$root/data/tmp/$role"

exec claude -p --model "$model" --output-format json --permission-mode dontAsk --strict-mcp-config \
  --allowedTools "${allow[@]}" --disallowedTools "${deny[@]}" < "$prompt"
