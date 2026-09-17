#!/bin/sh
# Фоновые задачи приложения (визиты подписок, авто-возобновление пауз, истёкшие пакеты) каждые 15 минут.
# Секрет передаётся файлом заголовков, а не аргументом curl — иначе он виден в списке процессов хоста (ps).
set -u
umask 077
printf 'x-cron-secret: %s\n' "$CRON_SECRET" > /tmp/cron-headers
while true; do
  curl -fsS -H @/tmp/cron-headers http://app:3000/api/cron
  echo
  sleep 900
done
