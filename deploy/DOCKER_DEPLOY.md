# Backend'ni VPS'ga Docker orqali deploy qilish (Nginx + SSL + Certbot)

> Bu yangi, to'liq Docker'lashtirilgan yo'l. Frontend **Cloudflare Pages'da qoladi**;
> bu stack faqat API (`api.yerlikoglon.uz`) ni xizmat qiladi.
> Eski PM2 yo'li (agar kerak bo'lsa): [`DEPLOY.md`](DEPLOY.md).

Server: Ubuntu 22.04/24.04 yoki Debian 12, VPS IP `95.46.96.12`.

## Nima deploy qilinadi

| Konteyner | Rol |
|---|---|
| `canvas-postgres` | PostgreSQL 16 (barcha ma'lumotlar, docker volume) |
| `canvas-redis` | Redis 7 (socket.io adapter, ixtiyoriy — bo'lmasa in-memory) |
| `canvas-app` | Express + Socket.io backend (`:4000` ichki tarmoqda) |
| `canvas-nginx` | Reverse proxy + HTTPS (80/443) |
| `canvas-certbot` | Let's Encrypt sertifikat (webroot + avto-yangilanish) |
| `migrate` (one-off) | `prisma migrate deploy` — profile bilan chaqiriladi |

Fayllar:
- `server/Dockerfile` — multi-stage (node:22-alpine)
- `docker-compose.prod.yml` — butun stack
- `deploy/docker/nginx/` — nginx konfiguratsiyalari (HTTP bootstrap + HTTPS)
- `deploy/setup-docker-vps.sh` — avtomatik o'rnatish skripti

## 1. DNS (Cloudflare)

`api.yerlikoglon.uz` → `95.46.96.12` (A-record, **Proxied: ON**).

Cloudflare → `yerlikoglon.uz` → **SSL/TLS → Overview**: mode ni **Full**
(yoki **Full (strict)**) qiling.

## 2. Skriptni ishga tushirish

```bash
# VPS'da (root):
sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/bocked/default-project/main/deploy/setup-docker-vps.sh -o /tmp/setup-docker-vps.sh && bash /tmp/setup-docker-vps.sh'
```

yoki reponi avval ko'chirib:

```bash
sudo apt install -y git
git clone https://github.com/bocked/default-project.git /opt/canvas
cd /opt/canvas
sudo ADMIN_PASSWORD="sizning-kuchli-parol" CERTBOT_EMAIL="you@example.com" bash deploy/setup-docker-vps.sh
```

Skript (avtomatik):
1. Docker Engine + Compose plugin o'rnatadi
2. Reponi `/opt/canvas` ga ko'chiradi (mavjud bo'lsa `git pull`)
3. `server/.env` ni yaratadi (mavjud bo'lsa — saqlanadi)
4. Tasvirlarni build qiladi
5. Postgres + Redis ishga tushiradi, sog'lom bo'lishini kutadi
6. `prisma migrate deploy` ni bajaradi
7. App'ni ishga tushiradi, `/health` bo'yicha kutadi
8. Nginx + Let's Encrypt SSL (webroot), HTTPS redirect
9. UFW firewall: SSH + 80/443

## 3. Tekshirish

```bash
curl -s https://api.yerlikoglon.uz/health        # {"ok":true}
curl -s https://api.yerlikoglon.uz/api/online    # {"online":N}
docker compose -f /opt/canvas/docker-compose.prod.yml ps
```

Frontend ochib: iqtiboslar, layk, `/about` sahifasini tekshiring.

## 4. Frontend'ni yangi API'ga o'tkazish (API ishlagandan keyin)

VPS'dagi API tasdiqlangach:
1. `client/src/lib/config.ts` da `DEFAULT_SERVER` ni
   `https://api.yerlikoglon.uz` ga o'zgartiring.
2. `.github/workflows/deploy.yml` va `ci.yml` dagi
   `NEXT_PUBLIC_SERVER_URL` ni ham shu manzilga o'zgartiring.
3. `main`'ga push qiling — Cloudflare Pages avtomatik rebuild qiladi.

> O'tish paytida xizmat uzilishini xohlamasangiz, avval VPS API to'liq
> ishlaguncha Render'da qoldirib, so'ng birdaniga almashtiring.

## 5. Yangilash

```bash
cd /opt/canvas && sudo git pull
sudo docker compose -f docker-compose.prod.yml build app migrate
sudo docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
sudo docker compose -f docker-compose.prod.yml up -d
```

## 6. Zaxira (backup)

```bash
# Ma'lumotlar bazasi
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U canvas canvas | gzip > canvas-$(date +%F).sql.gz

# Tiklash
gunzip -c canvas-YYYY-MM-DD.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U canvas -d canvas
```

## 7. SSL — qo'lda

```bash
# Yangi sertifikat
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot -d api.yerlikoglon.uz --email you@example.com --agree-tos -n

# Yangilanish (avtomatik har 12 soatda; qo'lda)
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot renew
```

## 8. Telegram bot webhook'ini ulash

`server/.env` ga to'ldiring: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`,
`TELEGRAM_WEBHOOK_SECRET` (uzoq tasodifiy matn). Keyin:

```bash
cd /opt/canvas/server
sudo docker compose -f ../docker-compose.prod.yml run --rm --entrypoint sh app -c "cd /app && npx prisma generate"
```

yoki webhook'ni boshqa joydan ro'yxatdan o'tkazing (API endi
`https://api.yerlikoglon.uz/api/telegram/webhook`):

```bash
# webhook URL bot token bilan:
curl -s -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.yerlikoglon.uz/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

## 9. Muammolar

- **`prisma migrate deploy` xato**: `docker logs canvas-postgres` ni qarang;
  Postgres sog'lom bo'lishini kutgan holda skriptni qayta ishga tushiring.
- **WebSocket ishlamayapti**: `docker-compose.prod.yml` dagi nginx
  konfiguratsiyasida `Upgrade` header'lari borligini tekshiring
  (`deploy/docker/nginx/conf-templates/site.conf`).
- **CF 521/522**: Cloudflare SSL mode ni `Full` qiling.
- **`server/.env` mavjud bo'lsa DATABASE_URL eski**: `docker-compose.prod.yml`
  dagi `environment` override qiladi — qayta yozish shart emas.
- **R2 yoqilmagan**: rasmlar `uploads` volume'da saqlanadi.
