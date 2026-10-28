# Fase 5 – DB layer

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [04_phase-i18n-format.md](./04_phase-i18n-format.md) · Berikutnya: [06_phase-auth.md](./06_phase-auth.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (04_phase-i18n-format.md) sudah lulus "✅ Cek selesai".

---

> Aturan file server: file di `src/server/**` yang **mengakses env, DB, atau cookie** wajib diawali baris `import '@tanstack/react-start/server-only'`. File di `src/server/**` yang punya unit test (`rate-limit.ts`, `cache.ts`, `password.ts`, `db/gl-tables.ts`, `oid.ts`) **tidak** diberi baris itu dan **tidak boleh** mengakses env/DB/cookie, supaya bisa dites Vitest.

## Langkah 5.1 — Variabel lingkungan server

📁 File: ➕ `src/server/env.ts`

```ts
import '@tanstack/react-start/server-only'
import { z } from 'zod'

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env') } catch { /* no .env file: let the validation below fail */ }
}

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith('mysql://'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(10).default(5),
  SESSION_SECRET: z.string().min(32),
  APP_TIMEZONE: z.string().default('Asia/Jakarta'),
  PNL_OCI_ROOT_CODES: z.string().default('9'),
  ERP_APP_ID_INDEX: z.coerce.number().int().min(0).max(99).default(7),
  NODE_ENV: z.string().default('development'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Report only the NAMES of invalid variables, never their values.
  throw new Error(`Invalid environment variables: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
}

export const env = {
  ...parsed.data,
  ociRootCodes: parsed.data.PNL_OCI_ROOT_CODES.split(',').map((s) => s.trim()).filter(Boolean),
}
```

🚫 Dilarang: `console.log(env)`, `console.log(process.env)`, menulis nilai env ke error.

✅ Cek selesai:
- `npm run typecheck` lulus.

## Langkah 5.2 — Cek DB lokal ⛔ IZIN USER

🎯 Tujuan: memastikan koneksi, versi, dan dua fakta struktur yang dibutuhkan Settings.

Minta izin, lalu jalankan (CLI MySQL lokal, hanya membaca):

```bash
/d/xampp/mysql/bin/mysql.exe --defaults-extra-file=.dbclient.cnf -e "SELECT VERSION(); SHOW INDEX FROM system_main WHERE Key_name <> 'PRIMARY'; SHOW COLUMNS FROM system_main LIKE 'sysmain_id';"
```

Catat di `docs/progress.md`:
1. Versi server (DB `demo` = MariaDB 10.4.x).
2. Apakah ada index **UNIQUE** pada `system_main.name` (kolom `Non_unique` = 0). Bila **tidak** ada, berhenti dan tanya user (upsert §5.4 bergantung padanya).
3. Kolom `Extra` pada `sysmain_id`: berisi `auto_increment` atau kosong (keduanya bisa ditangani, lihat langkah 8.5).

✅ Cek selesai: tiga fakta di atas tercatat.

## Langkah 5.3 — Koneksi `mysql2` + Drizzle

📁 File: ➕ `src/server/db/client.ts`

```ts
import '@tanstack/react-start/server-only'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from '~/server/env'

declare global {
  // eslint-disable-next-line no-var
  var __nrPool: mysql.Pool | undefined
}

/** One pool per server process (reused across hot reloads). */
export const pool =
  globalThis.__nrPool ??
  mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: env.DB_POOL_SIZE,
    supportBigNumbers: true,  // G11
    bigNumberStrings: true,   // G11
    decimalNumbers: false,    // keep DECIMAL as string (G12)
    dateStrings: true,        // DATE/DATETIME as string (G13)
    charset: 'utf8mb4',
    waitForConnections: true,
  })
globalThis.__nrPool = pool

export const db = drizzle(pool, { mode: 'default' })
```

📁 File: ➕ `src/server/db/query.ts`

```ts
import '@tanstack/react-start/server-only'
import type { SQL } from 'drizzle-orm'
import { db } from './client'

/** Run a parameterized query and return the SELECT result rows. */
export async function rows<T>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as [T[], unknown]
  return result[0]
}

/** Parameterized `IN (...)` helper. Callers must make sure the list is not empty. */
export { inList } from './in-list'
```

📁 File: ➕ `src/server/db/in-list.ts`

```ts
import { sql, type SQL } from 'drizzle-orm'

export function inList(values: readonly string[]): SQL {
  if (values.length === 0) throw new Error('inList: empty list')
  return sql.join(values.map((v) => sql`${v}`), sql`, `)
}
```

✅ Cek selesai:
- `npm run typecheck` lulus.

## Langkah 5.4 — Skema Drizzle dari DB lokal ⛔ IZIN USER

📁 File: ➕ `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile('.env') } catch { /* continue to the check below */ }
}
const url = process.env.DATABASE_URL ?? ''
const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('drizzle-kit may only run against a LOCAL database (localhost/127.0.0.1).')
}

export default defineConfig({
  dialect: 'mysql',
  out: './drizzle',
  dbCredentials: { url },
  tablesFilter: [
    'company', 'pos_location', 'segment', 'segment_detail', 'periode', 'coa',
    'coa_opening_balance_location', 'gl', 'gl_detail', 'ap_ar_card', 'ap_ar_card_detail',
    'bank_payment', 'bank_payment_history', 'bankpo_payment', 'bankpo_payment_detail',
    'vendor', 'customer', 'cash_flow_group', 'cash_flow_setup', 'coa_budget', 'balance_gl',
    'system_main', 'sysuser',
  ],
})
```

Langkah:
1. Minta izin user, lalu jalankan `npm run db:pull`.
2. Salin `drizzle/schema.ts` ke `src/server/db/schema.ts`, lalu ubah:
   - Tambahkan `import '@tanstack/react-start/server-only'` di baris pertama.
   - Ganti **semua** `bigint("…", { mode: "number" })` menjadi `bigint("…", { mode: "string" })` (G11).
   - Tabel `vendor` dan `customer`: hapus semua kolom **kecuali** `vendor_id`/`customer_id`, `code`, `name` (G28).
   - Tabel `sysuser`: hapus semua kolom **kecuali** `user_id`, `login_id`, `password`, `full_name`, `email`, `user_status`.
   - Hapus definisi `relations` bila ada (G4).
3. Hapus folder `drizzle/` hasil pull (sudah tercantum di `.gitignore` sejak langkah 0.3).

🚫 Dilarang: `drizzle-kit push`, `migrate`, `generate` (G8).

✅ Cek selesai:
- `src/server/db/schema.ts` tidak memuat `mode: "number"`.
- `npm run typecheck` lulus.

## Langkah 5.5 — Nama tabel GL dinamis

📁 File: ➕ `src/server/db/gl-tables.ts`, ➕ `src/server/db/gl-tables.test.ts`

Isi persis seperti [README §5.6](README.md#56-nama-tabel-gl-dinamis-arsip), ditambah:

```ts
import type { Period } from '~/lib/finance/types'

/** Group periods by their GL table. */
export function groupPeriodsByTable(periods: Period[]): Map<string, Period[]>
```

✅ Cek selesai (test wajib):
- `glTablesOf('gl')` → `{ gl: 'gl', glDetail: 'gl_detail' }`.
- `glTablesOf('gl_2015')` → `{ gl: 'gl_2015', glDetail: 'gl_detail_2015' }`.
- `glTablesOf('gl; DROP TABLE x')`, `glTablesOf('users')`, `glTablesOf('')` → melempar error.

## Langkah 5.6 — Penjaga kompatibilitas MySQL 5.7 (test statis)

📁 File: ➕ `src/server/repo/sql-guard.test.ts`

Test ini membaca semua file `src/server/repo/*.ts` **kecuali** file `*.test.ts` (pakai `fs.readdirSync` + `fs.readFileSync`) dan gagal bila menemukan pola berikut:

| Pola regex | Alasan |
|---|---|
| `/\bWITH\s+(RECURSIVE\s+)?\w+\s+AS\s*\(/i` | CTE (G1) |
| `/\bOVER\s*\(/i` | window function (G1) |
| `/\bLATERAL\b/i` | G1 |
| `/\bREGEXP_(REPLACE\|SUBSTR\|INSTR\|LIKE)\b/i` | G1 |
| `/\bROW_NUMBER\b\|\bRANK\s*\(\|\bLAG\s*\(\|\bLEAD\s*\(/i` | G1 |
| `/\)\s*AS\s+new\b/i` | alias upsert 8.0 (G3) |
| `/SELECT\s+\*/i` | wajib kolom eksplisit (G27) |
| `/sql\.raw\s*\(/` | nama tabel wajib lewat whitelist + `sql.identifier` (G6) |
| `/\bpassword\b/i` di file **selain** `auth.repo.ts` | kolom password hanya di satu fungsi login (G27) |
| `/\b(nomor_rekening\|no_rek\|npwp\|no_npwp\|id_number\|bank_account_number)\b/i` | kolom sensitif vendor/customer (G28) |
| `/\b(UPDATE\|DELETE\|INSERT)\b/i` di file **selain** `settings.repo.ts` | hanya `system_main` yang boleh ditulis (G9) |
| `/\b(DROP\|ALTER\|CREATE\|TRUNCATE\|RENAME)\b\s+(TABLE\|INDEX\|DATABASE)\b/i` di file mana pun | tanpa DDL (G8) |

✅ Cek selesai:
- Test lulus (saat ini folder repo masih kosong → test tetap lulus bila tidak ada file; pastikan test tidak error saat folder kosong).
