# Cheksiz real-vaqtli kustav daftar

Hamkorlikdagi cheksiz kustav daftar: Next.js frontend + Express/Socket.io backend +
PostgreSQL (Prisma) + Redis + Cloudflare R2 (rasmlar uchun, ixtiyoriy).

## Tuzilma

```
client/   Next.js 16 (static export, Tailwind v4) — kanvas UI
server/   Express + Socket.io + Prisma + Redis — real-time API
docs/     API va arxitektura hujjatlari
docker-compose.yml   Postgres + Redis (lokal ishlab chiqish uchun)
```

## Arxitektura

```
┌─────────────┐   HTTPS (REST) + WebSocket (Socket.IO)   ┌──────────────────────┐
│   Client    │ ──────────────────────────────────────▶  │        Server        │
│  Next.js 16 │                                          │  Express + Socket.io │
│ (Cloudflare │                                          │  ┌────────────────┐  │
│   Pages)    │                                          │  │  TTLCache (in- │  │
└─────────────┘                                          │  │  memory)       │  │
                                                         │  │  Redis adapter │  │
                                                         │  └────────────────┘  │
                                                         │     Prisma           │
                                                         │        │             │
                                                         │  ┌─────▼──────┐      │
                                                         │  │ PostgreSQL │      │
                                                         │  └────────────┘      │
                                                         └──────────────────────┘
```

- **REST** — dastlabki holatni yuklash, auth, upload, admin (to'liq ro'yxat: `docs/API.md`).
- **Socket.IO** — real-vaqt: elementlar, kursorlar, presence, xonalar, admin buyruqlari. Redis adapter bir nechta server instansiyasini qo'llaydi (Redis bo'lmasa — faqat bitta instansiya uchun in-memory bus).
- **Cache** — in-memory TTL keshlash (`server/src/lib/cache.ts`): asosiy sahifalar va xona ro'yxatlari; kanvasdagi har qanday o'zgarish bus orqali cache'ni invalidatsiya qiladi.
- **Xavfsizlik** — Argon2id parollar, JWT, per-IP rate limit, IP ban, profanity filter, image MIME magic-bytes tekshiruvi, Helmet + CORS.

## Testlar

- **Unit/integration** (`server`): `npm test` — cache, rate limit, schemas, token, cooldown, IP, presence va h.k.
- **E2E** (`server`): `npm run test:e2e` — HTTP + Socket.IO hayot davri (register → login → element yaratish → xonalar → admin panel → ban). Talab: `TEST_DATABASE_URL` (mas. lokal Postgres/Docker). CI'da GitHub Actions `postgres:16` service bilan bajariladi.
- Client: `npm run lint` + `npm run build` (static export).

## Ishga tushirish

1. **Ma'lumotlar bazasi** (Postgres + Redis) — ikkita variant:

   **A. Docker (tavsiya etilgan):**

   ```bash
   docker compose up -d
   ```

   **B. Native Windows Postgres** (Docker/WSL ishlamasa):

   ```bash
   winget install -e --id PostgreSQL.PostgreSQL.16 --silent
   # keyin:
   psql -U postgres -h 127.0.0.1 -c "CREATE ROLE canvas WITH LOGIN PASSWORD 'canvas' CREATEDB;"
   psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE canvas OWNER canvas;"
   ```

   Redis o'rnatilmasa server avtomatik in-memory rejimga o'tadi (faqat bitta instansiya).

2. **Server**:

   ```bash
   cd server
   cp .env.example .env      # birinchi marta
   npm install
   npx prisma migrate dev
   npm run dev               # http://localhost:4000
   ```

3. **Client**:

   ```bash
   cd client
   npm install
   npm run dev               # http://localhost:3000
   ```

   Brauzerdagi `http://localhost:3000` da ikkita oynada ochib, real-vaqtda yozuv
   qo'shish / surish / reaksiya berish mumkin.

## Muhim env (server)

- `DATABASE_URL` — Postgres ulanishi (default: `canvas:canvas@localhost:5432/canvas`)
- `REDIS_URL` — Redis (bo'sh bo'lsa, in-memory rejimga o'tadi, faqat bitta instansiya)
- `ADMIN_PASSWORD` — admin panel paroli (`/api/admin/*` + socket `admin:auth`)
- `CORS_ORIGINS` — ruxsat etilgan originlar (mas. `http://localhost:3000,https://*.pages.dev`)
- `R2_*` — Cloudflare R2 (to'ldirilmasa rasmlar `server/uploads`'ga saqlanadi)

## Admin panel

Toolbardagi "Admin" tugmasi → parol. Imkoniyatlar: statistika, elementlar
(o'chirish), IP bloklash/o'chirish, moderatsiya jurnali, kanvasni tozalash.

## Deploy (Cloudflare Pages)

```bash
cd client
npx wrangler pages deploy out --project-name default-project
```

`NEXT_PUBLIC_SERVER_URL` build paytida server manziliga ko'rsatilishi kerak:

```bash
$env:NEXT_PUBLIC_SERVER_URL="https://api.yerlikoglon.uz"; npm run build
```

Main branch'ga push qilinsa GitHub Actions avtomatik: server'ni tekshiradi
(lint, typecheck, unit testlar, E2E, build) va client'ni Cloudflare Pages'ga
deploy qiladi; `server/` o'zgarishlari Render'da avtomatik deploy'lanadi.

## API hujjati

Barcha REST endpointlar va Socket.IO eventlar: [`docs/API.md`](docs/API.md).

## Backend'ni VPS'ga deploy (PM2 + Nginx + SSL)

`deploy/` papkasida tayyor konfiguratsiyalar: `nginx.conf`,
`ecosystem.config.cjs` (PM2), `setup-vps.sh` (avtomatik skript) va
`DEPLOY.md` (bosqichma-bosqich yo'riqnoma). VPS: `95.46.96.12`.
