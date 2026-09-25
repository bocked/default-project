#!/usr/bin/env bash
# Generate fresh production secrets for yerlikoglon.uz.
# Values print to the terminal only — paste them into the deployment config
# (Render dashboard Env / /opt/canvas/server/.env). NEVER commit these values.
set -euo pipefail
echo "JWT_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
echo "ADMIN_PASSWORD=$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"
echo
echo "Apply: Render Env vars (live) and VPS /opt/canvas/server/.env (NODE_ENV=production), then redeploy / pm2 restart."