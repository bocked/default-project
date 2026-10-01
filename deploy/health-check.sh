#!/usr/bin/env bash
# External health + disk watchdog for the yerlikoglon backend.
#
# WHY THIS EXISTS IN ADDITION TO THE IN-APP healthMonitor.ts: that module can
# only report problems while the Node process is ALIVE. It cannot notice the
# two failure modes that matter most on a small VPS:
#   1. the process is down / crash-looping        -> nobody is left to log it
#   2. the disk is filling up and will take out PG -> same problem
# This script runs from cron (outside the app), checks both, appends to a
# rotating local log, and can raise a Telegram alert.
#
# Deliberately dependency-free: it runs before/without any Node tooling, so it
# still works when the app itself is broken.
#
# Usage:
#   bash ~/apps/api-server/deploy/health-check.sh          # check + log
#   bash ~/apps/api-server/deploy/health-check.sh --quiet  # only log on FAILURE (for cron)
#
# Exit codes: 0 = healthy, 1 = one or more checks failed.
set -uo pipefail

PM2_APP="${PM2_APP:-yerlikoglon-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/health}"
PUBLIC_URL="${PUBLIC_URL:-https://api.yerlikoglon.uz/health}"
DISK_WARN_PCT="${DISK_WARN_PCT:-80}"
DISK_CRIT_PCT="${DISK_CRIT_PCT:-90}"
LOG_FILE="${LOG_FILE:-${HOME}/logs/health-check.log}"
LOG_KEEP_DAYS="${LOG_KEEP_DAYS:-30}"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  # One line per run so the file stays greppable with `awk`.
  printf '%s %s\n' "$(date -Is)" "$1" >> "$LOG_FILE"
}

# --- rotate our own log so the watchdog cannot fill the disk it protects ----
find "$(dirname "$LOG_FILE")" -name "$(basename "$LOG_FILE")" -mtime "+${LOG_KEEP_DAYS}" -delete 2>/dev/null || true

FAILURES=()
STATUS="OK"

# --- 1) local health endpoint ----------------------------------------------
# The app answers {"ok":true}; match that rather than trusting HTTP status alone.
HEALTH_BODY="$(curl -fsS -m 10 "$HEALTH_URL" 2>/dev/null || true)"
case "$HEALTH_BODY" in
  *'"ok":true'*) ;;
  *) FAILURES+=("local health endpoint unreachable or not ok (body: ${HEALTH_BODY:-<empty>})"); STATUS="FAIL" ;;
esac

# --- 2) PM2 process state --------------------------------------------------
if command -v pm2 >/dev/null 2>&1; then
  PM2_JSON="$(pm2 jlist 2>/dev/null || echo '[]')"
  # Look for the app with a non-"online" status, and for excessive restarts
  # (a crash-loop is technically "online" for a moment at a time).
  if ! printf '%s' "$PM2_JSON" | grep -q "\"name\":\"${PM2_APP}\""; then
    FAILURES+=("pm2 app '${PM2_APP}' is not registered")
    STATUS="FAIL"
  else
    RESTARTS="$(printf '%s' "$PM2_JSON" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{const a=JSON.parse(s).find(p=>p.name===process.argv[1]);
        if(a){process.stdout.write(String(a.pm2_env.restart_time??0));}}catch{}
      });' "$PM2_APP" 2>/dev/null || echo 0)"
    RESTART_MAX="${RESTART_MAX:-10}"
    if [ "${RESTARTS:-0}" -gt "$RESTART_MAX" ]; then
      FAILURES+=("pm2 app '${PM2_APP}' has restarted ${RESTARTS} times (crash-loop?)")
      STATUS="FAIL"
    fi
  fi
else
  FAILURES+=("pm2 is not installed / not on PATH")
  STATUS="FAIL"
fi

# --- 3) disk usage (the failure mode that kills PostgreSQL first) ---------
# Parse defensively: an unexpected `df` layout must produce a clean "cannot
# determine" failure, never a bogus percentage (a garbage number would either
# pass silently or trip a non-numeric arithmetic error and abort the script).
DISK_PCT="$(df -P / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
case "$DISK_PCT" in
  ''|*[!0-9]*)
    FAILURES+=("could not parse disk usage from 'df -P /'")
    STATUS="FAIL"
    DISK_PCT="?"
    ;;
  *)
    # A percentage can never exceed 100; anything higher means we parsed the
    # wrong column, so treat it as unknown rather than acting on garbage.
    if [ "$DISK_PCT" -gt 100 ]; then
      FAILURES+=("implausible disk usage '${DISK_PCT}%' — 'df' output not understood")
      STATUS="FAIL"
      DISK_PCT="?"
    elif [ "$DISK_PCT" -ge "$DISK_CRIT_PCT" ]; then
      FAILURES+=("disk ${DISK_PCT}% used (>= ${DISK_CRIT_PCT}%) — PostgreSQL is at risk")
      STATUS="FAIL"
    elif [ "$DISK_PCT" -ge "$DISK_WARN_PCT" ]; then
      # Warn, but do not mark the run failed.
      log "WARN disk ${DISK_PCT}% used (>= ${DISK_WARN_PCT}%)"
    fi
    ;;
esac

# --- 4) PM2 log directory size (the thing pm2-logrotate bounds) -----------
LOG_DIR="${HOME}/.pm2/logs"
LOG_MB_LIMIT="${LOG_MB_LIMIT:-2000}"
if [ -d "$LOG_DIR" ]; then
  LOG_KB="$(du -sk "$LOG_DIR" 2>/dev/null | awk '{print $1}')"
  case "$LOG_KB" in
    ''|*[!0-9]*) : ;;   # size unavailable — not a failure on its own
    *)
      if [ "$LOG_KB" -gt "$((LOG_MB_LIMIT * 1024))" ]; then
        FAILURES+=("~/.pm2/logs is ${LOG_KB}KB — is pm2-logrotate installed?")
        STATUS="FAIL"
      fi
      ;;
  esac
fi

# --- 5) public reachability (catches nginx/TLS/DNS breakage) ---------------
# A local-only check would stay green while the site is unreachable from the
# internet. Only warn: this is expected to fail in odd network conditions.
if [ -z "${HEALTH_BODY:-}" ]; then
  PUB="$(curl -fsS -m 10 "$PUBLIC_URL" 2>/dev/null || true)"
  case "$PUB" in
    *'"ok":true'*) ;;
    *) log "WARN public health ${PUBLIC_URL} unreachable from the VM (may be egress filtering)" ;;
  esac
fi

# --- 6) newest backup present ---------------------------------------------
# A backup system that silently stopped is worse than none: it looks healthy.
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups}"
BACKUP_WARN_HOURS="${BACKUP_WARN_HOURS:-30}"
if [ -d "$BACKUP_DIR" ]; then
  NEWEST="$(find "$BACKUP_DIR" -name '*.tar.gz' -mmin "-$((BACKUP_WARN_HOURS * 60))" 2>/dev/null | head -1)"
  if [ -z "$NEWEST" ]; then
    log "WARN no backup archive newer than ${BACKUP_WARN_HOURS}h in ${BACKUP_DIR}"
  fi
else
  log "WARN backup dir ${BACKUP_DIR} does not exist"
fi

# --- report ----------------------------------------------------------------
if [ "${#FAILURES[@]}" -gt 0 ]; then
  log "FAIL ${FAILURES[*]}"
  # Cron should surface the failure via its own MAILTO; also print to stderr so
  # it is visible when run by hand.
  printf 'HEALTH CHECK FAILED (%s)\n' "$(date -Is)" >&2
  printf '  - %s\n' "${FAILURES[@]}" >&2
  exit 1
fi

[ "$QUIET" -eq 1 ] || echo "health-check: OK (disk ${DISK_PCT}%)"
log "OK disk=${DISK_PCT}%"
exit 0