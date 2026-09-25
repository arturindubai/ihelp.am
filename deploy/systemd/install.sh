#!/usr/bin/env bash
# Установка таймера диспетчера воркеров iHelp (решение владельца 24.09.2026: таймер systemd на сервере).
# Кладёт два файла в /etc/systemd/system (соседние проекты не затрагиваются) и включает таймер.
# Сами воркеры запускаются, только когда их включили в Control Center → Воркеры.
#   deploy/systemd/install.sh          — установить или обновить
#   deploy/systemd/install.sh remove   — выключить и убрать
set -euo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" = remove ]; then
  systemctl disable --now ihelp-dispatcher.timer 2> /dev/null || true
  systemctl stop 'ihelp-w-*' 2> /dev/null || true
  rm -f /etc/systemd/system/ihelp-dispatcher.service /etc/systemd/system/ihelp-dispatcher.timer
  systemctl daemon-reload
  echo "✓ Таймер диспетчера убран, работавшие воркеры остановлены"
  exit 0
fi
install -m 644 ihelp-dispatcher.service ihelp-dispatcher.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ihelp-dispatcher.timer
systemctl list-timers ihelp-dispatcher.timer --no-pager | head -n 3
echo "✓ Таймер включён. Журнал диспетчера: journalctl -u ihelp-dispatcher -n 50"
