# Fase 6 – Auth (login `sysuser`)

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [05_phase-db-layer.md](./05_phase-db-layer.md) · Berikutnya: [07_phase-filter-global.md](./07_phase-filter-global.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (05_phase-db-layer.md) sudah lulus "✅ Cek selesai".

---

## Langkah 6.1 — Session cookie terenkripsi

📁 File: ➕ `src/server/session.ts`

```ts
import '@tanstack/react-start/server-only'
import { getIronSession } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { env } from '~/server/env'

export type SessionData = { userId?: string; name?: string }

const EIGHT_HOURS = 8 * 60 * 60

export function getAppSession() {
  return getIronSession<SessionData>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'nr_session',
      password: env.SESSION_SECRET,
      ttl: EIGHT_HOURS,
      cookieOptions: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}
```

- Isi session **hanya** `userId` dan `name` (§9.3 poin 6). Tidak pernah password.

✅ Cek selesai: `npm run typecheck` lulus.

## Langkah 6.2 — Rate limit & pembanding password

📁 File: ➕ `src/server/rate-limit.ts`, ➕ `src/server/rate-limit.test.ts`

```ts
export type RateLimiter = { hit(key: string, nowMs?: number): boolean } // true = allowed, false = blocked
export function createRateLimiter(opts: { max: number; windowMs: number }): RateLimiter
```

- Kunci = `${ip}|${loginId.toLowerCase()}`; batas **5 percobaan per 60 detik** (§9.3 poin 5).
- Simpan di `Map` dalam memori; hapus entri yang kedaluwarsa setiap kali `hit` dipanggil.

📁 File: ➕ `src/server/password.ts`, ➕ `src/server/password.test.ts`

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

/** Compare two strings in constant time (G26). Different lengths are safe because the hashes are compared. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}
```

✅ Cek selesai (test wajib):
- Rate limiter: 5 `hit` pertama → `true`, ke-6 dalam 60 detik → `false`, setelah 60 detik → `true` lagi (pakai parameter `nowMs`, bukan menunggu sungguhan).
- `safeEqual('abc','abc')` → `true`; `safeEqual('abc','abd')` → `false`; `safeEqual('a','abc')` → `false`.

## Langkah 6.3 — Repository login

📁 File: ➕ `src/server/repo/auth.repo.ts`

```ts
import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'

export type LoginCandidate = { userId: string; fullName: string; userStatus: number; password: string }

/** The ONLY function allowed to select the `password` column (G27). */
export async function findLoginCandidate(loginId: string): Promise<LoginCandidate | null> {
  const result = await rows<LoginCandidate>(sql`
    SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus, password AS password
    FROM sysuser
    WHERE login_id = ${loginId}
    LIMIT 2
  `)
  return result.length === 1 ? result[0]! : null   // 0 or >1 rows → login fails
}

export async function findUserById(userId: string): Promise<{ userId: string; fullName: string; userStatus: number } | null> {
  const result = await rows<{ userId: string; fullName: string; userStatus: number }>(sql`
    SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus
    FROM sysuser WHERE user_id = ${userId} LIMIT 1
  `)
  return result[0] ?? null
}
```

Tambahkan juga di `auth.repo.ts` — status user yang boleh login (sumber: `com/project/admin/User.java` ERP: `0` New, `1` Logged out, `2` Logged In, `3` Password Expired, `4` Inactive):

```ts
export const LOGIN_ALLOWED_STATUSES = [0, 1, 2] as const   // 3 and 4 are rejected (see plans/README.md §9, K6)
```

✅ Cek selesai: `npm run typecheck` lulus; `sql-guard.test.ts` tetap lulus.

## Langkah 6.4 — Server function auth & middleware

📁 File: ➕ `src/functions/auth.fn.ts`

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'

const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
})

export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    // dynamic imports keep server modules out of the browser bundle
    const { findLoginCandidate, LOGIN_ALLOWED_STATUSES } = await import('~/server/repo/auth.repo')
    const { safeEqual } = await import('~/server/password')
    const { loginLimiter } = await import('~/server/login-limiter')
    const { getAppSession } = await import('~/server/session')

    const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    if (!loginLimiter.hit(`${ip}|${data.loginId.toLowerCase()}`)) {
      return { ok: false as const, error: 'tooMany' as const }
    }
    const user = await findLoginCandidate(data.loginId)
    // Always compare (against a dummy value when the user does not exist) so timing is the same.
    const passwordOk = safeEqual(data.password, user?.password ?? '\u0000invalid\u0000')
    const statusOk = user !== null && (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(Number(user.userStatus))
    if (!user || !passwordOk || !statusOk) {
      return { ok: false as const, error: 'invalid' as const }   // SAME error for every failure (data-model §9.3 item 3)
    }
    const session = await getAppSession()
    session.userId = user.userId
    session.name = user.fullName
    await session.save()
    return { ok: true as const }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  session.destroy()
  return { ok: true as const }
})

export const getCurrentUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  if (!session.userId) return null
  return { userId: session.userId, name: session.name ?? '' }
})
```

📁 File: ➕ `src/server/login-limiter.ts`

```ts
import '@tanstack/react-start/server-only'
import { createRateLimiter } from './rate-limit'

export const loginLimiter = createRateLimiter({ max: 5, windowMs: 60_000 })
```

📁 File: ➕ `src/functions/middleware.ts`

```ts
import { createMiddleware } from '@tanstack/react-start'

/** Required on ALL server functions except login/logout/getCurrentUser/prefs (G31). */
export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  if (!session.userId) throw new Error('UNAUTHORIZED')
  return next({ context: { userId: session.userId } })
})
```

🚫 Dilarang:
- `console.log(data)` di `loginFn` (memuat password).
- Mengembalikan objek `user` mentah dari repo.
- Memperbarui `last_login_date`/`last_login_ip` (DB read-only, §2.2).

✅ Cek selesai: `npm run typecheck` lulus.

## Langkah 6.5 — Guard halaman & halaman login

✏️ `src/routes/_authed.tsx`:

```tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentUserFn } from '~/functions/auth.fn'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUserFn()
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user }
  },
  component: AuthedLayout, // AppShell from phase 3 + <Outlet />
})
```

✏️ `src/routes/login.tsx`:
- `validateSearch: z.object({ redirect: z.string().startsWith('/').catch('/summary') })` — hanya path internal (mencegah *open redirect*).
- Form: `loginId`, `password` (`type="password"`, `autoComplete="current-password"`), tombol primary `auth.submit`.
- Hasil `{ ok: false, error: 'invalid' }` → tampilkan `auth.invalid` ("Username atau password salah" / "Incorrect username or password"). `'tooMany'` → `auth.tooMany`.
- Sukses → `router.invalidate()` lalu `navigate({ to: search.redirect })`.
- Tampilan: kartu `nr-card` di tengah kanvas, nama produk "Neraca" di atasnya. Tanpa ilustrasi.

✏️ TopBar: menu avatar berisi "Keluar" → `logoutFn()` → `navigate({ to: '/login' })`.

✅ Cek selesai:
- Membuka `/summary` tanpa login → pindah ke `/login?redirect=%2Fsummary`.
- ⛔ IZIN USER (memakai DB): login dengan akun lokal yang valid → masuk ke `/summary`; password salah → pesan `auth.invalid`; 6× salah dalam 1 menit → `auth.tooMany`.
- DevTools → Network → respons `loginFn` tidak memuat kata `password` dan tidak memuat ID/nama user.
- Cookie `nr_session` ber-flag `HttpOnly` dan `SameSite=Lax`.

## Langkah 6.6 — Test integrasi login ⛔ IZIN USER

📁 File: ➕ `tests/integration/setup.ts`, ➕ `tests/integration/auth.int.test.ts`

`setup.ts`: memuat `.env` (`process.loadEnvFile('.env')`); bila `TEST_DATABASE_URL` diisi, setel `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL`; lalu **menolak** berjalan (`throw new Error("Integration tests may only run against a local database")`) bila host `DATABASE_URL` bukan `localhost`/`127.0.0.1`/`::1`. File ini dijalankan Vitest sebelum modul lain diimpor.

`auth.int.test.ts` (memanggil `findLoginCandidate` dan logika login secara langsung, bukan lewat HTTP):
- User dengan `user_status = 4` ditolak.
- Password salah ditolak dengan error `'invalid'`.
- Objek hasil `loginFn` tidak punya properti `password`.

> Butuh akun uji di DB lokal. Bila belum ada akun yang boleh dipakai, tanya user (jangan membuat akun di `sysuser` tanpa izin; di DB seed Fase 15 akun demo dibuat otomatis).

✅ Cek selesai: `npm run test:db -- auth` lulus.
