#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
#  Canvas backend — VPS provisioning (Ubuntu 22.04/24.04, Debian 12)
#
#  Installs: Node.js 22, PM2, PostgreSQL, Redis, Nginx, Certbot
#  Deploys : repo -> /opt/canvas, builds server, starts via PM2 on :4000
#
#  Run as root:
#      sudo bash setup-vps.sh
#
#  Optional env overrides:
#      REPO_URL=https://github.com/bocked/default-project.git
#      DOMAIN=api.yerlikoglon.uz
#      ADMIN_PASSWORD=<your-secret>     (random 24-char hex if omitted)
#      SKIP_CERTBOT=1                   (skip Let's Encrypt for first test)
# ============================================================================

REPO_URL="${REPO_URL:-https://github.com/bocked/default-project.git}"
APP_DIR="${APP_DIR:-/opt/canvas}"
DOMAIN="${DOMAIN:-api.yerlikoglon.uz}"
APP_PORT=4000
PG_USER=canvas
PG_PASSWORD="${PG_PASSWORD:-canvas}"
PG_DB=canvas
NODE_MAJOR=22
FRONTEND_ORIGINS="https://yerlikoglon.uz,https://www.yerlikoglon.uz,https://default-project-bza.pages.dev,https://*.pages.dev"

log() { echo -e "\e[1;32m[+] $*\e[0m"; }
err() { echo -e "\e[1;31m[!] $*\e[0m" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Run as root: sudo bash $0"

# ---------------------------------------------------------------- system ----
log "Updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

log "Installing base packages"
apt-get install -y --no-install-recommends \
  nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib \
  redis-server \
  git curl ca-certificates build-essential ufw openssl

# ------------------------------------------------------------------ node ----
if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js ${NODE_MAJOR} (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

log "Installing PM2"
npm install -g pm2

# ------------------------------------------------------------- postgres ----
log "Configuring PostgreSQL (user=${PG_USER}, db=${PG_DB})"
systemctl enable --now postgresql
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE ${PG_USER} WITH LOGIN PASSWORD '${PG_PASSWORD}' CREATEDB;"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

log "Enabling Redis (server falls back to in-memory if this is absent)"
systemctl enable --now redis-server || log "redis-server not available, skipping"

# ---------------------------------------------------------------- clone ----
log "Cloning repository into ${APP_DIR}"
rm -rf "${APP_DIR}"
git clone "${REPO_URL}" "${APP_DIR}"

cd "${APP_DIR}/server"

log "Installing server dependencies"
npm ci --omit=optional || npm install --omit=optional

log "Generating Prisma client"
npx prisma generate

# ----------------------------------------------------------------- .env ----
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 12)}"
cat > .env <<EOF
PORT=${APP_PORT}
NODE_ENV=production
DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:5432/${PG_DB}?schema=public"
REDIS_URL="redis://localhost:6379"
CORS_ORIGINS="${FRONTEND_ORIGINS}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
PUBLIC_BASE_URL="https://${DOMAIN}"
LOG_TO_CONSOLE=true
EOF
chmod 600 .env

log "Applying database migrations"
npx prisma migrate deploy

log "Building server (tsc -> dist/)"
npm run build

# ------------------------------------------------------------------ pm2 ----
log "Starting backend with PM2"
pm2 start "${APP_DIR}/deploy/ecosystem.config.cjs" --update-env
pm2 save
pm2 startup systemd -u root --hp /root || true

# ----------------------------------------------------------------- nginx ----
log "Configuring Nginx (${DOMAIN} -> 127.0.0.1:${APP_PORT})"
cp "${APP_DIR}/deploy/nginx.conf" /etc/nginx/sites-available/canvas
ln -sf /etc/nginx/sites-available/canvas /etc/nginx/sites-enabled/canvas
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "Firewall (SSH + HTTP/HTTPS)"
ufw allow OpenSSH || true
ufw allow 80,443/tcp || true
ufw --force enable || true

# --------------------------------------------------------------- ssl -------
if [ "${SKIP_CERTBOT:-0}" != "1" ]; then
  log "Requesting Let's Encrypt certificate for ${DOMAIN}"
  # --register-unsafely-without-email: supply your email if you prefer
  certbot --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos --redirect \
    --register-unsafely-without-email || \
    log "certbot failed — run manually:  certbot --nginx -d ${DOMAIN}"
else
  log "Skipping certbot (SKIP_CERTBOT=1)"
fi

# ----------------------------------------------------------------- done ----
log "All done!"
log "  Admin password : ${ADMIN_PASSWORD}   (save this!)"
log "  API endpoint   : https://${DOMAIN}"
log "  Health check   : curl https://${DOMAIN}/health"
log "  PM2 status     : pm2 status"
log "  Logs           : pm2 logs canvas-server"
echo ""
log "TIP: In Cloudflare, set the ${DOMAIN} record to Proxied and the"
log "     SSL/TLS mode to 'Full' (or 'Full (strict)') so CF talks to the"
log "     Let's Encrypt certificate you just installed."
