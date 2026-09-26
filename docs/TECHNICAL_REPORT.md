# Yerlikoglon — Production Texnik Hujjati

*(Sahifam/Yerlikoglon — iqtiboslar platformasi, monorepo `client/` + `server/`)*

---

## 1. Infratuzilma va Server Arxitekturasi

### 1.1 Hosting topologiyasi

| Qatlam | Xizmat | Tafsilot |
|---|---|---|
| **VPS (API)** | GCP e2-micro (Always Free), hostname `api-server` | Ubuntu, SSH user `mirabbostolqinjonov`, kalit `~/.ssh/id_ed25519_vps_canvas` |
| **API domeni** | `api.yerlikoglon.uz` | DNS A-record → `35.224.32.160`, Cloudflare **Proxied**, SSL Full |
| **Reverse-proxy** | Nginx + Let's Encrypt (Certbot) | `/etc/nginx/sites-enabled/api.yerlikoglon.uz`, 80→443 redirect; `proxy_pass http://127.0.0.1:4000`; `client_max_body_size 20m`; WebSocket `Upgrade` header'lari qo'yilgan |
| **App server** | Node.js 20 + Express + Socket.io | PM2 fork-mode, port `4000` |
| **Ma'lumotlar bazasi** | PostgreSQL (VM lokal, `canvas` DB) | Prisma ORM; `?schema=public` bilan ishlaydi |
| **Redis** | ixtiyoriy (`REDIS_URL` yo'q) | Production'da "in-memory mode" — cache/blocks xotirada |
| **Frontend** | Next.js 16.2 static export → **Cloudflare Pages** | Loyiha `default-project`, production domen `default-project-bza.pages.dev`, auto-deploy GitHub Actions orqali |

### 1.2 PM2 jarayonlari

| App | Nima qiladi |
|---|---|
| `yerlikoglon-api` | `server/dist/index.js`, fork ×1, autorestart, `max_memory_restart`, loglar `~/apps/api-server/logs/` |
| `backup` | `~/apps/backup.sh` — har 30 daqiqada `.dump.gz` yangiligi (<26 soat) tekshiradi; eskirgan bo'lsa `backup-pg.sh` ishga tushiradi |
| `keepalive` | `~/apps/keepalive.sh` — har 5 daqiqada `http://127.0.0.1:4000/health` ping |

### 1.3 Cron (VM)
```
*/2 * * * *  node scripts/telegram-watchdog.mjs   # health/PM2/disk watch
0   3 * * *  ./scripts/backup-pg.sh               # kunlik to'liq backup
```

### 1.4 Frontend deploy oqimi (GitHub Actions)
`.github/workflows/deploy.yml`:
- Trigger: `push` `client/**` yoki `workflow_dispatch`.
- Build: `npm ci` → `next build` (`NEXT_PUBLIC_SERVER_URL=https://api.yerlikoglon.uz`, `TEST_MODE=1`, Sentry DSN secret).
- Deploy: `cloudflare/wrangler-action@v4`, wrangler `4.120.1`, `pages deploy out --project-name=default-project --branch=main`, `apiToken` = GitHub secret `CLOUDFLARE_API_TOKEN`.

### 1.5 Muhit o'zgaruvchilari (`server/.env`, gitignore'da)
Kalitlar roʻyxati `server/.env.example`; `client/` da faqat `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_TEST_MODE`, `NEXT_PUBLIC_SENTRY_DSN`.
`server/src/config.ts` da **FATAL guard**: production'da kuchsiz/boʻsh `ADMIN_PASSWORD` / `JWT_SECRET` boʻlsa server ishga tushmaydi.
Asosiy guruhlar: baza (`DATABASE_URL`, `REDIS_URL`), admin (`ADMIN_PASSWORD`, `ADMIN_EMAILS`, `SUPER_ADMIN_EMAILS`, `ADMIN_IP_WHITELIST`), auth JWT (`JWT_SECRET`, `APP_URL`, token muddatlari), email (`SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM`), Telegram (`TELEGRAM_*`), upload (`UPLOAD_DIR`, `UPLOADS_PUBLIC_BASE`, `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_DIMENSION`), CORS (default: `yerlikoglon.uz + localhost:3000`, wildcard taqiqlangan).

---

## 2. Xavfsizlik Tizimi va Himoya Mexanizmlari

### 2.1 Autentifikatsiya & Avtorizatsiya
- **JWT access token** + **aylanuvchi refresh token** (HttpOnly cookie; bazada faqat SHA-256 digest saqlanadi, `refreshTokenHash`).
- Email tasdiqlash: havola-token + 6-xonali OTP; Telegram telefon tasdiqlash; `/start quick_<id>` tezkor kirish.
- Rol modeli (`UserRole`): `USER` / `ADMIN` / `SUPER_ADMIN`.
  - `SUPER_ADMIN` har qanday ruxsatni unconditionally egallaydi (`user.super-approve` huquqi faqat unga).
  - `roleOverride` (admin paneldan pin) config'ga asoslangan avtomatik promo'dan ustun turadi — olib tashlangan admin status qaytib olinmaydi.

### 2.2 Dinamik RBAC (AdminFeature / AdminGrant reestri)
- `AdminFeature` — har bir admin-modul bir qator (`key`, `label`, `group`, `defaultEnabled`, `source: builtin|runtime`).
- `AdminGrant` — har bir admin uchun aniq `enabled` satr (`@@id([adminId, featureKey])`); yo'q satr → feature defaulti.
- **Runtime-registratsiya qilingan yangi modullar `defaultEnabled=false`** — hech kim ko'rmaydi, faqat SUPER_ADMIN; u Telegram + admin-panel socket orqali ogohlantiriladi (`admin:feature:new`).
- Server tomonda har endpoint `can()` tekshiruvidan o'tadi; frontend `useAdminSession().can(...)` bilan ekran yashiradi.

### 2.3 API himoyasi (express-rate-limit v8, xotirada)

| Limiter | Chegara | Qo'llanilishi |
|---|---|---|
| `apiLimiter` | 100 req / 60s | barcha `/api/*` |
| `adminLimiter` | 20 / 60s | `/api/admin` |
| `authLimiter` | 60 / 15 min | `/api/auth` |
| `authPublicLimiter` | **10 / 15 min/IP** | register, login, verify-email, resend-verification, forgot-password (akkaunt-enumeratsiya/spam OTP'guve oldini oladi) |
| `authBruteLimiter` | **5 / 15 min/IP** | credentional endpointlar (ikkinchi qatlam) |
| `quoteCreateLimiter` | 30 / soat (admin istisno) | iqtibos yaratish |
| `likeLimiter` | 120 / soat | like/unlike |
| `searchLimiter` | 180 / 15 min | feed/qidiruv |
| `uploadsLimiter` | 30 / soat | POST `/api/uploads` |

- E2E'da `skip()` limitersni o'chiradi; faqat `FORCE_RATE_LIMITS=1` bilan 429 real tekshiriladi (production'da yo'q).
- Saqlanib qolgan mexanizmlar: **replay-detektor**, **GDPR self-delete**, **Admin DTO** (maxfiy maydonlarni o'rmaslaydi), CORS strict allow-list, `ADMIN_IP_WHITELIST`.

### 2.4 Telegram Webhook xavfsizligi — konstant-vaqtli taqqoslash
`server/src/routes/telegram.ts:40` `secureEqual()`: ikkala tomon sha256 hash qilinadi, so'ng `crypto.timingSafeEqual` bilan bir uzunlikdagi digesta solishtiriladi — timing-hujum va uzunlik-sizdirish oldini oladi. Har ikkala webhook'da (`/webhook`, `/webhook/approval`) `X-Telegram-Bot-Api-Secret-Token` tekshiriladi; noto'g'ri → **401**.

### 2.5 Fayl yuklash himoyasi (Multer + Sharp)
- **Multer** `memoryStorage`, `limits.fileSize = 5MB` (yirog'i `LIMIT_FILE_SIZE` → 413), `fileFilter image/*` (boshqa → 415), `requireAuth` + `uploadsLimiter`.
- **Sharp** `processImageUpload()` (`server/src/lib/upload.ts`):
  - Chiroyli rastr formatlar: `jpeg/png/webp/gif/avif/tiff/heif` (**svg yo'q** → 415), `failOn:"error"` korrupt fayl → 415/400.
  - **Decompression-bomb guard**: `w×h > maxDimension²×16` (≈25MP+ ish) dekodlashdan oldin → 413.
  - `.rotate()` EXIF avto-burilish; `resize(1280px, fit inside, withoutEnlargement)`; `.webp({quality:80, effort:4})`.
  - Nom `uuid.webp` — foydalanuvchi kiritgan fayl nomidan xoli (`paths/../../` hujum sodda emas).
- **CORP**: helmet `same-origin` ni qo'yadi; `app.ts` da `/uploads` subtree uchun `Cross-Origin-Resource-Policy: cross-origin` override qilinadi (Pages `<img>` cross-origin yuklashi uchun zarur). Statik: `immutable`, `maxAge 30d`.
- `UPLOADS_PUBLIC_BASE` default `https://api.yerlikoglon.uz` — qaytarilgan URL shu bazadan boshlanadi.

---

## 3. Telegram Botlar Arxitekturasi

### 3.1 @nimadur7_bot — Tasdiqlash boti (aynan shu ish uchun ajratilgan)
- Webhook: `POST /api/telegram/webhook/approval` (alohida sekret token).
- **Oqim:** yangi foydalanuvchi ro'yxatdan o'tgach bot Super Admin chatiga **inline tugmalar** bilan xabar yuboradi: `✅ Tasdiqlash` / `❌ Rad etish` (`APPROVE_USER_PREFIX` / `REJECT_USER_PREFIX` callback data).
  - ✅ → `applySuperApproveFromTelegram()`: `isSuperApproved=true` + `superApprovedAt`, audit (`user.super-approve`), foydalanuvchiga `USER_APPROVED` email, tugma xabari "Foydalanuvchi tasdiqlandi 🎉" ga o'zgaradi.
  - ❌ → audit (`user.super-reject`), xabar "Tasdiqlanmadi".
  - Xavfsizlik: tugma faqat admin chatda ishlaydi ("Ruxsat yo'q"); admin hisobiga/huquqi bor foydalanuvchiga takroriy tasdiqlash berilmaydi (idempotent).
- **Buyruqlar (admin chatdagi oddiy matn):** `verify <email>` / `tasdiqla <email>`, `verify off <email>` / `unverify <email>`. Boshqa buyruq yozilsa: *"Bu bot faqat tasdiqlash uchun — qolgani @yerlikoglonBot."*
- **@yerlikoglonBot** haqida adashsagina main botga yo'naltiradi — ikkala webhook alohida `executeUserApprovalCommand` / `executeAdminCommand` bilan ishlaydi.

### 3.2 @yerlikoglonBot — Tizim va Admin boti (asosiy)
- Webhook: `POST /api/telegram/webhook` (secret token, constant-time tekshiruv).
- **Iqtibos moderatsiyasi:** yangi iqtibos → admin chatga xabar + `[✅ Tasdiqlash][❌ Rad etish]`; rad etishda reply-orqali sabab so'raladi (`awaitingRejection`). Tasdiqlangan iqtibos kanalga avto-publitsiyalanadi (`publishQuoteToChannel`, `telegramPostedAt`).
- **Siyosatli draft tasdiqlash:** `policy:approve:*` / `policy:suggest:*` / `policy:reject:*` tugmalari + reply oqimi; nashr audit'ga yoziladi.
- **Admin matn-buyruqlari** (`executeAdminCommand`): `stats`, `pending`/`kutmoqda`, `users`, `iqtibos <id>`, `tasdiqla <id|email>`, `rad et <id> <sabab>`, `blokla/och <email>`, `vip <email> [kun|umrbod]`, `ban/unban <ip>`, `elon <matn>` (Telegram broadcast). Ish bajarilsa "✓ Topshiriq bajarildi: ..." javobi.
- **Kanal-id avto-capture:** `channel_post`, `my_chat_member`, forward'dan numeric id olinadi va `TelegramSettings.channelChatId`'ga saqlanadi.
- **Telefon tasdiqlash:** `/start verify_<token>` → kontakt so'rash → 6-xonali kod; **Quick login:** `/start quick_<sessionId>`.
- **Health/error ogohlantirishlari** — `telegram-watchdog.mjs` (cron, 2 daqiqa):
  - API dead (`/health` ≠ 200), PM2 проtsess topilmasa/o'chiq bo'lsa, **restart soni oshsa** (`restart_time`), **disk ≥ 80%** → Super Admin chatiga xabar + `AdminLog` (`health.alert`). Har bir xabar turi rate-limited (60/10 min).
  - `notifyHealth` toggle DB'dan (live `TelegramSettings`) o'qiladi.
- Webhook ro'yxatdan o'tkazish: `npm run telegram:webhook` → `scripts/set-telegram-webhook.ts` (`secret_token` + `allowed_updates`).

### 3.3 Production sozlamalari (DB'dagi `TelegramSettings.main`)
`superAdminChatId: 899933314` · channel `-1004486866647` (`t.me/+kiAzRgAAG8dhMWZi`) · `notifyBackup: on` · `notifyHealth: on` · bot tokenlar DB'da saqlanadi, panel orqali boshqariladi.

---

## 4. Zaxiralash va Tizimni Tiklash (Disaster Recovery)

### 4.1 `server/scripts/backup-pg.sh` (kunlik 03:00 + PM2 `backup` zaxira qatlami)
Bir arxiv: `~/backups/yerlikoglon_full_backup_YYYYMMDD.tar.gz`:
1. **PostgreSQL dump** — `pg_dump --no-owner --no-acl`, Prisma `?schema=` parametrlari tozalanadi;
2. **`.env` fayllar** — `env-server.env`, `env-client.env`;
3. **Nginx config** — `/etc/nginx` arxivlangan;
4. **PM2** — `deploy/ecosystem.config.cjs` + `pm2 jlist` snapshot (`pm2-list.json`);
5. Saqlash: **14 kun** retention (PM2-loop qatlamida 7 kun); eskilari `find -mtime` orqali o'chiriladi.

**Telegram-yetkazish (DB'dan live sozlamalar bilan):**
- Kanal chat_id `channelChatId` dan (prefer) yoki `channelValue` dagi `@`/raqamli id dan resha qilinadi (yalang'och `t.me/+` havola chat_id bo'la olmaydi → o'tkazib yuboriladi);
- arxiv `sendDocument` orqali kanalga joylanadi;
- `notifyBackup` yoqilgan bo'lsa **Super Admin 899933314** ga `✅ Zaxira nusxa tayyor! Fayl / Hajmi / Sana` xabari;
- muvaffaqiyat → `AdminLog` ga `backup.upload` (`backup-watchdog` actor) — audit sahifasida ko'rinadi.

**Tiklash:** dump'ni `psql` bilan qayta yuklash; `.env`, nginx/PM2 fayllari arxivdan qaytariladi; `yerlikoglon-api` `pm2 reload`.

---

## 5. Interfeys, Admin Panel va Qo'shimcha Funksiyalar

### 5.1 Admin Panel sahifalari (`/admin/*`, static export + client-side auth gate)
`users`, `quotes`, `content` (kategoriya/heshteg/content-bloklar), `bans`, `audit`, `communication` (e'lonlar), `email-management`, `policies`, `quizzes`, `settings` (general/SEO), **`telegram`**, **`sub-admins`**, `backup`, `live-logs`.

- **Telegram Sozlamalari kartasi** (`/admin/telegram`): token, Super Admin chat id, kanal (`channelValue` + captured id), `notifyBackup`/`notifyHealth` toggle'lar, webhook secret, `getMe`/status ko'rsatkichlari va "kanal id ni aniqlash" yo'l-yo'riqlari.
- **Sub-Adminlar boshqaruvi** (`/admin/sub-admins` + `users-tab` → `permission-modal.tsx`): har bir modul uchun **toggle ruxsatlar**; "Tasdiqlash va Admin qilish" tanlangan grantlarni `PATCH /api/admin/users/:id/make-admin` ga yuboradi. `roleOverride` orqali admin statusni qaytarib olish mumkin. Xavfsizlik: sub-admin o'zidan yuqori ruxsatni bermaydi (server tomonda tekshiriladi).
- **Audit Log UI** (`/admin/audit`, sidebar'da "Audit Loglar"): `AdminLog` (500 oxirgi, xotirada) — kengaytirilgan o'zbekcha `actionLabel` xaritasi (`quote.*`, `user.*` incl. `super-approve/unapprove/reject`, `admin.permissions`, `policy.*`, `backup.upload`, `telegram.settings`, `email.*`, `quiz.*` va h.k.), darajalar `info/warn/ban/delete`. `live-logs` ham mavjud.
- **Tasdiqlash inbox'i** (`users-tab`): `isSuperApproved` → "Super Verified" badge; xuddi shu yerdan `super-approve` / `super-unapprove` (DELETE) va «make-admin» amallari (`/api/admin/users/:id/super-approve`).

### 5.2 Email bildirishnomalari — USER_APPROVED pipeline
`server/src/lib/email.ts` → `sendEmail()` transport tartibi: **SMTP (nodemailer, production: smtp.gmail.com:587, App Password) → Resend API → offline transcript** (test). Har bir yuborish `EmailLog`'ga (DB) yoziladi; yetkazib bo'lmasa Super Admin ogohlantiriladi.

- `buildUserApprovedEmail()` — Uzbek HTML shablon: subject **"Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉"**, salomlashish (ismning birinchi so'zi), "Xush kelibsiz! Akkountingiz Super Admin tomonidan tasdiqlandi...", Ko'k "Saytga o'tish" tugmasi, `escapeHtml` qilinib ishlatiladi.
- `sendUserApprovedEmail()` — **fire-and-forget** (`void ...`; `sendEmail` hech qachon throw qilmaydi, moderatsiya emailga bog'liq emas).
- Uch joyda ishga tushiriladi: admin-panel `super-approve` (`admin.ts`), approval-bot `applySuperApproveFromTelegram` (`telegram.ts`), `/verify` buyrug'i (`adminCommands.ts`). **Idempotentlik:** `verifyUser` oldindan "allaqachon tasdiqlangan" qaytaradi → dublikat xatlar chiqmaydi.

---

*Hujjat production'da tasdiqlangan qiymatlar va kod asosida tuzildi; xavfsizlik emas kalitlar (tokenlar, parollar) kiritilmadi.*