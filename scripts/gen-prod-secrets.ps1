"JWT_SECRET=" + (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
"ADMIN_PASSWORD=" + (node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
"Apply: GCP VM ~/apps/api-server/server/.env (NODE_ENV=production), then pm2 restart."