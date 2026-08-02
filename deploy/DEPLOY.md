# Backend'ni VPS'ga deploy qilish (PM2 + Nginx + SSL)

Server: Ubuntu/Debian VPS, IP `95.46.96.12`. Backend Express + Socket.io,
Nginx reverse-proxy + Let's Encrypt (certbot), PM2 process manager.

## 1. DNS

`api.yerlikoglon.uz` → `95.46.96.12` (A-record, **Proxied: ON**).

Cloudflare Dashboard: `yerlikoglon.uz` → **DNS → Add record**:
`Type=A, Name=api, IPv4=95.46.96.12, Proxy status=Proxied`.

Keyin Cloudflare → `yerlikoglon.uz` → **SSL/TLS → Overview**: mode ni
**Full** (yoki **Full (strict)**) qiling — shunda CF origin sertifikat bilan
gaplashadi.

> `deploy/` ichidagi `nginx.conf`, `ecosystem.config.cjs`, `setup-vps.sh`
> hammasi repoga commit qilingan; VPS'da ulardan foydalanamiz.

## 2. Kodni VPS'ga yetkazish

```bash
# VPS'da (root):
cd /opt
git clone https://github.com/bocked/default-project.git canvas
cd canvas
```

> Repo private bo'lsa: `git clone` o'rniga reponi ZIP ko'chiring
> (`scp -r server deploy /opt/canvas`) yoki deploy key ishlating.

## 3. Avtomatik skript (tavsiya)

```bash
cd /opt/canvas/deploy
sudo ADMIN_PASSWORD="sizning-kuchli-parol" bash setup-vps.sh
```

Skript bajaradi:
- nginx, certbot, postgresql, redis-server, nodejs 22, pm2 o'rnatadi
- `canvas` PG foydalanuvchisi + `canvas` bazasini yaratadi
- `npm ci`, `prisma migrate deploy`, `npm run build`
- `.env` ni yaratadi (`ADMIN_PASSWORD` siznikini ishlatadi)
- PM2 bilan `dist/index.js` ni `:4000` da ishga tushiradi (avtostart bilan)
- Nginx site-ni ulaydi, certbot bilan SSL oladi

Skript oxirida **admin parol** va tekshirish URL chiqadi.

## 4. Qo'lda bosqichma-bosqich (agar skript ishlamasa)

```bash
# 4.1 Paketlar
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib redis-server git curl build-essential ufw

# 4.2 Node.js 22 + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 4.3 PostgreSQL
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE ROLE canvas WITH LOGIN PASSWORD 'canvas' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE canvas OWNER canvas;"

# 4.4 Redis
sudo systemctl enable --now redis-server

# 4.5 Server build
cd /opt/canvas/server
npm ci
cp .env.example .env
nano .env        # NODE_ENV=production, ADMIN_PASSWORD, CORS_ORIGINS,
                 # PUBLIC_BASE_URL=https://api.yerlikoglon.uz
npx prisma migrate deploy
npm run build

# 4.6 PM2
cd /opt/canvas
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save
pm2 startup          # so'ralgan buyruqni root sifatida bajarish

# 4.7 Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/canvas
sudo ln -sf /etc/nginx/sites-available/canvas /etc/nginx/sites-enabled/canvas
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 4.8 SSL
sudo certbot --nginx -d api.yerlikoglon.uz --redirect --register-unsafely-without-email

# 4.9 Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
```

## 5. Tekshirish

```bash
curl -s https://api.yerlikoglon.uz/health          # -> {"ok":true}
curl -s https://api.yerlikoglon.uz/api/online      # -> {"online":N}
pm2 status                                          # online (fork)
```

Frontend (`https://yerlikoglon.uz`) ochib: matn/stiker qo'shish, drag,
reaksiya va kursorlarni tekshiring. Admin panel uchun `ADMIN_PASSWORD`.

> Eslatma: `CORS_ORIGINS` ga Pages manzillari kiritilgan. Agar boshqa origin
> kerak bo'lsa `.env` ni tahrirlab `pm2 restart canvas-server` qiling.

## 6. Yangilash

```bash
cd /opt/canvas && sudo git pull
cd server
sudo npm ci
sudo npx prisma migrate deploy     # yangi migratsiya bo'lsa
sudo npm run build
cd /opt/canvas && sudo pm2 reload canvas-server --update-env
```

## 7. Zaxira (backup)

```bash
pg_dump -U canvas -h localhost canvas | gzip > canvas-$(date +%F).sql.gz
```

## 8. Muammolar

- **WebSocket ulanish ishlamayapti**: `nginx.conf` dagi `Upgrade` header'lari
  borligini tekshiring; PM2 log: `pm2 logs canvas-server`.
- **CF dan 521/522/502**: origin nginx'ga `https://` bilan kiryaptimi —
  Cloudflare SSL mode ni `Full` qiling.
- **Uploadlar 413**: `client_max_body_size 20m;` kifoya qilmaydigan holatda
  oshiring va `reload nginx`.
- **R2 hali yoqilmagan**: rasmlar `server/uploads` da saqlanadi va shu server
  orqali `/uploads/...` da chiqadi. R2 yoqilgach `.env` ga `R2_*` qo'shing.
