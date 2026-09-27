#!/usr/bin/env bash
# One-shot daily backup wrapper, used by the nightly cron (0 3 * * *) and for
# manual runs. Its only job is to resolve DATABASE_URL from server/.env and
# invoke the backup engine (server/scripts/backup-pg.sh), which is guarded to
# create and upload exactly ONE archive per calendar day.
#
# This deliberately has NO loop: the daily cron is the sole recurring trigger.
# The old PM2 "backup" process that looped every 30 minutes has been removed.
#
# Usage:
#   ./backup.sh                  # run (skips if today's archive already exists)
#   FORCE=1 ./backup.sh          # rebuild + re-upload today's archive
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
SOURCE_ENV="$HOME/apps/api-server/server/.env"
SCRIPT="$HOME/apps/api-server/server/scripts/backup-pg.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "[backup] $(date -Is) ERROR: engine not found at $SCRIPT" >&2
  exit 1
fi

DSN=$(grep -E '^DATABASE_URL=' "$SOURCE_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | sed -E 's/\?.*$//')
if [ -z "$DSN" ]; then
  echo "[backup] $(date -Is) ERROR: DATABASE_URL not found in $SOURCE_ENV" >&2
  exit 1
fi

unset R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
echo "[backup] $(date -Is) starting"
DATABASE_URL="$DSN" BACKUP_DIR="$BACKUP_DIR" RETENTION_DAYS="${RETENTION_DAYS:-14}" \
  FORCE="${FORCE:-0}" bash "$SCRIPT"
RC=$?
if [ "$RC" -eq 0 ]; then
  echo "[backup] $(date -Is) done"
else
  echo "[backup] $(date -Is) FAILED (exit=$RC)" >&2
fi
exit "$RC"