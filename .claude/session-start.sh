#!/usr/bin/env bash
# Печатается в начале каждой сессии Claude Code в этой папке: чтобы чат сразу понимал, где он и что можно.
cd "$(dirname "$0")/.." || exit 0
tasks=$(timeout 3 docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select count(*) from \"Task\" where \"doneAt\" is null"' 2>/dev/null | tr -d '\r')
cat <<TXT
ПРОЕКТ: iHelp — сервис бытовых услуг в Ереване (ihelp.am).
Папка: /opt/ihelp.am · Репозиторий: github.com/arturindubai/ihelp.am · Сайт: http://37.60.236.202:8080
Задачи: Админка → Control Center (http://37.60.236.202:8080/ru/admin/control)${tasks:+ · открытых задач: $tasks}

ГРАНИЦЫ: на этом сервере живут ЧУЖИЕ проекты (/var/www, nginx на портах 80 и 443, процессы pm2, VPN).
Они к iHelp отношения не имеют. Не читать, не менять и не перезапускать ничего за пределами /opt/ihelp.am.
iHelp работает на порту 8080 в своих docker-контейнерах (исторический префикс имён — homecare).

Перед работой прочитай CLAUDE.md в корне проекта: там правила, рабочий цикл и команды. Отвечай по-русски.
TXT
