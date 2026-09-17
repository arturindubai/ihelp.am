#!/bin/sh
# Ежедневный бэкап: база (pg_dump) и фото из админки (том uploads) в ./backups, хранение BACKUP_KEEP_DAYS дней.
# Пишем во временный файл и переименовываем только после проверки: неудачный дамп не затрёт хороший.
# Ошибки — в лог контейнера: docker compose logs backup
set -u
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

backup_db() {
  out="/backups/db-$1.sql.gz"
  tmp="/backups/.db-$1.tmp"
  if pg_dump -h db -U app homeservices | gzip > "$tmp" && gzip -dc "$tmp" | tail -n 3 | grep -q "dump complete"; then
    mv "$tmp" "$out" && echo "[backup] $(date -u +%FT%TZ) db ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"
    echo "[backup] $(date -u +%FT%TZ) ERROR: db dump failed" >&2
  fi
}

backup_uploads() {
  out="/backups/uploads-$1.tar.gz"
  tmp="/backups/.uploads-$1.tmp"
  if tar -czf "$tmp" -C /uploads .; then
    mv "$tmp" "$out" && echo "[backup] $(date -u +%FT%TZ) uploads ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"
    echo "[backup] $(date -u +%FT%TZ) ERROR: uploads archive failed" >&2
  fi
}

while true; do
  day="$(date +%F)"
  backup_db "$day"
  backup_uploads "$day"
  find /backups \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
