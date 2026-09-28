#!/usr/bin/env bash
# Установка системных таймеров iHelp (решение владельца 24.09.2026: таймеры systemd на сервере).
# Кладёт файлы в /etc/systemd/system (соседние проекты не затрагиваются).
# Сами воркеры запускаются, только когда их включили в Control Center → Воркеры.
#   deploy/systemd/install.sh              — установить или обновить все таймеры
#   deploy/systemd/install.sh remove       — выключить и убрать все таймеры
#   deploy/systemd/install.sh dispatcher   — только таймер диспетчера воркеров
#   deploy/systemd/install.sh refresh      — только таймер ежемесячного обновления образов
set -euo pipefail
cd "$(dirname "$0")"

target="${1:-all}"

if [ "$target" = remove ]; then
  systemctl disable --now ihelp-dispatcher.timer 2>/dev/null || true
  systemctl disable --now ihelp-refresh.timer 2>/dev/null || true
  systemctl stop 'ihelp-w-*' 2>/dev/null || true
  rm -f /etc/systemd/system/ihelp-dispatcher.service \
        /etc/systemd/system/ihelp-dispatcher.timer \
        /etc/systemd/system/ihelp-refresh.service \
        /etc/systemd/system/ihelp-refresh.timer
  systemctl daemon-reload
  echo "✓ Таймеры убраны, работавшие воркеры остановлены"
  exit 0
fi

if [ "$target" = all ] || [ "$target" = dispatcher ]; then
  install -m 644 ihelp-dispatcher.service ihelp-dispatcher.timer /etc/systemd/system/
  echo "  dispatcher: установлен"
fi

if [ "$target" = all ] || [ "$target" = refresh ]; then
  install -m 644 ihelp-refresh.service ihelp-refresh.timer /etc/systemd/system/
  echo "  refresh: установлен"
fi

systemctl daemon-reload

if [ "$target" = all ] || [ "$target" = dispatcher ]; then
  systemctl enable --now ihelp-dispatcher.timer
fi
if [ "$target" = all ] || [ "$target" = refresh ]; then
  systemctl enable --now ihelp-refresh.timer
fi

systemctl list-timers 'ihelp-*.timer' --no-pager | head -n 5
echo "✓ Таймеры включены."
echo "  Диспетчер:         journalctl -u ihelp-dispatcher -n 50"
echo "  Обновление образов: journalctl -u ihelp-refresh -n 50"
