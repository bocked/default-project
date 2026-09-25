#!/usr/bin/env bash
# yerlikoglon.uz — GCP VM (35.224.32.160) maintenance: SSH key + SSL + deploy + health.
#
# Steps (all run on the VPS):
#   1. Root SSH public-key login   (fixes our key-based access)
#   2. SSL 526 fix via certbot/Let's Encrypt + nginx reload
#   3. server/.env guard (jwt_secret/admin_password, NODE_ENV) + git pull + build + pm2 restart
#   4. Health checks (localhost:4000 and https://api.yerlikoglon.uz/health)
#
# Usage (as root):
#     cd /opt/canvas && sudo git pull && sudo bash deploy/vps-maintenance.sh
# Optional secret overrides (values are NOT printed, only written into server/.env):
#     ADMIN_PASSWORD='...' JWT_SECRET='...' sudo -E bash deploy/vps-maintenance.sh
set -uo pipefail

DOMAIN="api.yerlikoglon.uz"
REPO="/opt/canvas"
ROOT_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIncs6bIomKnjcWcOz2EENqcSHEdYKd/YBWjUwGOVB5R opencode-canvas-vps"

log()  { echo; echo "### $*"; }
pass() { echo "    [OK] $*"; }
fail() { echo "    [!!] $*"; }

[ "$(id -u)" = 0 ] || { echo "This script must run as root: sudo bash deploy/vps-maintenance.sh"; exit 1; }

# ---------------------------------------------------------------------------
log "PHASE 1: Root SSH public-key login"
# ---------------------------------------------------------------------------
install -d -m 700 -o root -g root /root/.ssh
if grep -qF "$ROOT_KEY" /root/.ssh/authorized_keys 2>/dev/null; then
  pass "key already present"
else
  printf '%s\n' "$ROOT_KEY" >> /root/.ssh/authorized_keys
  pass "key appended to /root/.ssh/authorized_keys"
fi
chown root:root /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
command -v restorecon >/dev/null 2>&1 && restorecon -R /root/.ssh || true

PLR=$(sshd -T 2>/dev/null | awk '$1=="permitrootlogin"{print $2}')
PA=$(sshd -T 2>/dev/null | awk '$1=="pubkeyauthentication"{print $2}')
AKF=$(sshd -T 2>/dev/null | awk '$1=="authorizedkeysfile"{print $2}')
echo "    effective: permitrootlogin=$PLR  pubkeyauthentication=$PA  authorizedkeysfile=$AKF"
if [ "$PLR" = "no" ]; then
  printf 'PermitRootLogin prohibit-password\nPubkeyAuthentication yes\nAuthorizedKeysFile .ssh/authorized_keys\n' > /etc/ssh/sshd_config.d/99-opencode-rootkey.conf
  chmod 644 /etc/ssh/sshd_config.d/99-opencode-rootkey.conf
  pass "root key login enabled via /etc/ssh/sshd_config.d/99-opencode-rootkey.conf"
fi
if sshd -t 2>/dev/null; then pass "sshd_config valid"; else fail "sshd_config INVALID — fix before restart"; fi
systemctl restart ssh 2>/dev/null || systemctl restart sshd
echo "    host key: $(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null)"

# ---------------------------------------------------------------------------
log "PHASE 2: SSL 526 fix (Let's Encrypt / certbot)"
# ---------------------------------------------------------------------------
if ! command -v certbot >/dev/null 2>&1; then
  pass "installing certbot"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx
fi
echo "    current nginx site config:"
grep -nE 'server_name|listen|ssl_certificate|proxy_pass' /etc/nginx/sites-available/canvas 2>/dev/null | head -20 || ls /etc/nginx/sites-enabled/
if ! certbot --nginx -d "$DOMAIN" --register-unsafely-without-email --agree-tos --redirect -n; then
  fail "certbot --nginx failed. Fallback: create a Cloudflare Origin CA certificate in "
  fail "  dash.cloudflare.com -> SSL/TLS -> Origin Server (15y) and save it as:"
  fail "  /etc/ssl/certs/yerlikoglon.origin.crt  +  /etc/ssl/private/yerlikoglon.origin.key"
  fail "  then add to the nginx 443 server block and run:  nginx -t && systemctl reload nginx"
else
  pass "certificate issued"
fi
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  nginx -t && systemctl reload nginx
  pass "nginx reloaded with Let's Encrypt certificate"
else
  fail "Let's Encrypt cert not found at /etc/letsencrypt/live/$DOMAIN — inspect errors above"
fi

# ---------------------------------------------------------------------------
log "PHASE 3: server/.env guard + deploy"
# ---------------------------------------------------------------------------
ENV_FILE="$REPO/server/.env"
[ -f "$ENV_FILE" ] || { fail ".env missing at $ENV_FILE"; exit 1; }
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  sed -i -E "s#^ADMIN_PASSWORD=.*#ADMIN_PASSWORD=\"${ADMIN_PASSWORD}\"#" "$ENV_FILE"
  pass "ADMIN_PASSWORD updated (length ${#ADMIN_PASSWORD})"
fi
if [ -n "${JWT_SECRET:-}" ]; then
  sed -i -E "s#^JWT_SECRET=.*#JWT_SECRET=\"${JWT_SECRET}\"#" "$ENV_FILE"
  pass "JWT_SECRET updated (length ${#JWT_SECRET})"
fi
if grep -qE 'ADMIN_PASSWORD=["'"'"']?change-me|JWT_SECRET=["'"'"']?dev-secret-change-me' "$ENV_FILE"; then
  fail "Insecure default ADMIN_PASSWORD/JWT_SECRET still in $ENV_FILE — refusing to continue"
  echo "    Fix: ADMIN_PASSWORD='...' JWT_SECRET='...' sudo -E bash deploy/vps-maintenance.sh"
  exit 1
fi
sed -i -E 's#^NODE_ENV=.*#NODE_ENV=production#' "$ENV_FILE"
grep -qE '^NODE_ENV=production' "$ENV_FILE" && pass "NODE_ENV=production set" || fail "NODE_ENV not production"

cd "$REPO" || exit 1
git pull --ff-only 2>/dev/null || git pull
cd "$REPO/server" || exit 1
npm ci
npx prisma migrate deploy
npm run build
cd "$REPO" || exit 1
pm2 restart all 2>/dev/null && pm2 save || { pm2 start deploy/ecosystem.config.cjs --update-env && pm2 save; }
sleep 3
pm2 status || true

# ---------------------------------------------------------------------------
log "PHASE 4: Health check"
# ---------------------------------------------------------------------------
echo "    local:  $(curl -s -w ' [%{http_code}]' http://localhost:4000/health || echo unreachable)"
echo "    public: $(curl -s -w ' [%{http_code}]' https://$DOMAIN/health || echo unreachable)"
echo "    public: $(curl -s -w ' [%{http_code}]' https://$DOMAIN/api/auth/me/delete -X POST || echo unreachable)"
if [ -x scripts/prod-health-check.sh ]; then bash scripts/prod-health-check.sh || true; fi

log "MAINTENANCE COMPLETE"