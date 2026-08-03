# Rivojlantirish rejasi (Roadmap)

Loyiha: real vaqt rejimidagi collaborative canvas (Next.js static + Express/Socket.io/Prisma).
Bu reja foydali funksiyalar, kod sifati/xavfsizlik yaxshilashlari va bosqichma-bosqich vazifalarni belgilaydi.

---

## 1. Joriy holat qisqacha

- **Identifikatsiya:** IP asosidagi mehmonlar (`socket.data.ip`), admin faqat umumiy parol (`ADMIN_PASSWORD`).
- **Canvas:** TEXT/STICKY/IMAGE elementlar — DB'da, real vaqtda Socket.io orqali broadcast, Redis bus (multi-instance).
- **Imkoniyatlar:** kursorlar, reaksiyalar, profaniti filter, IP ban, admin delete/ban.
- **Cheklovlar:** auth yo'q, xonalar yo'q, tarix/undo yo'q, `strict:false` TypeScript, zod yo'q, CI yo'q.

---

## 2. Taklif qilinadigan funksiyalar

### Foydalanuvchi autentifikatsiyasi (asosiy)
- `User` modeli (Prisma): register/login, `argon2` parol hash, JWT (httpOnly cookie) yoki Bearer.
- Socket handshake'da auth (`socket.handshake.auth.token`); anonimlar mehmon bo'lib qoladi.
- Element egasi `userId` bilan bog'lanadi — IP emas (IP NAT'da bir necha foydalanuvchiga tegishli bo'ladi).
- Admin: alohida `role` maydoni, umumiy parol o'rniga real admin loginlari (eski parol tizimini saqlab o'tish).

### Xonalar / rooms boshqaruvi
- `Room` modeli: `id, name, slug, isPublic, ownerId, createdAt`.
- `CanvasItem.roomId` — har bir xona izolyatsiyalangan.
- Socket: `join/leave`, `socket.join(room)`, presence va cursor faqat xona ichida.
- Havola orqali taklif (`/r/:slug`), maxfiy xonalar (parol) yoki public "main" xona.

### Tarixni saqlash (history)
- `ItemEdit` append-only modeli: `id, itemId, action (create/move/update/delete), snapshot, actorId, at`.
- Undo/redo — foydalanuvchi o'z elementlari uchun.
- Admin audit jurnali va vaqt bo'yicha replay (timelapse).

### Moderatsiya va xavfsizlik
- Element "report" qilish, admin review queue, soft-delete (`deletedAt`).
- Profaniti dictionary'ni yangilash + kontekst filtri.

### Boshqa foydali funksiyalar
- Chat sidebar (xona ichida) — Socket.io orqali, XSS'dan himoyalangan.
- R2 uploadlar (skafold tayyor): thumbnail (Cloudflare Images), fayl metadatalari, o'chirish.
- Online foydalanuvchilar ro'yxati + ism/ko'rinish (rasmlar).

---

## 3. Kod sifati, xavfsizlik va optimallashtirish

### Kod sifati
- **TypeScript strict qayta yoqish** (`strict:true` + `noImplicitAny:true`) — bosqichma-bosqich: avval `any`larni zod DTO bilan almashtirib, keyin yoqish.
- **Zod** validatsiya: barcha socket event'lar va REST body'lar uchun (hozir qo'lda tekshiruv).
- **Shared types paketi** (`packages/types`) — client/server tiplarini birlashtirish (hozir dublikat).
- ESLint + Prettier monorepo darajasida; `lint` CI'da tekshiriladi.
- Env validatsiya (`zod`/`envsafe`) — ishga tushishda `DATABASE_URL`, `CORS_ORIGINS` va h.k. tekshiriladi.

### Xavfsizlik
- CORS: `*` o'rniga aniq origin ro'yxati (hozir default `*`).
- `app.set("trust proxy", 1)` — reverse-proxy ortida to'g'ri IP/rate-limit.
- HTTP rate limiting (`express-rate-limit`) + socket'da IP bo'yicha qo'shimcha limiter.
- Websocket auth handshake: token birinchi xabarda tekshiriladi, haqiqiy emas -> disconnect.
- Secret'lar faqat Render env'da; log'larga token/parol tushmasligi.
- Barcha user-generated kontent XSS-safe render (client'da `dangerouslySetInnerHTML` yo'q).

### Optimallashtirish
- `item-move` DB yozuvlari: hozir socket'da 100ms debounce — umumiy birlashtirilgan debouncer/batch yozish (Redis orqali).
- `/api/items`: pagination + geografik/spatial filtrlash (PostGIS yoki tile) katta canvaslar uchun.
- Cache header'lar (`/api/items` uchun ETag/CDN), R2/CDN uchun uploadlar.
- Observability: pino structured logs, request-id, `/metrics` (Prometheus), Sentry.
- Test: vitest (birlik) + Playwright (E2E: 2 foydalanuvchi parallel canvas).

---

## 4. Bosqichma-bosqich vazifalar ro'yxati

Har bir qadam tugagach: `git add . && git commit && git push origin main` (AGENTS.md qoidasi).

### Faza A — Poydevor va xavfsizlik (v0.9)
1. Zod validatsiya: REST + socket event DTO'lari (birinchi `packages/` yoki `server/src/schemas`).
2. HTTP rate-limit + `trust proxy` + socket IP limiter.
3. `@types` va strict TS: qolgan `any`larni olib, `strict:true` yoqish; `npm run typecheck` yashil.
4. Vitest birlik testlar: validatsiya, cooldown/throttle, profaniti, presence.
5. GitHub Actions CI: `lint → typecheck → build → test` (prisma generate bilan).
6. Pino structured logging + request-id (xavfsiz: sekretlar chiqmaydi).

### Faza B — Foydalanuvchilar va admin (v1.0)
7. Prisma `User` modeli + migratsiya; register/login (argon2), JWT (httpOnly cookie).
8. Socket handshake auth; `CanvasItem.userId`, egasi bo'yicha o'chirish (IP o'rniga).
9. Admin rollar (`ADMIN`, `MODERATOR`) + admin login tizimi; eski `ADMIN_PASSWORD` ham ishlayveradi (davr o'tishi).
10. Client auth UI: register/login/profile, ism + rang tanlash, profil rasmi.

### Faza C — Xonalar va tarix (v1.1)
11. `Room` modeli + migratsiya; item'larga `roomId`; socket join/leave; per-room presence/cursor.
12. Xona sahifalari (`/r/:slug`), public/private, taklif havolasi.
13. `ItemEdit` tarixi: append-only, undo/redo (o'z elementlar), admin audit.
14. Moderatsiya: report + admin review queue + soft-delete.

### Faza D — Kengaytirish va operatsiyalar (v1.2)
15. Redis `socket.io` adapteri (custom bus o'rniga) + presence Redis'da — haqiqiy multi-instance.
16. R2 upload to'liq: thumbnail, fayl metadatalari, CDN, o'chirish.
17. `/api/items` pagination + spatial query (katta canvaslar).
18. Deploy mustahkamligi: Render'da pre-deploy `prisma migrate deploy`, healthcheck; VPS nginx/PM2'da xuddi shunday; `pg_dump` cron zaxira.

---

## 5. Tavsiya etilgan boshlash

Eng katta qiymat: **Faza A (1–3)** → **Faza B (7–8)**. Auth'ni qo'shish IP'ga bog'liq ownership/ban muammolarini hal qiladi va xonalar/history uchun asos bo'ladi. Xonalar tarixdan oldin, tarix esa auth'siz mazmunli emas.
