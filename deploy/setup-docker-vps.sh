#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
#  Iqtibosim backend — Docker production setup (Ubuntu 22.04/24.04, Debian 12)
#
#  Installs : Docker Engine + Compose plugin
#  Deploys  : repo -> ${APP_DIR}, builds backend image, starts the stack
#             (postgres + redis + app + nginx + certbot) via docker compose
#  Applies  : prisma migrate deploy (production schema)
#  Secures  : Let's Encrypt (certbot webroot) + HTTPS redirect
#
#  Run as root:
#      sudo bash deploy/setup-docker-vps.sh
#
#  Optional env overrides (all safe to leave default):
#      REPO_URL=...                  (git repo to clone)
#      DOMAIN=api.yerlikoglon.uz
#      ADMIN_PASSWORD=<secret>       (random 24-char hex if omitted)
#      JWT_SECRET=<secret>           (random 32-char hex if omitted)
#      PG_PASSWORD=<secret>          (random 24-char hex if omitted)
#      CERTBOT_EMAIL=you@example.com (used for Let's Encrypt)
#      SKIP_CERTBOT=1                (skip SSL, HTTP only)
#
#  An existing server/.env is PRESERVED — the script only creates it when
#  missing. DATABASE_URL/REDIS_URL always point at the docker services.
# ============================================================================

REPO_URL="${REPO_URL:-https://github.com/bocked/default-project.git}"
APP_DIR="${APP_DIR:-/opt/canvas}"
DOMAIN="${DOMAIN:-api.yerlikoglon.uz}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -hex 12)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
PG_USER="${PG_USER:-canvas}"
PG_PASSWORD="${PG_PASSWORD:-$(openssl rand -hex 12)}"
PG_DB="${PG_DB:-canvas}"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
FRONTEND_ORIGINS="https://yerlikoglon.uz,https://www.yerlikoglon.uz,https://default-project-bza.pages.dev,https://*.pages.dev,http://localhost:3000"

log() { echo -e "\e[1;32m[+] $*\e[0m"; }
err() { echo -e "\e[1;31m[!] $*\e[0m" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Run as root: sudo bash $0"
command -v openssl >/dev/null 2>&1 || { apt-get update -y; apt-get install -y openssl; }

# ---------------------------------------------------------------- docker ----
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || err "Docker Compose plugin missing — install it with: apt-get install docker-compose-plugin"

# ------------------------------------------------------------------ clone ---
if [ -d "${APP_DIR}/.git" ]; then
  log "Repository exists at ${APP_DIR} — pulling latest"
  git -C "${APP_DIR}" pull --ff-only
else
  log "Cloning repository into ${APP_DIR}"
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
fi

# ------------------------------------------------------------- cert dirs ----
mkdir -p "${APP_DIR}/deploy/docker/certbot/www"
mkdir -p "${APP_DIR}/deploy/docker/certbot/conf"

# ---------------------------------------------------------- server .env -----
ENV_FILE="${APP_DIR}/server/.env"
if [ -f "${ENV_FILE}" ]; then
  log "server/.env already exists — preserving it (edit it to change secrets)"
else
  log "Creating server/.env with generated secrets"
  cat > "${ENV_FILE}" <<EOF
PORT=4000
NODE_ENV=production
LOG_LEVEL=info
LOG_TO_CONSOLE=true
TRUST_PROXY=1
DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@postgres:5432/${PG_DB}?schema=public"
REDIS_URL="redis://redis:6379"
CORS_ORIGINS="${FRONTEND_ORIGINS}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
ADMIN_EMAILS="mirabbostolqinjonov@gmail.com"
JWT_SECRET="${JWT_SECRET}"
APP_URL="https://yerlikoglon.uz"
VERIFICATION_TOKEN_HOURS=24
SMTP_HOST=""
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Iqtibosim <noreply@yerlikoglon.uz>"
BREVO_API_KEY=""
TELEGRAM_BOT_TOKEN=""
TELEGRAM_ADMIN_CHAT_ID=""
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_WEBHOOK_URL="https://${DOMAIN}/api/telegram/webhook"
EOF
  chmod 600 "${ENV_FILE}"
fi

cd "${APP_DIR}"

# ------------------------------------------------------------------ build ---
log "Building backend image (this may take a few minutes)"
docker compose -f "${COMPOSE_FILE}" build app migrate

# ------------------------------------------------------------- databases ----
log "Starting PostgreSQL and Redis"
docker compose -f "${COMPOSE_FILE}" up -d postgres redis

log "Waiting for PostgreSQL to become healthy"
for i in $(seq 1 30); do
  if docker inspect -f '{{.State.Health.Status}}' canvas-postgres 2>/dev/null | grep -q healthy; then
    break
  fi
  [ "$i" -eq 30 ] && err "PostgreSQL did not become healthy in time — check: docker logs canvas-postgres"
  sleep 2
done

# ------------------------------------------------------------ migrations ----
log "Applying database migrations (prisma migrate deploy)"
docker compose -f "${COMPOSE_FILE}" --profile migrate run --rm migrate

# ------------------------------------------------------------------- app ----
log "Starting backend app"
docker compose -f "${COMPOSE_FILE}" up -d app

log "Waiting for backend to become healthy"
for i in $(seq 1 30); do
  if docker inspect -f '{{.State.Health.Status}}' canvas-app 2>/dev/null | grep -q healthy; then
    break
  fi
  [ "$i" -eq 30 ] && err "Backend did not become healthy in time — see: docker compose -f ${COMPOSE_FILE} logs app"
  sleep 2
done

# ----------------------------------------------------------------- nginx ----
log "Starting Nginx reverse proxy (HTTP bootstrap until certs exist)"
docker compose -f "${COMPOSE_FILE}" up -d nginx

# ------------------------------------------------------------------- ssl ----
if [ "${SKIP_CERTBOT:-0}" != "1" ]; then
  if [ -d "${APP_DIR}/deploy/docker/certbot/conf/live/${DOMAIN}" ]; then
    log "Certificate for ${DOMAIN} already exists — skipping issuance"
  else
    log "Requesting Let's Encrypt certificate for ${DOMAIN}"
    CERT_ARGS=(--webroot -w /var/www/certbot -d "${DOMAIN}" --agree-tos -n --no-eff-email)
    if [ -n "${CERTBOT_EMAIL}" ]; then
      CERT_ARGS+=(--email "${CERTBOT_EMAIL}")
    else
      CERT_ARGS+=(--register-unsafely-without-email)
    fi
    if docker compose -f "${COMPOSE_FILE}" run --rm --entrypoint certbot certbot certonly "${CERT_ARGS[@]}"; then
      log "Restarting nginx to enable HTTPS"
      docker compose -f "${COMPOSE_FILE}" restart nginx
    else
      log "certbot failed — run manually:"
      log "  docker compose -f ${COMPOSE_FILE} run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} --email ${CERTBOT_EMAIL}"
    fi
  fi
else
  log "Skipping certbot (SKIP_CERTBOT=1) — HTTPS not configured"
fi

# ------------------------------------------------------------- firewall -----
if command -v ufw >/dev/null 2>&1; then
  log "Configuring UFW firewall (SSH + HTTP/HTTPS)"
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

# ---------------------------------------------------------------- done ------
log "All done!"
log "  API endpoint   : https://${DOMAIN}   (admin password in ${ENV_FILE})"
log "  Health check   : curl -s https://${DOMAIN}/health"
log "  Online         : curl -s https://${DOMAIN}/api/online"
log "  Logs           : docker compose -f ${COMPOSE_FILE} logs -f app"
log "  Migrations     : docker compose -f ${COMPOSE_FILE} --profile migrate run --rm migrate"
log ""
log "TIP: In Cloudflare, point ${DOMAIN} (A record) at this VPS IP, keep it"
log "     Proxied, and set SSL/TLS mode to 'Full' (or 'Full (strict)')."
log "TIP: Fill TELEGRAM_* and SMTP_* values in ${ENV_FILE}, then restart the app:"
log "       docker compose -f ${COMPOSE_FILE} up -d app"
