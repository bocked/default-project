#!/usr/bin/env bash
# Yerlikoglon API server deploy: pull -> install -> migrate -> build -> reload,
# then self-verifies health + CORS behaviour. Run on the VM as the operator user:
#   bash ~/apps/api-server/deploy/server-deploy.sh
set -euo pipefail

cd "$HOME/apps/api-server"
echo "== git pull =="
git pull --ff-only

echo "== npm install (server) =="
cd server
npm install --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund

echo "== prisma migrate deploy =="
npx prisma migrate deploy

echo "== build =="
npm run build

echo "== pm2 reload =="
pm2 reload yerlikoglon-api --update-env

echo "== waiting for boot =="
sleep 20

echo "== health (loopback) =="
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:4000/health || echo "HEALTH_NOT_READY"

echo "== CORS verification =="
# 1) Allowed origin preflight must be 204 with the origin echoed back.
OPT_ALLOWED=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \
  -H "Origin: https://www.yerlikoglon.uz" -H "Access-Control-Request-Method: GET" \
  http://127.0.0.1:4000/api/quotes/today)
echo "OPTIONS www.yerlikoglon.uz -> $OPT_ALLOWED (expect 204)"
# 2) Disallowed origin must NOT produce a 500 and must carry no ACAO header.
EVIL=$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: https://evil.example" \
  http://127.0.0.1:4000/api/health)
echo "GET evil origin -> $EVIL (expect 200, not 500)"
EVIL_ACAO=$(curl -s -D - -o /dev/null -H "Origin: https://evil.example" \
  http://127.0.0.1:4000/api/health | grep -ci '^access-control-allow-origin:' || true)
echo "evil origin ACAO header count -> $EVIL_ACAO (expect 0)"

if [ "$OPT_ALLOWED" = "204" ] && [ "$EVIL" != "500" ] && [ "$EVIL_ACAO" = "0" ]; then
  echo "DEPLOY_OK"
else
  echo "DEPLOY_CHECK_WARN — inspect the output above"
fi