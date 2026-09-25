"JWT_SECRET=" + (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
"ADMIN_PASSWORD=" + (node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
"Apply: Render Env vars (live) and VPS /opt/canvas/server/.env (NODE_ENV=production), then redeploy / pm2 restart."