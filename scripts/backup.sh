#!/bin/sh
# ТЗ 8: pg_dump daily, keep 14 days. Run directly for a one-off backup, or via
# backup-loop.sh (the compose "backup" service) for the recurring job.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
FILENAME="${BACKUP_DIR}/hobbylife-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: starting -> ${FILENAME}"
pg_dump "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
	| gzip > "$FILENAME"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: done ($(du -h "$FILENAME" | cut -f1))"

find "$BACKUP_DIR" -name 'hobbylife-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete
