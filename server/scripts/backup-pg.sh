#!/usr/bin/env bash
# Postgres backup script for the canvas database.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./backup-pg.sh
#
# Keeps daily backups for N days (default 14) and uploads them to R2 when
# R2_* credentials are present; otherwise stores them under ./backups.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/canvas-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
echo "Backing up to ${FILE} ..."
pg_dump --no-owner --no-acl "${DATABASE_URL}" > "${FILE}"
gzip -f "${FILE}"
echo "Compressed: ${FILE}.gz ($(du -h "${FILE}.gz" | cut -f1))"

if [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
  R2_BUCKET="${R2_BUCKET:-uploads}"
  DEST="s3://${R2_BUCKET}/backups/$(basename "${FILE}.gz")"
  echo "Uploading to R2: ${DEST}"
  aws s3 cp "${FILE}.gz" "${DEST}" \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    --region auto
fi

# Prune old backups.
find "${BACKUP_DIR}" -name "canvas-*.dump.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "Done."
