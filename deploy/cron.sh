#!/bin/sh
# Фоновые задачи приложения (визиты подписок, авто-возобновление пауз, истёкшие пакеты) каждые 15 минут.
# Секрет передаётся файлом заголовков, а не аргументом curl — иначе он виден в списке процессов хоста (ps).
set -u
umask 077
printf 'x-cron-secret: %s\n' "$CRON_SECRET" > /tmp/cron-headers
while true; do
  # Приложение ещё не поднялось (деплой, перезагрузка) — повтор через минуту, а не через 15
  if curl -fsS -H @/tmp/cron-headers http://app:3000/api/cron; then
    echo
    sleep 900
  else
    echo
    sleep 60
  fi
done
