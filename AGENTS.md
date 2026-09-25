# AGENTS.md — Loyiha va AI Yordamchisi Qoidalari

## 1. Monorepo va Ish Tartibi (Git & Commits)
- Loyiha monorepo tuzilishiga ega (`client/` va `server/`).
- Har bir mantiqiy tugallangan topshiriqdan so'ng, o'zgarishlarni avtomatik ravishda commit va push qilib boring.
- Commit xabarlari aniq va tushunarli bo'lishi shart (masalan: `feat: ...`, `fix: ...`, `chore: ...`).
- Deploy manzillari: frontend `https://default-project-bza.pages.dev`; API (ko'chma): `https://yerlikoglon-backend.onrender.com`.

## 2. Server va VPS Konfiguratsiyasi
- **Backend Port:** `4000` (`config.ts` va `server/.env`)
- **Frontend Dev Port:** `3000` (Next.js)
- **PM2 App Name:** `canvas-server` (`deploy/ecosystem.config.cjs` va `/opt/canvas` yo'li bo'yicha)
- **PM2 Buyrug'i:** `pm2 reload canvas-server`
- **CORS Origins:** `http://localhost:3000`, `https://*.pages.dev`, `https://yerlikoglon.uz`, `https://*.yerlikoglon.uz`, `https://api.yerlikoglon.uz`

## 3. Maxfiylik va Muhit Sozlamalari (.env)
- Maxfiy kalitlar, login, parol va tokenlar kod ichida yozilishi taqiqlanadi (hech qanday hardcode).
- Barcha maxfiy ma'lumotlar `.env` orqali boshqariladi. `.env` o'zgarsa, `client/.env.example` va `server/.env.example` mos ravishda yangilanadi.
- Client tomonda faqat `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_TEST_MODE`, `NEXT_PUBLIC_SENTRY_DSN` kalitlari ishlatiladi.

## 4. Xavfsizlik va Mantiq
- Loyihadagi mavjud xavfsizlik mexanizmlari saqlab qolinsin: **FATAL guard**, **replay-detektor**, **GDPR self-delete** va **Admin DTO**.
- Har qanday kiritilgan o'zgarishdan so'ng xavfsizlik va mantiqni tekshirish uchun testlar yurgizilishi shart:
  ```bash
  npm test && npm run test:e2e
  ```

## 5. Ish Muhiti (Windows / PowerShell)
- Git: `C:\Program Files\Git\cmd`; Node.js: `C:\Program Files\nodejs` — har bir shell'da PATH'ga qo'shish kerak.
- `git` buyruqlarida OneDrive yo'li bo'lgani uchun yo'llarni tirnoq ichida ishlatish zarur.