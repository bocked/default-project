# Cloudflare Pages — GitHub avtomatik deploy (yo'riqnoma)

Loyiha monorepo: `client/` = Next.js static export, `server/` = Express API
(Render'da). Pages'ga faqat `client/` deploy bo'ladi.

## Tekshirilgan sozlamalar (repo ichida)

| Narsa | Qiymat | Joyi |
|---|---|---|
| Static export | `output: "export"` | `client/next.config.ts` |
| Build script | `npm run build` → `next build` | `client/package.json` |
| Build chiqishi | `out/` | Next.js default (export) |
| Node versiyasi | 22 | `.node-version` (repo ildizi) |
| Lockfile | `package-lock.json` bor | `client/` → Pages `npm ci` ishlatadi |
| Local dev/deploy | `pages_build_output_dir = "out"` | `client/wrangler.toml` |

Pages rasmiy preseti tasdiqlaydi: **Next.js (Static HTML Export)** →
build `npx next build`, chiqish `out`.

## Dashboard'da sozlash

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. GitHub reponi tanlang: `bocked/default-project`.
3. **Build settings**:

   | Soha | Qiymat |
   |---|---|
   | Production branch | `main` |
   | Root directory | `client` |
   | Build command | `npm run build` |
   | Output directory | `out` |

   > Build command uchun `npx next build` ham ishlaydi — ikkalasi ekvivalent.
   > `NEXT_PUBLIC_SERVER_URL` **shart emas**: `client/src/lib/config.ts`
   > defaulti allaqachon `https://yerlikoglon-backend.onrender.com`.
4. **Save and Deploy**. Birinchi build Git integrationni ulaydi; keyingi
   `main` commit'lar avtomatik deploy bo'ladi.

## Qo'shimcha: lokal preview

```bash
cd client
npx wrangler pages dev out
```

## Muhim eslatmalar

- `client/wrangler.toml` faqat Pages konfiguratsiyasini (output dir) o'rnatadi.
  **Build command va Root directory faqat Dashboard orqali** o'rnatiladi —
  ularni wrangler faylida yozib bo'lmaydi.
- Agar wrangler fayli ishlatilsa, u Pages config uchun "source of truth"
  bo'ladi; bu yerda faqat `out` ko'rsatilgani uchun ziddiyat yo'q.
- CORS: Render backendda `CORS_ORIGINS` bo'lmasa hamma origin ruxsat
  (`*` default). Bo'lsa, `https://default-project-bza.pages.dev,
  https://*.pages.dev, https://yerlikoglon.uz, https://www.yerlikoglon.uz`
  qo'shilganini tekshiring.
