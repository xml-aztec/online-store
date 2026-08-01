#!/bin/sh
# Entrypoint for the compose "backup" service: no separate cron daemon needed
# for a single daily job -- run once immediately (gives a fresh backup right
# after deploy) then every 24h for as long as the container lives.
set -eu

while true; do
	/scripts/backup.sh || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: FAILED (exit $?)"
	sleep 86400
done
