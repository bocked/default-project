# Backend'ni VPS'ga deploy qilish (PM2 + Nginx + SSL)

Server: GCP e2-micro VM (Always Free), IP `35.224.32.160`. Backend Express + Socket.io,
Nginx reverse-proxy + Let's Encrypt (certbot), PM2 process manager.

## 1. DNS

`api.yerlikoglon.uz` → `35.224.32.160` (A-record, **Proxied: ON**).

Cloudflare Dashboard: `yerlikoglon.uz` → **DNS → Add record**:
`Type=A, Name=api, IPv4=35.224.32.160, Proxy status=Proxied`.

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
- **CF dan 521/522/502**: origin nginx'ga `https://` bilan kiryaptimi �?"
  Cloudflare SSL mode ni `Full` qiling.
- **Uploadlar 413**: `client_max_body_size 20m;` kifoya qilmaydigan holatda
  oshiring va `reload nginx`.
- **R2 hali yoqilmagan**: rasmlar `server/uploads` da saqlanadi va shu server
  orqali `/uploads/...` da chiqadi. R2 yoqilgach `.env` ga `R2_*` qo'shing.

## 9. Monitoring va zaxira (amalga oshirilishi kerak)

> Yuqoridagi 1–8 bo'limlar eski yo'llarni (`/opt/canvas`, `canvas-server`)
> ko'rsatadi. Amaldagi joylashuv: `~/apps/api-server`, PM2 app
> `yerlikoglon-api`, port `4000`. Quyidagi bo'lim amaldagi tuzilma uchun.

### 9.1 PM2 log rotatsiyasi (majburiy — diskni to'ldiradi)

PM2 log fayllarini hech qachon qisqartirmaydi. `pino-http` har bir so'rovni
yozgani uchun `~/.pm2/logs` bir necha haftada diskni to'ldirib qo'yadi —
va to'gan disk avval PostgreSQL'ni o'ldiradi.

```bash
bash ~/apps/api-server/deploy/install-pm2-logrotate.sh
```

Natija: 50 MB'da aylanadi, 14 ta avvalgi nusxa saqlanadi, gzip bilan
siqiladi. Tekshirish: `pm2 conf | grep logrotate`.

### 9.2 Cron (zaxira + health-check)

```bash
crontab -l > /tmp/ct.bak 2>/dev/null || true      # avvalgisini saqlash
crontab ~/apps/api-server/deploy/crontab.example # o'rnatish
crontab -l                                        # tekshirish
```

O'rnatiladigan ishlar:

| Vaqt | Vazifa |
|------|--------|
| 03:17 | `pg_dump` + `.env` + nginx + pm2 → bitta arxiv, Telegram'ga yuklash, 14 kun eski nusxalarni o'chirish |
| har 10 daqiqa | health-check: `/health`, PM2 holati, disk, log hajmi (faqat nosozlikda yozadi) |
| har soat | qo'shimcha disk tekshiruvi (og'roq chegara: 85/93%) |
| 04:10 | arxivlarni son bo'yicha kesish (eng yangi 30 tadan ortig'ini o'chirish) |
| yakshanba 05:00 | restore drill: arxiv `gzip -t` va ichida `.sql` borligini tekshirish (bazaga tegilmaydi) |

Barcha loglar `~/logs/` da. `MAILTO` o'rnatilmasa, nosozlik xabari faqat
`~/logs/health-check.log` da qoladi.

### 9.3 Qo'shimcha sozlamalar

```bash
# Xatolar haqida Telegram orqali xabardorlik (ixtiyoriy)
# health-check.sh ichidagi notify blokini yoqing yoki
# ~/logs/health-check.log ni kuzatuvchi bot bilan o'qing.

# Disk bo'sh joyi (root):
df -h /
```

Health-check ogohlantirishi: `~/logs/health-check.log`. Unda `FAIL` yoki
`WARN` qatori bo'lsa, `deploy/health-check.sh` ni qo'lda ishga tushirib
aniqlang.

## 10. Avtomatik CI/CD deploy (GitHub Actions)

`.github/workflows/deploy-server.yml` — `main` branch'ga push qilinganda
backend'ni avtomatik yangilaydi. Frontend uchun alohida
`.github/workflows/deploy.yml` (Cloudflare Pages) ishlaydi; ikkalasi
bir-biriga tegmaydi.

### 10.1 GitHub Secrets (bir marta sozlash)

Repository → **Settings → Secrets and variables → Actions**:

| Secret | Mazmuni | Majburiy |
| --- | --- | --- |
| `VPS_SSH_KEY` | SSH private key (oddiy matn, `-----BEGIN OPENSSH PRIVATE KEY-----` dan boshlab) | ha |
| `VPS_HOST` | VM IP manzili, masalan `35.224.32.160` | ha |
| `VPS_USER` | SSH foydalanuvchi, masalan `mirabbostolqinjonov` | ha |
| `VPS_SSH_HOST_KEY` | VM host kaliti (`ssh-keyscan`), ixtiyoriy lekin tavsiya qilinadi | yo'q |

Private key yaratish (mavjud kalit bo'lsa, uni ishlatish **mumkin emas** —
deploy kalitini alohida yarating):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_actions_deploy -N ""
cat ~/.ssh/gh_actions_deploy           # bu chiqishni VPS_SSH_KEY ga qo'ying
```

Public qismni VPS'ga bir marta qo'shing:

```bash
echo "<shu kalitning .pub qatori>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

> **`VPS_SSH_HOST_KEY` nima uchun kerak?** Workflow `ssh-keyscan` bilan host
> kalitini oladi va `known_hosts` ga yozadi — bu TOFU (trust on first use),
> ya'ni birinchi ulanishda hech narsani tekshirmaydi. Agar shifrlangan
> kalit aylanib qolsa (`StrictHostKeyChecking` o'chgani uchun bu real xavf),
> oldindan `ssh-keyscan -p 22 <VPS_HOST>` bilan olgan kalitni `VPS_SSH_HOST_KEY`
> ga qo'ying: u holda kalit mos kelmasa workflow darhol to'xtaydi.

### 10.2 GitHub Environment

Workflow `production` environment'ini ishlatadi. **Settings → Environments →
New environment** bilan `production` nomini yarating va `VPS_*` secret'larni
shu environment'ga qo'ying (repo darajasiga qo'ysangiz ham ishlaydi).
Environment talablari (branch protection, approvers) qo'shsangiz, deploy
faqat tashqi tasdiqdan keyin bajariladi — production uchun tavsiya qilinadi.

### 10.3 Qanday ishlaydi

`main` push, `server/**` yoki `deploy/**` o'zgargan bo'lsa:

1. SSH kaliti bilan VM'ga ulanadi.
2. `git pull`, `npm install`, `prisma migrate deploy`, `npm run build`.
3. `pm2 reload yerlikoglon-api` (`--update-env` bilan).
4. Loopback va public health endpoint'larni tekshiradi.
5. VM dagi `HEAD` commit SHA'sini chiqarib, CI ishlatgan SHA'ning uning
   ajalligi (ancestry) ekanini tasdiqlaydi — ya'ni deploy haqiqatan ham
   shu kodni ishga tushirdimi.

Har bir qadam logda aniq ko'rinadi. Muhim: muvaffaqiyatsiz bo'lsa ish
tugatiladi (fail-fast) va keyingi qadamlar bajarilmaydi.

### 10.4 Qo'lda deploy (CI ishlamaganda)

```bash
./deploy/server-deploy.sh          # repo ichidan, SSH kaliti bilan
```

### 10.5 Tekshirish

```bash
# VM da
pm2 status yerlikoglon-api
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS https://api.yerlikoglon.uz/api/health
```
