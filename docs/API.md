# API Reference

Base URL (production): `https://yerlikoglon-backend.onrender.com`

Format: JSON. Errors: `{ "error": "<message>" }` with a 4xx/5xx status.

## Autentifikatsiya

- **User** (hisob): JWT `Bearer` header — `Authorization: Bearer <token>`. Token `POST /api/auth/login` yoki `POST /api/auth/register` dan olinadi.
- **Admin**: parol `ADMIN_PASSWORD` ham `Bearer` sifatida uzatiladi. Admin socket orqali ham `admin:auth` bilan tasdiqlanadi.
- Credential'lar va admin endpointlar IP bo'yicha rate-limited.

## HTTP endpointlar

### Umumiy

| Method | Path | Auth | Tavsif |
|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true }` |
| GET | `/api/online` | — | `{ online: number }` — onlayn foydalanuvchilar |
| GET | `/api/items` | — | Bosh kanvas elementlari. Query: `limit` (1–2000, default 500), `before` (cursor, eski sahifalar), `minX/maxX/minY/maxY` (bbox). Javob: `{ items, next }`. Birinchi sahifa 1.5s cache'lanadi. |
| POST | `/api/items` | opsional user | `{ type: "TEXT"\|"STICKY", content, x, y, color? }` → `{ item }`. Matn profanity filterdan o'tadi. |
| POST | `/api/upload` | bloklanmagan IP | `multipart/form-data`, maydon `file` (image/*) → `{ url }`. R2'ga (yoki lokal) yuklanadi; MIME magic-bytes tekshiriladi. |
| POST | `/api/report` | opsional user | `{ itemId, reason }` (≥3 belgi) → `201 { report }` |
| GET | `/api/rooms` | — | `{ rooms: PublicRoom[] }` — faqat ommaviy xonalar, 15s cache |
| GET | `/api/rooms/:slug` | — | `{ room: PublicRoom }` — xona metadata, 15s cache |
| POST | `/api/rooms/:slug/items` | opsional user | `{ password? }` → `{ room, items }`. Maxfiy xonada parol tekshiriladi (403 xato bo'lsa). Ommaviy snapshot 3s cache. |
| POST | `/api/rooms` | **user token** | `{ name, slug?, description?, isPublic?, password? }` → `201 { room }` |

### Auth

| Method | Path | Auth | Tavsif |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{ username, password, displayName?, color? }` → `201 { token, user }`. Dublikat username → 409. |
| POST | `/api/auth/login` | — | `{ username, password }` → `{ token, user }`. Noto'g'ri → 401. Vaqt egali hudud yo'q (dummy hash). |
| GET | `/api/auth/me` | user token | `{ user }` — sessiyani tiklash |
| POST | `/api/auth/logout` | — | `{ ok: true }` — state saqlanmaydi, client token'ni tashlaydi |

### Admin (Bearer: `ADMIN_PASSWORD`)

| Method | Path | Tavsif |
|---|---|---|
| GET | `/api/admin/stats` | `{ items, bans, online }` |
| GET | `/api/admin/items` | `{ items }` — oxirgi 500 element (IP + koordinatalar bilan) |
| DELETE | `/api/admin/items/:id` | `{ ok: true }` — bitta element |
| DELETE | `/api/admin/items` | `{ ok: true, deleted }` — butun kanvasni tozalash |
| GET | `/api/admin/bans` | `{ bans }` |
| POST | `/api/admin/bans` | `{ ipAddress, reason? }` → `{ ban }` |
| DELETE | `/api/admin/bans/:ip` | `{ ok: true }` |
| GET | `/api/admin/logs` | `{ logs }` — so'nggi 200 ta moderatsiya yozuvi |
| GET | `/api/admin/uploads?url=...` | `{ meta }` — saqlangan fayl metadata |
| DELETE | `/api/admin/uploads` | `{ url }` → `{ ok: true }` |
| GET | `/api/admin/reports?status=OPEN` | `{ reports }` — moderatsiya navbati |
| POST | `/api/admin/reports/:id/resolve` | `{ action: "DISMISS"\|"REMOVE" }` → `{ ok, action }`. `REMOVE` elementni yashiradi |

## Object'lar

**PublicItem**: `{ id, type, content, x, y, color, reactions, userId, authorName, roomId, createdAt, updatedAt }`

**PublicRoom**: `{ id, slug, name, description, isPublic, itemCount, createdAt }`

## Socket.IO (real-time)

Ulanish: `io(BASE_URL, { auth: { token } })` — `token` ixtiyoriy (mehmon sifatida ulanadi). Mevzularda `JWT_SECRET` bilan tekshiriladi.

### Client → Server

| Event | Payload |
|---|---|
| `cursor:move` | `{ x, y }` |
| `canvas:item-add` | `{ type, content, x, y, color? }` |
| `canvas:item-move` | `{ id, x, y }` |
| `canvas:item-delete` | `{ id }` |
| `canvas:item-undo` | `{ id }` — o'chirilgan elementni tiklash |
| `canvas:reaction` | `{ id, emoji }` |
| `room:join` | `{ slug, password? }` |
| `room:leave` | — |
| `admin:auth` | `{ password }` |
| `admin:ban` | `{ ipAddress, reason? }` |
| `admin:unban` | `{ ipAddress }` |
| `admin:delete` | `{ id }` |

### Server → Client

| Event | Payload |
|---|---|
| `canvas:init` | `{ online, ip, name, color, userId? }` |
| `canvas:item-add` | `{ item }` |
| `canvas:item-move` | `{ id, x, y }` |
| `canvas:item-delete` | `{ id, roomId? }` |
| `canvas:item-reaction` | `{ id, reactions }` |
| `canvas:clear` | — |
| `cursor:move` | `{ id, x, y, color, name }` |
| `presence:update` | `{ roomId?, users, online }` |
| `banned` | `{ reason }` |
| `room:joined` | `{ room }` |
| `room:left` | — |
| `room:error` | `{ error }` |
| `admin:authed` | `{ ok }` |
| `admin:log` | `{ id, time, level, message }` |
| `admin:ban` / `admin:unban` | `{ ipAddress }` |
| `error` | `{ message }` |

## Rate limit va cache

- Credential auth (`/register`, `/login`), yozuvlar (`/items`, `/upload`), report va admin endpointlar per-IP limiterga ega (test rejimida o'chiriladi).
- Cache (in-memory TTL): `items:first:*` 1.5s, `roomItems:*` 3s, `rooms:list` va `room:*` 15s, banned-IP 30s. Kanvas yoki xona o'zgarishlari (`canvas:*` bus eventlari) tegishli cache'ni darhol invalidatsiya qiladi.
