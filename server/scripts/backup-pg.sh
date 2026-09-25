#!/usr/bin/env bash
# Full disaster-recovery backup for the yerlikoglon platform.
#
# Creates a single `yerlikoglon_full_backup_YYYYMMDD.tar.gz` containing:
#   - PostgreSQL dump (database_YYYYMMDD.sql)
#   - server/.env (client/.env too when it exists)
#   - nginx configuration (/etc/nginx)
#   - PM2 ecosystem file + live pm2 process list snapshot
#
# Then uploads the archive to the Telegram channel via the *live* bot settings
# read from the database (the same values the Admin Panel manages), notifies
# the Super Admin chat and records the upload in the AdminLog so the audit page
# shows it. The "notifyBackup" toggle in the panel controls the notification;
# upload always tries when the channel is resolvable.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./backup-pg.sh
#   (fallback: DATABASE_URL is read from server/.env automatically)
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${SERVER_DIR}/.env"
CLIENT_ENV="${SERVER_DIR}/../client/.env"
BACKUP_DIR="${BACKUP_DIR:-${SERVER_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Resolve DATABASE_URL: explicit env wins, otherwise parse server/.env.
if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -1 | tr -d '\r\n"' | sed 's/^DATABASE_URL=//')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL topilmadi (server/.env dan ham o'qib bo'lmadi)" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d)"
ARCHIVE="${BACKUP_DIR}/yerlikoglon_full_backup_${STAMP}.tar.gz"
STAGE="$(mktemp -d)"
ROOT_NAME="yerlikoglon_full_backup_${STAMP}"
mkdir -p "${STAGE}/${ROOT_NAME}"
trap 'rm -rf "${STAGE}"' EXIT

echo "==> pg_dump ..."
pg_dump --no-owner --no-acl "${DATABASE_URL}" > "${STAGE}/${ROOT_NAME}/database_${STAMP}.sql"

echo "==> environment files ..."
[[ -f "${ENV_FILE}" ]] && cp "${ENV_FILE}" "${STAGE}/${ROOT_NAME}/env-server.env"
[[ -f "${CLIENT_ENV}" ]] && cp "${CLIENT_ENV}" "${STAGE}/${ROOT_NAME}/env-client.env"

echo "==> nginx configuration ..."
if [[ -d /etc/nginx ]]; then
  mkdir -p "${STAGE}/${ROOT_NAME}/nginx"
  tar -C /etc/nginx -cf "${STAGE}/${ROOT_NAME}/nginx/nginx-config.tar" .
fi

echo "==> PM2 ecosystem + process list ..."
if [[ -f "${SERVER_DIR}/../deploy/ecosystem.config.cjs" ]]; then
  cp "${SERVER_DIR}/../deploy/ecosystem.config.cjs" "${STAGE}/${ROOT_NAME}/ecosystem.config.cjs"
fi
pm2 jlist > "${STAGE}/${ROOT_NAME}/pm2-list.json" 2>/dev/null || true

echo "==> archive ..."
tar -C "${STAGE}" -czf "${ARCHIVE}" "${ROOT_NAME}"
SIZE="$(du -h "${ARCHIVE}" | cut -f1)"
echo "Arxiv: ${ARCHIVE} (${SIZE})"

# Prune old full backups (keep N days).
find "${BACKUP_DIR}" -name "yerlikoglon_full_backup_*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete

# ---------------------------------------------------------------------------
# Telegram delivery using the settings from the database (admin-managed).
# ---------------------------------------------------------------------------
read_ts() {
  psql "${DATABASE_URL}" -Atc "SELECT $1 FROM telegram_settings WHERE id='main'" 2>/dev/null || true
}

TOKEN="$(read_ts bot_token)"
CHAT_ID="$(read_ts super_admin_chat_id)"
CHANNEL_CAPTURED="$(read_ts channel_chat_id)"
CHANNEL_RAW="$(read_ts channel_value)"
NOTIFY_BACKUP="$(read_ts notify_backup)"

TELEGRAM_API="https://api.telegram.org"

UPLOADED=0
if [[ -n "${TOKEN}" && -n "${CHAT_ID}" ]]; then
  # Resolve the channel: prefer the captured numeric id, then @username/numeric
  # from channel_value. A bare invite link cannot be used as chat_id.
  TARGET_CHANNEL="${CHANNEL_CAPTURED}"
  if [[ -z "${TARGET_CHANNEL}" ]]; then
    case "${CHANNEL_RAW}" in
      -[0-9]*|+[0-9]*|[0-9]*|@[A-Za-z_]*)
        TARGET_CHANNEL="${CHANNEL_RAW}"
        ;;
    esac
  fi

  if [[ -n "${TARGET_CHANNEL}" ]]; then
    echo "==> kanalga yuklanmoqda (chat_id=${TARGET_CHANNEL}) ..."
    RESP="$(curl -s -m 120 -F chat_id="${TARGET_CHANNEL}" -F "document=@${ARCHIVE}" "${TELEGRAM_API}/bot${TOKEN}/sendDocument")"
    if [[ "${RESP}" == *'"ok":true'* ]]; then
      UPLOADED=1
      echo "==> kanalga yuklandi ✓"
    else
      echo "==> kanalga yuklash xato: $(echo "${RESP}" | head -c 300)" >&2
    fi
  else
    echo "==> kanal chat id topilmadi (faqat t.me taklif havolasi). Yuklash o'tkazib yuborildi." >&2
  fi

  if [[ "${NOTIFY_BACKUP}" == "t" || "${NOTIFY_BACKUP}" == "true" ]]; then
    STATUS_TEXT="joylandi"
    [[ "${UPLOADED}" == "0" ]] && STATUS_TEXT="joylanmadi"
    MSG="✅ Zaxira nusxa tayyor!

Fayl: ${ARCHIVE}
Hajmi: ${SIZE}
Kanalga: ${STATUS_TEXT}
Sana: $(date '+%Y-%m-%d %H:%M')"
    # Escape for a JSON string without depending on jq.
    JSON_TEXT="$(printf '%s' "${MSG}" | sed ':a;N;$!ba;s/\\/\\\\/g;s/"/\\"/g;s/\n/\\n/g')"
    curl -s -m 30 -X POST -H 'content-type: application/json' \
      -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"${JSON_TEXT}\"}" \
      "${TELEGRAM_API}/bot${TOKEN}/sendMessage" >/dev/null 2>&1 || true
  fi

  if [[ "${UPLOADED}" == "1" ]]; then
    DETAIL="$(printf '%s' "${ARCHIVE} (${SIZE}) — kanalga yuklandi" | sed "s/'/''/g")"
    psql "${DATABASE_URL}" -c "INSERT INTO \"AdminLog\" (id, \"adminEmail\", action, \"targetType\", detail, \"createdAt\") VALUES (gen_random_uuid(), 'backup-watchdog', 'backup.upload', 'backup', '${DETAIL}', now());" >/dev/null 2>&1 || true
  fi
else
  echo "==> Telegram sozlamalari to'liq emas; yuklash o'tkazib yuborildi." >&2
fi

echo "Done: ${ARCHIVE}"