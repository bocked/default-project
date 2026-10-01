#!/usr/bin/env bash
# Idempotently install + configure pm2-logrotate for the yerlikoglon backend.
#
# WHY: PM2 appends to ~/.pm2/logs/*.log forever and never truncates them. The
# `yerlikoglon-api` process logs every request (pino-http) plus every error, so
# an unattended VM fills its disk within weeks — and a full disk takes down
# PostgreSQL, not just the API. This module is the disk-safety net.
#
# Usage (on the VM, as the operator user who owns PM2):
#   bash ~/apps/api-server/deploy/install-pm2-logrotate.sh
#   bash ~/apps/api-server/deploy/install-pm2-logrotate.sh --show   # print config
#
# Safe to re-run: every step is either idempotent or reported.
set -uo pipefail

PM2_APP="${PM2_APP:-yerlikoglon-api}"

# --- pm2-logrotate settings ------------------------------------------------
# Each value below is a documented option of the module (see its README):
#   max_size       rotate once the file exceeds this size
#   retain         how many ROTATED generations to keep (current file excluded)
#   compress       gzip rotated files
#   dateFormat     timestamp format embedded in rotated file names
#   workerInterval seconds between size checks (min 1)
#   rotateInterval 6-field node-schedule cron: sec min hour dom month dow
#                   -> 0 30 0 * * * == every day at 00:30
MAX_SIZE="${MAX_SIZE:-50M}"
RETAIN="${RETAIN:-14}"
ROTATE_CRON="${ROTATE_CRON:-0 30 0 * * *}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not found on PATH. Install Node + pm2 first." >&2
  exit 1
fi

echo "==> Installing pm2-logrotate module"
if pm2 ls 2>/dev/null | grep -q "pm2-logrotate"; then
  echo "    already installed — skipping"
else
  # NOTE: this is `pm2 install`, NOT `npm install` — the module must be loaded
  # into the PM2 daemon to hook process log streams.
  pm2 install pm2-logrotate
fi

echo "==> Applying settings (max_size=${MAX_SIZE} retain=${RETAIN} rotate='${ROTATE_CRON}')"
pm2 set pm2-logrotate:max_size "$MAX_SIZE"
pm2 set pm2-logrotate:retain "$RETAIN"
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat "YYYY-MM-DD_HH-mm-ss"
pm2 set pm2-logrotate:workerInterval 60
# Quote the cron so the shell does not glob/split it into separate args.
pm2 set pm2-logrotate:rotateInterval "$ROTATE_CRON"

# Persist the module + settings across PM2 daemon restarts and reboots.
pm2 save

echo "==> Current pm2-logrotate configuration"
pm2 conf 2>/dev/null | grep -i "logrotate" || echo "    (pm2 conf did not report values — run 'pm2 ls' to confirm the module is online)"

echo "==> Current log sizes"
LOG_DIR="${HOME}/.pm2/logs"
if [ -d "$LOG_DIR" ]; then
  du -sh "${LOG_DIR}" 2>/dev/null || true
  ls -lh "$LOG_DIR" 2>/dev/null | awk 'NR==1 || /yerlikoglon-api/' || true
else
  echo "    ${LOG_DIR} does not exist yet"
fi

cat <<EOF

pm2-logrotate ready.

Verify:   pm2 ls                      # 'pm2-logrotate' online
          pm2 conf | grep logrotate   # applied settings
          du -sh ~/.pm2/logs          # should stay bounded

If the process is not named '${PM2_APP}', re-run with: PM2_APP=<name> bash $0
EOF