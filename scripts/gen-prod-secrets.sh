#!/usr/bin/env bash
# Generate fresh production secrets for yerlikoglon.uz.
# Values print to the terminal only — paste them into the deployment config
# (GCP VM `~/apps/api-server/server/.env`). NEVER commit these values.
set -euo pipefail
echo "JWT_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
echo "ADMIN_PASSWORD=$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"
echo
echo "Apply: GCP VM ~/apps/api-server/server/.env (NODE_ENV=production), then pm2 restart."