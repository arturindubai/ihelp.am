#!/bin/sh
# Бэкап базы (pg_dump) и фото из админки (том uploads) в ./backups, хранение BACKUP_KEEP_DAYS дней.
#   sh /backup.sh       — режим контейнера: при старте — бэкап, если свежего (моложе 20 ч) нет; дальше каждую ночь в BACKUP_AT (UTC)
#   sh /backup.sh once  — один бэкап прямо сейчас:  docker compose exec -T backup sh /backup.sh once
# Файл пишется во временный и переименовывается только после проверки — неудачный дамп не затрёт хороший.
# Раз в 7 дней — проверка восстановления во временную базу. Отметки об успехах и ошибках пишутся в базу
# (Setting `_backup`), по ним приложение шлёт тех-алерты. Лог: docker compose logs backup
set -u
# В дампе персональные данные клиентов: файлы читает только root
umask 077
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_AT="${BACKUP_AT:-23:30}" # UTC, это 03:30 по Еревану
PSQL="psql -h db -U app -v ON_ERROR_STOP=1 -q"

log() { echo "[backup] $(date -u +%FT%TZ) $*"; }

# Отметка для приложения: mark lastOkAt [unix-время]. Сбой записи отметки не ломает бэкап
mark() {
  ts="now()"
  [ -n "${2:-}" ] && ts="to_timestamp($2)"
  $PSQL -d homeservices -c "INSERT INTO \"Setting\"(key, value) VALUES ('_backup', jsonb_build_object('$1', $ts)) ON CONFLICT (key) DO UPDATE SET value = \"Setting\".value || EXCLUDED.value" > /dev/null 2>&1 ||
    log "WARN: не удалось записать отметку $1"
}

backup_db() {
  out="/backups/db-$1.sql.gz"
  tmp="/backups/.db-$1.$$.tmp"
  if pg_dump -h db -U app homeservices | gzip > "$tmp" && gzip -dc "$tmp" | tail -n 10 | grep -q "dump complete"; then
    mv "$tmp" "$out" && log "db ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"
    log "ERROR: db dump failed" >&2
    return 1
  fi
}

backup_uploads() {
  out="/backups/uploads-$1.tar.gz"
  tmp="/backups/.uploads-$1.$$.tmp"
  if tar -czf "$tmp" -C /uploads .; then
    mv "$tmp" "$out" && log "uploads ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"
    log "ERROR: uploads archive failed" >&2
    return 1
  fi
}

# До $2 попыток раз в 5 минут (после перезагрузки база может подняться не сразу)
backup_db_retry() {
  n=0
  while ! backup_db "$1"; do
    n=$((n + 1))
    if [ "$n" -ge "$2" ]; then
      mark lastErrorAt
      return 1
    fi
    sleep 300
  done
  mark lastOkAt
}

# Разворачивает дамп во временную базу и сверяет число таблиц с рабочей
restore_check() {
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS restore_check" -c "CREATE DATABASE restore_check" > /dev/null &&
    gzip -dc "$1" | $PSQL -d restore_check > /dev/null &&
    prod=$($PSQL -d homeservices -tAc "select count(*) from information_schema.tables where table_schema = 'public'") &&
    restored=$($PSQL -d restore_check -tAc "select count(*) from information_schema.tables where table_schema = 'public'") &&
    migrations=$($PSQL -d restore_check -tAc 'select count(*) from _prisma_migrations') &&
    [ "$prod" = "$restored" ] && [ "$migrations" -gt 0 ]
  rc=$?
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS restore_check" > /dev/null 2>&1
  return $rc
}

cycle() {
  day="$(date +%F)"
  backup_db_retry "$day" 12 || return 1
  backup_uploads "$day" || mark lastErrorAt
  find /backups \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  if [ -z "$(find /backups -maxdepth 1 -name .restore-checked -mtime -7 2> /dev/null)" ]; then
    if restore_check "/backups/db-$day.sql.gz"; then
      touch /backups/.restore-checked
      mark restoreOkAt
      log "restore check ok"
    else
      mark restoreErrorAt
      log "ERROR: restore check failed" >&2
    fi
  fi
}

sleep_until() {
  now=$(date -u +%s)
  target=$(date -u -d "$(date -u +%Y-%m-%d) $1:00" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  log "next backup at $(date -u -d "@$target" +%FT%TZ)"
  sleep $((target - now))
}

if [ "${1:-}" = "once" ]; then
  day="$(date +%F)"
  backup_db_retry "$day" 1 && backup_uploads "$day"
  exit $?
fi

latest=$(ls -t /backups/db-*.sql.gz 2> /dev/null | head -n 1)
if [ -n "$latest" ] && [ $(($(date +%s) - $(stat -c %Y "$latest"))) -lt 72000 ]; then
  log "fresh backup exists: $latest"
  mark lastOkAt "$(stat -c %Y "$latest")"
else
  cycle
fi
while true; do
  sleep_until "$BACKUP_AT"
  cycle
done
