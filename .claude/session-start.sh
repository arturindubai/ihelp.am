#!/usr/bin/env bash
# Печатается в начале каждой сессии Claude Code в этой папке: чтобы чат сразу понимал, где он, что можно и что на доске.
cd "$(dirname "$0")/.." || exit 0
q() { timeout 3 docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -F' ' -c \"$1\"" 2>/dev/null | tr -d '\r'; }
tasks=$(q "select count(*) from \\\"Task\\\" where status not in ('done','cancelled')")
board=$(q "select coalesce(sum((status='ready')::int),0), coalesce(sum((status='in_progress')::int),0), coalesce(sum((status='review')::int),0), coalesce(sum((status='in_progress' and (\\\"claimUntil\\\" is null or \\\"claimUntil\\\" < now()))::int),0) from \\\"Task\\\"")
read -r ready working review stale <<< "${board:-}"
cat <<TXT
ПРОЕКТ: iHelp — сервис бытовых услуг в Ереване (ihelp.am).
Папка: /opt/ihelp.am · Репозиторий: github.com/arturindubai/ihelp.am · Сайт: https://ihelp.am
Задачи: Админка → Control Center (https://ihelp.am/ru/admin/control)${tasks:+ · открытых задач: $tasks}${ready:+
Доска: готовы к работе $ready · в работе $working · на проверке $review}${stale:+$( [ "${stale:-0}" != 0 ] && printf ' · брошены: %s' "$stale")}

ГРАНИЦЫ: на этом сервере живут ЧУЖИЕ проекты (/var/www, nginx на портах 80 и 443, процессы pm2, VPN).
Они к iHelp отношения не имеют. Не читать, не менять и не перезапускать ничего за пределами /opt/ihelp.am.
iHelp работает на порту 8080 в своих docker-контейнерах (исторический префикс имён — homecare).

СИСТЕМА РАЗРАБОТКИ: docs/DEV_SYSTEM.md, роли и первые сообщения — docs/roles/.
Нет карточки в Control Center — нет работы. Задачу берут командой node scripts/cc.mjs (help — справка),
работают в своём worktree, основную копию /opt/ihelp.am не переключают, в прод выкладывает только деплоер.

Перед работой прочитай CLAUDE.md в корне проекта: там правила, рабочий цикл и команды. Отвечай по-русски.
TXT
