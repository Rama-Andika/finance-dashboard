# Fase 18 – Snapshot AP/AR akhir bulan (supaya "Bulan Lalu" dan angka pembanding tidak lagi timeout)

> Rencana implementasi untuk model AI pelaksana. Baca **seluruh** dokumen ini dari atas ke bawah sebelum mengubah satu file pun, lalu kerjakan langkah demi langkah **sesuai urutan**.
> Aturan proyek yang berlaku: `CLAUDE.md` di root repo (aturan ringkas, arsitektur berlapis, bahasa kode = Inggris).

---

## 0. Latar belakang (kenapa perubahan ini ada)

Halaman yang memakai AP/AR Aging (Ringkasan, Payables, Receivables, Payment Plan) menampilkan error ketika periode yang dipilih adalah **Bulan Lalu** (atau rentang kustom yang berakhir di bulan lampau). Penyebabnya:

1. Snapshot AP/AR yang ada (`dash_snap_ap_ar_open` dan `dash_snap_ap_ar_unallocated`) hanya berisi tagihan yang **masih terbuka pada hari refresh**. Fungsi `apArSnapshotCovers(asOf)` di `src/server/dash/snapshot.ts` hanya bernilai `true` bila `asOf` sama dengan atau sesudah hari snapshot itu.
2. Untuk tanggal lampau (misalnya 30 September), kode jatuh ke query langsung ke tabel ERP (`liveAgingInvoices` di `src/server/repo/apar.repo.ts`). Query itu diukur memakan **347 detik** di DB `demo` lokal, padahal batas waktu per query adalah **120 detik** (`DB_QUERY_TIMEOUT_MS`). Hasilnya: error "Failed query ...".
3. Menulis ulang query **sudah dicoba dan tidak membantu**: versi dengan subquery pembayaran butuh 373 detik. Pemindaian 2.043.179 tagihan saja 89 detik, dan penjumlahan 1.884.944 baris pembayaran 101 detik. Datanya yang besar, bukan cara menulis query.
4. Angka pembanding (periode sebelumnya) untuk **semua** pilihan periode juga memakai tanggal lampau. Karena itu `compareAgingTotal` di `ap-aging.service.ts` dan `ar-aging.service.ts` sengaja mengembalikan `null` (perbandingan AP/AR tidak tampil) sampai snapshot akhir bulan ada.

Pembersihan pesan error yang bocor (SQL tampil ke pengguna) sudah dikerjakan di fase terpisah dan tidak termasuk fase ini.

### Rancangan perbaikan (sudah diputuskan, jangan diubah)

Pola yang dipakai sama dengan snapshot GL bulanan (`dash_snap_gl_monthly`): pekerjaan berat dijalankan **sekali di latar belakang** untuk setiap akhir bulan, lalu halaman hanya membaca tabel kecil.

- **Tiga tabel baru** (semua berawalan `dash_`):
  - `dash_snap_ap_ar_hist_open`: tagihan terbuka pada akhir bulan (kolom sama dengan `dash_snap_ap_ar_open`, ditambah `as_of_date`).
  - `dash_snap_ap_ar_hist_unallocated`: pembayaran yang belum dialokasikan pada akhir bulan (kolom sama dengan `dash_snap_ap_ar_unallocated`, ditambah `as_of_date`).
  - `dash_snap_ap_ar_hist_dates`: daftar akhir bulan yang sudah selesai dibangun (penanda; ditulis dalam satu transaksi bersama barisnya, sehingga pembaca tidak pernah melihat bulan setengah jadi).
- **Pembangunnya memakai ulang** fungsi `loadOpenInvoices` dan `loadUnallocated` dari `src/server/dash/refresh-ap-ar.ts` (yang sudah memakai cara stream, bukan satu join besar). Jadi hasilnya sama persis dengan logika snapshot hari ini. Fungsi itu hanya perlu diberi kata `export`; isinya tidak diubah.
- **Berapa bulan**: `13` akhir bulan terakhir yang sudah lewat (bulan berjalan tidak ikut). Bisa diubah lewat env `DASH_AP_AR_HIST_MONTHS` (0 = fitur mati dan data lama dihapus; maksimum 36). Alasan 13: pilihan "Tahun Berjalan" dan "12 Bulan Terakhir" membandingkan dengan akhir bulan yang sama tahun lalu (12 bulan ke belakang); 1 bulan cadangan.
- **Akhir bulan "sementara" dan "final"**: data yang diinput terlambat bisa mengubah saldo akhir bulan lampau. Aturannya:
  - Dua akhir bulan terbaru dianggap **sementara** (`is_final = 0`), kecuali periode ERP-nya sudah berstatus `Closed`. Snapshot sementara dibangun ulang bila umurnya sudah 24 jam atau lebih, atau begitu ia menjadi final.
  - Akhir bulan yang lebih tua dari dua bulan terbaru, atau yang periodenya `Closed`, dianggap **final** (`is_final = 1`) dan tidak dibangun ulang.
  - Aturan ini ditulis sebagai fungsi murni (`planHistBuilds`) supaya bisa diuji tanpa database.
- **Satu bulan per putaran**: scheduler (`scheduler.ts`) membangun **maksimal 1 bulan per putaran** (`HIST_MAX_BUILDS_PER_TICK = 1`), supaya refresh snapshot hari ini tidak tertahan lama. Untuk mengisi semuanya sekaligus tersedia skrip `npm run dash:refresh-hist`.
- **Cara pembaca memilih sumber data** (di `apar.repo.ts`): snapshot hari ini bila tanggalnya mencakup; jika tidak, snapshot akhir bulan bila tanggal itu persis salah satu akhir bulan yang sudah dibangun; jika tidak, query langsung ke ERP seperti sekarang.
- **Angka pembanding** kembali tampil bila tanggal pembandingnya ada di snapshot akhir bulan.

### Yang TIDAK dikerjakan di fase ini (dicatat supaya tidak dikira terlewat)

- Tanggal lampau yang **bukan** akhir bulan, atau akhir bulan yang lebih tua dari 13 bulan, tetap memakai query langsung ke ERP (lambat, bisa timeout). Ini sengaja. Pesan errornya sudah aman (tidak membocorkan SQL).
- Sampai snapshot untuk suatu bulan selesai dibangun (pertama kali: sekitar satu putaran scheduler per bulan, atau satu kali `npm run dash:refresh-hist`), "Bulan Lalu" masih bisa timeout.
- Ukuran tabel baru belum diukur. Perkiraan kasar: 163.000 tagihan terbuka AP per bulan sudah terukur di DB `demo`; AR belum terukur. Dengan 13 bulan, jumlah barisnya kemungkinan jutaan.

### Yang TIDAK boleh dilakukan

- Jangan menjalankan perintah apa pun ke database (termasuk `npm run test:db`, `npx vitest run --project db`, `npm run db:dash:migrate`, `npm run dash:refresh*`, dan memakai klien `mysql`). Semua langkah database ada di bagian 2 dan dikerjakan oleh **user**.
- Jangan `npm install`, jangan menambah paket.
- Jangan commit atau push. Berhenti setelah Langkah 18.13 dan lapor ke user.
- Jangan mengubah file selain yang tertulis di dokumen ini.
- Jangan mengedit `src/routeTree.gen.ts`.
- Jangan membaca atau mencetak isi `.env` dan `.dbclient.cnf`.
- Jangan memakai `any`. Semua teks di dalam kode (komentar, nama test, pesan error, log) berbahasa **Inggris**.
- Jangan menambah string UI baru. Tidak ada teks baru untuk pengguna di fase ini, jadi `en.json` dan `id.json` tidak disentuh.
- Jangan menjalankan `drizzle-kit push`. Jangan membuat migrasi untuk tabel ERP.
- SQL harus jalan di **MySQL 5.7.44**: tanpa `WITH` (CTE), tanpa window function (`OVER`, `ROW_NUMBER`, `LAG`), tanpa `LATERAL`. Semua SQL di fase ini sudah mengikuti aturan itu; jangan menambahkan yang lain.

### Jebakan penting: `guard.test.ts` memindai kata tertentu

Test `src/server/dash/guard.test.ts` membaca **teks** semua file di `src/server/dash/` (selain `*.test.ts`) dan semua `scripts/dash-*.ts`, lalu mencari pola perintah tulis SQL **tanpa membedakan huruf besar/kecil**, termasuk di dalam **komentar dan string**. Kata-kata berikut, bila diikuti nama tabel atau kata lain, dianggap penulisan ke tabel: `insert into`, `replace into`, `update`, `delete from`, `truncate`, `drop table`, `alter table`, `create table`, `rename table`.

Akibatnya, di file-file tersebut:
- Jangan menulis komentar bahasa Inggris yang memuat kata **"update"** (misalnya "update the rows"), **"delete from"**, **"insert into"** dan sejenisnya. Pakai kata lain: "change", "remove", "add", "write".
- Satu-satunya pengecualian yang sudah aman: frasa `ON DUPLICATE KEY UPDATE` (sudah dikecualikan oleh test).
- Nama tabel pada perintah tulis harus berbentuk `??` (placeholder) dan nilainya harus dibungkus `dashTable(...)`, persis seperti kode di bawah.

Jika `guard.test.ts` gagal setelah Anda menulis file, cari kata-kata di atas pada komentar Anda.

### Catatan akhir baris (CRLF) — baca sebelum mengedit

Banyak file di repo ini memakai akhir baris **CRLF** (Windows): `schema.ts`, `snapshot.ts`, `apar.repo.ts`, `ap-aging.service.ts`, `ar-aging.service.ts`, `env.ts`, `.env.example`. Akibatnya pencocokan teks **multi-baris** pada tool Edit bisa gagal ("string not found") walaupun teksnya tampak sama.

Karena itu semua edit di dokumen ini dirancang memakai **satu baris** sebagai `old_string`. Aturan untuk Anda:
- Salin `old_string` **persis** satu baris seperti tertulis (tanpa karakter akhir baris).
- `new_string` boleh berisi beberapa baris. Hasil edit boleh bercampur akhir baris (CRLF dan LF); git hanya memberi peringatan "LF will be replaced by CRLF" dan itu **bukan error**.
- Jika sebuah Edit tetap gagal, **jangan menebak**. Jalankan Read pada file itu, salin teks baris yang benar, lalu ulangi. Jangan menulis ulang seluruh file kecuali langkahnya memang berbunyi "file baru".

---

## 1. Peta file

| Langkah | File | Aksi |
|---|---|---|
| 18.0 | (tidak ada file) | hanya mencatat kondisi awal |
| 18.1 | `src/lib/finance/ap-ar-hist-plan.ts` | ➕ baru |
| 18.2 | `src/lib/finance/ap-ar-hist-plan.test.ts` | ➕ baru |
| 18.3 | `src/server/dash/schema.ts` | ✏️ tambah 3 tabel |
| 18.3 | `src/server/dash/tables.ts` | ✏️ tambah 3 nama tabel |
| 18.3 | `drizzle-dash/0004_create_ap_ar_hist.sql` + `drizzle-dash/meta/*` | ➕ dihasilkan otomatis oleh `npm run db:dash:generate` |
| 18.4 | `src/server/env.ts` | ✏️ tambah satu variabel |
| 18.4 | `.env.example` | ✏️ tambah dua baris |
| 18.5 | `src/server/dash/refresh-ap-ar.ts` | ✏️ tambah kata `export` pada 5 baris |
| 18.6 | `src/server/dash/hist-ap-ar.ts` | ➕ baru (pembangun) |
| 18.7 | `src/server/dash/snapshot.ts` | ✏️ satu baris (`export function byLocation`) |
| 18.7 | `src/server/dash/snapshot-hist.ts` | ➕ baru (pembaca) |
| 18.8 | `src/server/repo/apar.repo.ts` | ✏️ satu import dan dua baris pemilih sumber |
| 18.9 | `src/server/services/ap-aging.service.ts` | ✏️ satu import, satu komentar, satu kondisi |
| 18.9 | `src/server/services/ar-aging.service.ts` | ✏️ satu import, satu komentar, satu kondisi |
| 18.10 | `src/server/dash/scheduler.ts` | ✏️ import, konstanta, satu blok di `tick` |
| 18.11 | `scripts/dash-refresh-hist.ts` | ➕ baru |
| 18.11 | `package.json` | ✏️ tambah satu script |
| 18.12 | `tests/integration/snapshot-hist.int.test.ts` | ➕ baru (dijalankan oleh user) |
| 18.13 | `CLAUDE.md` | ✏️ dua baris |
| 18.13 | `docs/progress.md` | ✏️ tambah satu baris di tabel |

File lain **tidak** diubah. Halaman dan komponen UI tidak perlu diubah: bentuk data yang dikembalikan `apOpenInvoices`, `arOpenInvoices`, dan fungsi sejenisnya tetap sama.

---

## Langkah 18.0 — Catat kondisi awal

Jalankan, satu per satu, **sebelum mengubah apa pun**:

```bash
npm run typecheck
```

```bash
npm test
```

Catat dua angka dari baris `Test Files` dan `Tests` pada output `npm test`: sebut **F** (jumlah file test) dan **N** (jumlah test). Angka ini dipakai di Langkah 18.13. Jangan memakai angka dari dokumen lain, karena jumlah test bisa berubah oleh pekerjaan lain di repo.

Jalankan juga:

```bash
git status --short
```

Catat file yang **sudah** berstatus modified atau untracked sebelum Anda mulai. Itu bukan pekerjaan Anda: jangan diubah, jangan di-revert, dan jangan ikut dilaporkan sebagai hasil fase ini.

✅ Cek selesai:
- `npm run typecheck` tanpa error dan `npm test` semua lulus. Jika sudah gagal sebelum Anda mengubah apa pun, **berhenti** dan lapor ke user.

---

## Langkah 18.1 — Perencana bulan (kode murni, tanpa DB)

📁 File: ➕ `src/lib/finance/ap-ar-hist-plan.ts`

Buat file baru dengan isi **persis** berikut:

```ts
import { addDays } from '~/lib/format/date'
import type { IsoDate } from './types'

/** The newest month-ends can still change (late entries), so they are rebuilt until they are final. */
export const PROVISIONAL_MONTHS = 2
/** A provisional snapshot that is at least this old (in hours) is rebuilt. */
export const PROVISIONAL_MAX_AGE_HOURS = 24

/**
 * Last day of each of the `count` most recent COMPLETED months before `today`, newest first.
 * The month that `today` is in is not completed, so it is never included.
 * Example: today 2026-10-29 and count 3 give ['2026-09-30', '2026-08-31', '2026-07-31'].
 */
export function monthEndsBefore(today: IsoDate, count: number): IsoDate[] {
  const out: IsoDate[] = []
  let monthStart: IsoDate = `${today.slice(0, 7)}-01`
  for (let i = 0; i < count; i += 1) {
    const end = addDays(monthStart, -1)
    out.push(end)
    monthStart = `${end.slice(0, 7)}-01`
  }
  return out
}

/**
 * True when a month-end can no longer change: it is older than the provisional months, or its ERP period is Closed.
 * `index` is the position of `monthEnd` in the newest-first list from `monthEndsBefore` (0 = last month).
 */
export function isFinalMonthEnd(index: number, monthEnd: IsoDate, closedMonthEnds: ReadonlySet<IsoDate>): boolean {
  return index >= PROVISIONAL_MONTHS || closedMonthEnds.has(monthEnd)
}

export type HistBuilt = {
  asOfDate: IsoDate
  /** Whether the snapshot was built when the month was final */
  isFinal: boolean
  /** Hours since it was built */
  ageHours: number
}

export type HistPlanInput = {
  today: IsoDate
  /** How many completed months to keep (0 = no history) */
  months: number
  /** Month-ends whose ERP period (type 0) has status Closed */
  closedMonthEnds: ReadonlySet<IsoDate>
  /** What is in the history tables now */
  built: readonly HistBuilt[]
  /** At most this many month-ends are returned in `build` */
  maxBuilds: number
}

export type HistPlan = {
  /** Month-ends to build now: missing ones first (newest first), then outdated provisional ones */
  build: IsoDate[]
  /** Built month-ends that are no longer wanted (older than `months`, or history is switched off) */
  prune: IsoDate[]
}

export function planHistBuilds(input: HistPlanInput): HistPlan {
  const wanted = monthEndsBefore(input.today, input.months)
  const builtBy = new Map(input.built.map((b) => [b.asOfDate, b] as const))

  const missing: IsoDate[] = []
  const outdated: IsoDate[] = []
  wanted.forEach((monthEnd, index) => {
    const existing = builtBy.get(monthEnd)
    if (!existing) {
      missing.push(monthEnd)
      return
    }
    if (existing.isFinal) return
    if (isFinalMonthEnd(index, monthEnd, input.closedMonthEnds) || existing.ageHours >= PROVISIONAL_MAX_AGE_HOURS) {
      outdated.push(monthEnd)
    }
  })

  const wantedSet = new Set(wanted)
  return {
    build: [...missing, ...outdated].slice(0, Math.max(0, input.maxBuilds)),
    prune: input.built.map((b) => b.asOfDate).filter((d) => !wantedSet.has(d)),
  }
}
```

Penjelasan singkat untuk pelaksana:
- File ini **tidak boleh** mengimpor apa pun dari `~/server/...`, React, atau Drizzle. Ia hanya memakai `addDays` yang sudah ada.
- `IsoDate` adalah alias `string` (format `YYYY-MM-DD`) dari `src/lib/finance/types.ts`.

✅ Cek selesai: file ada. (Typecheck dijalankan setelah Langkah 18.2.)

## Langkah 18.2 — Test untuk perencana

📁 File: ➕ `src/lib/finance/ap-ar-hist-plan.test.ts`

Buat file baru dengan isi **persis** berikut (14 test):

```ts
import { describe, expect, it } from 'vitest'
import { isFinalMonthEnd, monthEndsBefore, planHistBuilds, type HistBuilt } from './ap-ar-hist-plan'

const TODAY = '2026-10-29'
const NONE = new Set<string>()

const final = (asOfDate: string): HistBuilt => ({ asOfDate, isFinal: true, ageHours: 500 })
const provisional = (asOfDate: string, ageHours: number): HistBuilt => ({ asOfDate, isFinal: false, ageHours })

describe('monthEndsBefore', () => {
  it('lists completed month-ends, newest first', () => {
    expect(monthEndsBefore(TODAY, 3)).toEqual(['2026-09-30', '2026-08-31', '2026-07-31'])
  })

  it('crosses a year boundary', () => {
    expect(monthEndsBefore('2026-01-15', 2)).toEqual(['2025-12-31', '2025-11-30'])
  })

  it('knows leap years', () => {
    expect(monthEndsBefore('2024-03-10', 2)).toEqual(['2024-02-29', '2024-01-31'])
  })

  it('returns nothing for a count of 0', () => {
    expect(monthEndsBefore(TODAY, 0)).toEqual([])
  })
})

describe('isFinalMonthEnd', () => {
  it('keeps the two newest months provisional unless their period is closed', () => {
    expect(isFinalMonthEnd(0, '2026-09-30', NONE)).toBe(false)
    expect(isFinalMonthEnd(1, '2026-08-31', NONE)).toBe(false)
    expect(isFinalMonthEnd(0, '2026-09-30', new Set(['2026-09-30']))).toBe(true)
    expect(isFinalMonthEnd(2, '2026-07-31', NONE)).toBe(true)
  })
})

describe('planHistBuilds', () => {
  it('builds missing month-ends newest first, limited by maxBuilds', () => {
    const plan = planHistBuilds({ today: TODAY, months: 4, closedMonthEnds: NONE, built: [], maxBuilds: 2 })
    expect(plan.build).toEqual(['2026-09-30', '2026-08-31'])
    expect(plan.prune).toEqual([])
  })

  it('skips snapshots that are already final', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), final('2026-07-31')]
    const plan = planHistBuilds({ today: TODAY, months: 3, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan).toEqual({ build: [], prune: [] })
  })

  it('does not rebuild a fresh provisional snapshot', () => {
    const built = [provisional('2026-09-30', 1), provisional('2026-08-31', 5), final('2026-07-31')]
    const plan = planHistBuilds({ today: TODAY, months: 3, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan.build).toEqual([])
  })

  it('rebuilds a provisional snapshot that is a day old', () => {
    const built = [provisional('2026-09-30', 24), provisional('2026-08-31', 5), final('2026-07-31')]
    const plan = planHistBuilds({ today: TODAY, months: 3, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan.build).toEqual(['2026-09-30'])
  })

  it('rebuilds a provisional snapshot once its period is closed', () => {
    const built = [provisional('2026-09-30', 1), final('2026-08-31'), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: new Set(['2026-09-30']),
      built,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-09-30'])
  })

  it('rebuilds a provisional snapshot that has aged out of the newest months', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), provisional('2026-07-31', 1)]
    const plan = planHistBuilds({ today: TODAY, months: 3, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan.build).toEqual(['2026-07-31'])
  })

  it('builds missing months before rebuilding outdated ones', () => {
    const built = [provisional('2026-09-30', 30), final('2026-08-31')]
    const plan = planHistBuilds({ today: TODAY, months: 3, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan.build).toEqual(['2026-07-31', '2026-09-30'])
  })

  it('prunes snapshots outside the kept months', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), final('2025-01-31')]
    const plan = planHistBuilds({ today: TODAY, months: 2, closedMonthEnds: NONE, built, maxBuilds: 10 })
    expect(plan).toEqual({ build: [], prune: ['2025-01-31'] })
  })

  it('removes everything when no history is wanted', () => {
    const plan = planHistBuilds({ today: TODAY, months: 0, closedMonthEnds: NONE, built: [final('2026-09-30')], maxBuilds: 10 })
    expect(plan).toEqual({ build: [], prune: ['2026-09-30'] })
  })
})
```

Jalankan:

```bash
npx vitest run --project unit src/lib/finance/ap-ar-hist-plan.test.ts
```

✅ Cek selesai:
- 14 test lulus. Jika ada yang gagal, perbaiki **kode di Langkah 18.1 hanya bila memang salah ketik**; jangan mengubah isi test supaya lulus. Bila ragu, berhenti dan lapor ke user.
- `npm run typecheck` tanpa error.

---

## Langkah 18.3 — Tabel baru dan migrasinya

### 18.3a — `schema.ts`

📁 File: ✏️ `src/server/dash/schema.ts`

Gunakan Edit. `old_string` (satu baris, salin persis):

```
/** Payments / credit notes that are not allocated to any invoice. */
```

`new_string` (blok baru, baris kosong, lalu baris lama itu di paling bawah):

```ts
/**
 * Open AP (module 0) and AR (module 1) invoices at the END OF A PAST MONTH. Same columns as `dash_snap_ap_ar_open`,
 * plus the day the rows describe. Built by the background job (hist-ap-ar.ts), one month at a time.
 */
export const dashSnapApArHistOpen = mysqlTable(
  'dash_snap_ap_ar_hist_open',
  {
    asOfDate: date('as_of_date', { mode: 'string' }).notNull(),
    cardId: bigint('card_id', { mode: 'string' }).notNull(),
    moduleType: tinyint('module_type').notNull(),
    partyId: bigint('party_id', { mode: 'string' }),
    locationId: bigint('location_id', { mode: 'string' }),
    coaId: bigint('coa_id', { mode: 'string' }),
    txDate: date('tx_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    itemType: int('item_type').notNull().default(0),
    invoiceNumber: varchar('invoice_number', { length: 120 }).notNull().default(''),
    originalAmount: decimal('original_amount', { precision: 22, scale: 2 }).notNull().default('0.00'),
    balance: decimal('balance', { precision: 22, scale: 2 }).notNull().default('0.00'),
  },
  (t) => [
    primaryKey({ columns: [t.asOfDate, t.cardId] }),
    index('idx_dash_hist_open_date_mod').on(t.asOfDate, t.moduleType),
  ],
)

/** Payments / credit notes without any allocation at the end of a past month (same columns as the live table + `as_of_date`). */
export const dashSnapApArHistUnallocated = mysqlTable(
  'dash_snap_ap_ar_hist_unallocated',
  {
    asOfDate: date('as_of_date', { mode: 'string' }).notNull(),
    cardId: bigint('card_id', { mode: 'string' }).notNull(),
    moduleType: tinyint('module_type').notNull(),
    partyId: bigint('party_id', { mode: 'string' }),
    locationId: bigint('location_id', { mode: 'string' }),
    coaId: bigint('coa_id', { mode: 'string' }),
    txDate: date('tx_date', { mode: 'string' }).notNull(),
    balance: decimal('balance', { precision: 22, scale: 2 }).notNull().default('0.00'),
  },
  (t) => [
    primaryKey({ columns: [t.asOfDate, t.cardId] }),
    index('idx_dash_hist_unalloc_date_mod').on(t.asOfDate, t.moduleType),
  ],
)

/** Which month-ends are fully present in the two history tables (a month is added in one transaction with its rows). */
export const dashSnapApArHistDates = mysqlTable('dash_snap_ap_ar_hist_dates', {
  asOfDate: date('as_of_date', { mode: 'string' }).notNull().primaryKey(),
  builtAt: datetime('built_at', { mode: 'string' }),
  rowCount: int('row_count').default(0),
  durationMs: int('duration_ms').default(0),
  /** 1 = built when the month could no longer change; 0 = provisional, rebuilt later (see ap-ar-hist-plan.ts) */
  isFinal: tinyint('is_final').notNull().default(0),
})

/** Payments / credit notes that are not allocated to any invoice. */
```

(Semua fungsi yang dipakai — `date`, `datetime`, `decimal`, `index`, `int`, `mysqlTable`, `primaryKey`, `tinyint`, `varchar`, `bigint` — sudah diimpor di bagian atas file. Jangan menambah import.)

### 18.3b — `tables.ts`

📁 File: ✏️ `src/server/dash/tables.ts`

Edit. `old_string` (satu baris, persis, termasuk dua spasi di depan):

```
  glPeriods: 'dash_snap_gl_periods',
```

`new_string`:

```
  glPeriods: 'dash_snap_gl_periods',
  apArHistOpen: 'dash_snap_ap_ar_hist_open',
  apArHistUnallocated: 'dash_snap_ap_ar_hist_unallocated',
  apArHistDates: 'dash_snap_ap_ar_hist_dates',
```

### 18.3c — Hasilkan file migrasi (tidak menyentuh database)

Jalankan:

```bash
npm run db:dash:generate -- --name create_ap_ar_hist
```

Perintah ini hanya menulis file SQL; ia **tidak** terhubung ke database. Hasil yang diharapkan: file baru `drizzle-dash/0004_create_ap_ar_hist.sql`, `drizzle-dash/meta/0004_snapshot.json`, dan `drizzle-dash/meta/_journal.json` bertambah satu entri bertag `0004_create_ap_ar_hist`.

Buka `drizzle-dash/0004_create_ap_ar_hist.sql` dengan Read dan periksa:
- Isinya **hanya** tiga perintah `CREATE TABLE`, masing-masing untuk `dash_snap_ap_ar_hist_dates`, `dash_snap_ap_ar_hist_open`, dan `dash_snap_ap_ar_hist_unallocated`, ditambah dua perintah `CREATE INDEX` (`idx_dash_hist_open_date_mod` dan `idx_dash_hist_unalloc_date_mod`).
- Tidak ada `DROP`, `ALTER`, atau nama tabel tanpa awalan `dash_`.

Jika drizzle-kit menghasilkan nama file lain (misalnya tidak berawalan `0004_`), jangan diubah namanya; cukup pastikan isinya benar. Jika isinya menyentuh tabel lain, **berhenti** dan lapor ke user.

Jalankan:

```bash
npm run db:dash:check
```

✅ Cek selesai:
- `npm run db:dash:check` tanpa error.
- `npm run typecheck` tanpa error.
- **Jangan** menjalankan `npm run db:dash:migrate`. Itu dikerjakan user (bagian 2).

---

## Langkah 18.4 — Variabel lingkungan `DASH_AP_AR_HIST_MONTHS`

### 18.4a — `env.ts`

📁 File: ✏️ `src/server/env.ts`

Edit. `old_string` (satu baris, persis):

```
  DASH_REFRESH_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
```

`new_string`:

```
  DASH_REFRESH_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  // How many completed month-ends of AP/AR history to keep (0 = none; the history tables are emptied).
  DASH_AP_AR_HIST_MONTHS: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(36).default(13)),
```

(`z.preprocess` dipakai supaya nilai kosong di `.env` menjadi 13, bukan 0.)

### 18.4b — `.env.example`

📁 File: ✏️ `.env.example`

Edit. `old_string` (satu baris, persis):

```
DASH_REFRESH_MINUTES=10
```

`new_string`:

```
DASH_REFRESH_MINUTES=10
# Completed month-ends of AP/AR history kept in dash_snap_ap_ar_hist_* (0 = off). Makes "Last month" and the comparison figures fast.
DASH_AP_AR_HIST_MONTHS=13
```

✅ Cek selesai: `npm run typecheck` tanpa error. **Jangan** membuka atau mengubah file `.env` yang asli.

---

## Langkah 18.5 — Ekspor pemuat dari `refresh-ap-ar.ts`

📁 File: ✏️ `src/server/dash/refresh-ap-ar.ts`

Lakukan **lima** Edit satu baris. Isi fungsi **tidak boleh** diubah; hanya kata `export` yang ditambahkan.

| # | `old_string` (satu baris, persis) | `new_string` |
|---|---|---|
| 1 | `type Row = unknown[]` | `export type Row = unknown[]` |
| 2 | `const OPEN_COLUMNS = [` | `export const OPEN_COLUMNS = [` |
| 3 | `const UNALLOC_COLUMNS = ['card_id', 'module_type', 'party_id', 'location_id', 'coa_id', 'tx_date', 'balance']` | `export const UNALLOC_COLUMNS = ['card_id', 'module_type', 'party_id', 'location_id', 'coa_id', 'tx_date', 'balance']` |
| 4 | `async function loadOpenInvoices(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {` | `export async function loadOpenInvoices(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {` |
| 5 | `async function loadUnallocated(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {` | `export async function loadUnallocated(conn: PoolConnection, side: AgingSide, asOfPlusOne: string): Promise<Row[]> {` |

✅ Cek selesai: `npm run typecheck` tanpa error.

---

## Langkah 18.6 — Pembangun snapshot akhir bulan

📁 File: ➕ `src/server/dash/hist-ap-ar.ts`

Buat file baru dengan isi **persis** berikut. (Ingat jebakan `guard.test.ts` di bagian 0: jangan menambah komentar yang memuat kata "update", "delete from", "insert into", dan sejenisnya.)

```ts
import '@tanstack/react-start/server-only'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '~/server/db/client'
import { env } from '~/server/env'
import { chunk } from '~/server/db/chunk'
import { addDays } from '~/lib/format/date'
import { isFinalMonthEnd, monthEndsBefore, planHistBuilds, type HistBuilt } from '~/lib/finance/ap-ar-hist-plan'
import type { IsoDate } from '~/lib/finance/types'
import { listPeriods } from '~/server/repo/periods.repo'
import { DASH_TABLES, dashTable } from './tables'
import { OPEN_COLUMNS, UNALLOC_COLUMNS, loadOpenInvoices, loadUnallocated, type Row } from './refresh-ap-ar'

const LOCK_NAME = 'dash_refresh_ap_ar_hist'

export type HistRefreshResult =
  | { ran: true; built: IsoDate[]; pruned: number; durationMs: number }
  | { ran: false; reason: 'locked' | 'nothing-to-do' }

type BuiltRow = { asOfDate: string; isFinal: number | string; ageHours: number | string | null }

/**
 * Keeps the month-end AP/AR history up to date: builds missing month-ends (and provisional ones that are outdated),
 * and removes month-ends that are no longer wanted. `maxBuilds` limits how many months one call builds.
 * One run at a time (advisory lock). A failed month leaves the other months untouched.
 */
export async function refreshApArHistSnapshots(today: IsoDate, options: { maxBuilds?: number } = {}): Promise<HistRefreshResult> {
  const started = Date.now()
  const conn = await pool.getConnection()
  let locked = false
  try {
    // Long scans are expected here; the per-connection limit meant for report queries does not apply.
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
    await conn.query('SET SESSION max_statement_time = 0').catch(() => {})

    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME])
    locked = Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
    if (!locked) return { ran: false, reason: 'locked' }

    const months = env.DASH_AP_AR_HIST_MONTHS
    const periods = await listPeriods()
    const closedMonthEnds = new Set(periods.filter((p) => p.type === 0 && p.status === 'Closed').map((p) => p.endDate))

    const [builtRows] = await conn.query(
      `SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate, is_final AS isFinal,
              TIMESTAMPDIFF(HOUR, built_at, UTC_TIMESTAMP()) AS ageHours
       FROM ??`,
      [dashTable(DASH_TABLES.apArHistDates)],
    )
    const built: HistBuilt[] = (builtRows as BuiltRow[]).map((r) => ({
      asOfDate: String(r.asOfDate),
      isFinal: Number(r.isFinal) === 1,
      ageHours: r.ageHours === null ? Number.POSITIVE_INFINITY : Number(r.ageHours),
    }))

    const plan = planHistBuilds({
      today,
      months,
      closedMonthEnds,
      built,
      maxBuilds: options.maxBuilds ?? Number.POSITIVE_INFINITY,
    })
    if (plan.build.length === 0 && plan.prune.length === 0) return { ran: false, reason: 'nothing-to-do' }

    for (const asOfDate of plan.prune) await removeMonth(conn, asOfDate)

    const wanted = monthEndsBefore(today, months)
    for (const [index, asOfDate] of plan.build.entries()) {
      const t0 = Date.now()
      const isFinal = isFinalMonthEnd(wanted.indexOf(asOfDate), asOfDate, closedMonthEnds)
      const rowCount = await buildMonth(conn, asOfDate, isFinal)
      console.log(`dash: AP/AR history ${index + 1}/${plan.build.length}: ${asOfDate} (${rowCount} rows, ${Math.round((Date.now() - t0) / 1000)}s)`)
    }

    return { ran: true, built: plan.build, pruned: plan.prune.length, durationMs: Date.now() - started }
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {})
    conn.release()
  }
}

/** Removes one month-end from the three history tables (one transaction). */
async function removeMonth(conn: PoolConnection, asOfDate: IsoDate): Promise<void> {
  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistOpen), asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistUnallocated), asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [dashTable(DASH_TABLES.apArHistDates), asOfDate])
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}

/**
 * Builds one month-end. The rows are read first (long, no transaction); then the rows and the "built" marker are
 * written in one transaction, so readers never see half a month. Returns the number of rows written.
 */
async function buildMonth(conn: PoolConnection, asOfDate: IsoDate, isFinal: boolean): Promise<number> {
  const started = Date.now()
  const asOfPlusOne = addDays(asOfDate, 1)

  // concat, not push(...rows): spreading ~160k rows as arguments overflows the call stack
  let openRows: Row[] = []
  let unallocRows: Row[] = []
  for (const side of ['ap', 'ar'] as const) {
    openRows = openRows.concat(await loadOpenInvoices(conn, side, asOfPlusOne))
    unallocRows = unallocRows.concat(await loadUnallocated(conn, side, asOfPlusOne))
  }
  const withDate = (list: Row[]): Row[] => list.map((r) => [asOfDate, ...r])

  const open = dashTable(DASH_TABLES.apArHistOpen)
  const unallocated = dashTable(DASH_TABLES.apArHistUnallocated)
  const dates = dashTable(DASH_TABLES.apArHistDates)
  const rowCount = openRows.length + unallocRows.length

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [open, asOfDate])
    await conn.query('DELETE FROM ?? WHERE as_of_date = ?', [unallocated, asOfDate])
    for (const batch of chunk(withDate(openRows), 1000)) {
      await conn.query('INSERT INTO ?? (??) VALUES ?', [open, ['as_of_date', ...OPEN_COLUMNS], batch])
    }
    for (const batch of chunk(withDate(unallocRows), 1000)) {
      await conn.query('INSERT INTO ?? (??) VALUES ?', [unallocated, ['as_of_date', ...UNALLOC_COLUMNS], batch])
    }
    await conn.query(
      `INSERT INTO ?? (as_of_date, built_at, row_count, duration_ms, is_final) VALUES (?, UTC_TIMESTAMP(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms), is_final = VALUES(is_final)`,
      [dates, asOfDate, rowCount, Date.now() - started, isFinal ? 1 : 0],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
  return rowCount
}
```

Penjelasan singkat untuk pelaksana:
- `listPeriods()` ada di `src/server/repo/periods.repo.ts` dan mengembalikan `Period[]` (`type`, `status`, `endDate`). Hanya periode reguler (`type === 0`) yang berstatus `Closed` yang dihitung sebagai "periode sudah ditutup".
- Struktur ini sengaja meniru `refreshGlMonthlySnapshot` di `gl-snapshot.ts` (kunci advisory, transaksi per unit kerja).
- Kata `UPDATE` hanya muncul dalam `ON DUPLICATE KEY UPDATE`, yang dikecualikan `guard.test.ts`. Jangan menambah kata itu di tempat lain.

Jalankan:

```bash
npm run typecheck
```

```bash
npx vitest run --project unit src/server/dash/guard.test.ts
```

✅ Cek selesai:
- Typecheck tanpa error.
- `guard.test.ts` lulus (ia sekarang ikut memindai file baru ini). Jika gagal, baca pesan: ia menyebut nama file dan kata yang dianggap menulis ke tabel non-`dash_`; hapus kata itu dari komentar.

---

## Langkah 18.7 — Pembaca snapshot akhir bulan

### 18.7a — ekspor `byLocation`

📁 File: ✏️ `src/server/dash/snapshot.ts`

Edit satu baris. `old_string` (persis):

```
function byLocation<T extends { locationId: Id }>(all: readonly T[], locIds: Id[] | 'all'): T[] {
```

`new_string`:

```
export function byLocation<T extends { locationId: Id }>(all: readonly T[], locIds: Id[] | 'all'): T[] {
```

### 18.7b — file pembaca

📁 File: ➕ `src/server/dash/snapshot-hist.ts`

Buat file baru dengan isi **persis** berikut:

```ts
import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { memo } from '~/server/cache'
import type { Id, IsoDate } from '~/lib/finance/types'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/apar.repo'
import { byLocation } from './snapshot'
import { DASH_TABLES } from './tables'

const DATES_TTL_MS = 15_000
/** Month-end data never changes between rebuilds; the key carries the build time, and the memo is bounded anyway. */
const HIST_MEMO_TTL_MS = 30 * 60 * 1000

/**
 * Month-ends present in the history tables (day -> when it was built, ISO UTC).
 * Empty when the tables do not exist yet (migration not applied). The returned Map is shared: never change it.
 */
export async function apArHistDates(): Promise<Map<IsoDate, string>> {
  return memo('dash:ap-ar:hist:dates', DATES_TTL_MS, async () => {
    try {
      const res = await rows<{ asOfDate: string; builtAt: string }>(sql`
        SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
               DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt
        FROM ${sql.identifier(DASH_TABLES.apArHistDates)}
      `)
      return new Map<IsoDate, string>(res.map((r) => [String(r.asOfDate), String(r.builtAt)] as const))
    } catch {
      return new Map<IsoDate, string>()
    }
  })
}

/** True when `asOf` is a month-end that the history holds completely. */
export async function apArHistCovers(asOf: IsoDate): Promise<boolean> {
  return (await apArHistDates()).has(asOf)
}

async function readHistOpen<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    dueDate: string | null
    itemType: number | string
    invoiceNumber: string | null
    originalAmount: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
           invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistOpen)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        invoiceId: String(r.cardId),
        invoiceNumber: r.invoiceNumber ?? '',
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        itemType: Number(r.itemType) || 0,
        // DECIMAL(22,2) columns already come back as 2-decimal strings
        originalAmount: r.originalAmount,
        balance: r.balance,
      }) as Row,
  )
}

async function readHistUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistUnallocated)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        cardId: String(r.cardId),
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        balance: r.balance,
      }) as Row,
  )
}

/** Open invoices of one side at the end of the month `asOf` (call `apArHistCovers(asOf)` first). */
export async function histOpenInvoices<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const builtAt = (await apArHistDates()).get(asOf)
  if (!builtAt) throw new Error(`No AP/AR history for ${asOf}`)
  const all = await memo(`dash:ap-ar:hist:open:${side}:${partyKey}:${asOf}:${builtAt}`, HIST_MEMO_TTL_MS, () =>
    readHistOpen(side, asOf, partyKey),
  )
  return byLocation(all, locIds)
}

/** Unallocated payments / credit notes of one side at the end of the month `asOf` (call `apArHistCovers(asOf)` first). */
export async function histUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const builtAt = (await apArHistDates()).get(asOf)
  if (!builtAt) throw new Error(`No AP/AR history for ${asOf}`)
  const all = await memo(`dash:ap-ar:hist:unalloc:${side}:${partyKey}:${asOf}:${builtAt}`, HIST_MEMO_TTL_MS, () =>
    readHistUnallocated(side, asOf, partyKey),
  )
  return byLocation(all, locIds)
}
```

Penjelasan singkat untuk pelaksana:
- Pemetaan baris sengaja **sama** dengan `readOpenInvoices` dan `readUnallocated` di `snapshot.ts` (hanya tabel dan filter `as_of_date` yang berbeda), supaya bentuk hasilnya identik. Itu alasan ada pengulangan; jangan "merapikannya" dengan mengubah `snapshot.ts` lebih jauh.
- Semua kunci cache berawalan `dash:ap-ar:hist:`. Scheduler akan memanggil `clearCache('dash:ap-ar:hist')` setelah membangun bulan baru (Langkah 18.10).
- Memo sudah dibatasi (`MEMO_MAX_WEIGHT` di `src/server/cache.ts`), jadi membuka banyak bulan tidak menghabiskan memori.
- Tidak ada impor runtime dari `apar.repo.ts` (hanya `import type`), jadi tidak ada impor melingkar.

✅ Cek selesai: `npm run typecheck` tanpa error.

---

## Langkah 18.8 — Pemilih sumber data di `apar.repo.ts`

📁 File: ✏️ `src/server/repo/apar.repo.ts`

Lakukan **tiga** Edit satu baris.

**Edit 1 — import.** `old_string` (persis):

```
import { apArSnapshotCovers, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
```

`new_string`:

```
import { apArSnapshotCovers, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
import { apArHistCovers, histOpenInvoices, histUnallocated } from '~/server/dash/snapshot-hist'
```

**Edit 2 — tagihan terbuka.** `old_string` (persis, termasuk dua spasi di depan):

```
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotOpenInvoices(side, locIds, partyKey)
```

`new_string`:

```
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotOpenInvoices(side, locIds, partyKey)
  // A past month-end that the background job has already built
  if (await apArHistCovers(addDays(asOfPlusOne, -1))) return histOpenInvoices(side, addDays(asOfPlusOne, -1), locIds, partyKey)
```

**Edit 3 — pembayaran belum dialokasikan.** `old_string` (persis, termasuk dua spasi di depan):

```
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotUnallocated(side, locIds, partyKey)
```

`new_string`:

```
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotUnallocated(side, locIds, partyKey)
  if (await apArHistCovers(addDays(asOfPlusOne, -1))) return histUnallocated(side, addDays(asOfPlusOne, -1), locIds, partyKey)
```

Urutan pemeriksaan **harus** begini: snapshot hari ini dulu, snapshot akhir bulan kedua, query langsung ke ERP terakhir. Jangan menukar urutan.

✅ Cek selesai: `npm run typecheck` tanpa error.

---

## Langkah 18.9 — Angka pembanding AP dan AR

Dua file, perubahan identik. Kerjakan satu per satu.

### 18.9a — `ap-aging.service.ts`

📁 File: ✏️ `src/server/services/ap-aging.service.ts`

**Edit 1 — import.** `old_string` (persis):

```
import { apArSnapshotCovers, apArSnapshotInfo, memoBySnapshot } from '~/server/dash/snapshot'
```

`new_string`:

```
import { apArSnapshotCovers, apArSnapshotInfo, memoBySnapshot } from '~/server/dash/snapshot'
import { apArHistCovers } from '~/server/dash/snapshot-hist'
```

**Edit 2 — komentar.** `old_string` (persis, termasuk dua spasi di depan):

```
  // Past dates are not in the snapshot (until month-end snapshots exist); computing them from the ERP tables
```

`new_string`:

```
  // A past date is answered from the month-end history when that month has been built; otherwise computing it from the ERP tables
```

**Edit 3 — kondisi.** `old_string` (persis, termasuk dua spasi di depan):

```
  if ((await apArSnapshotInfo()) && !(await apArSnapshotCovers(filter.compare.asOf))) return null
```

`new_string`:

```
  if ((await apArSnapshotInfo()) && !(await apArSnapshotCovers(filter.compare.asOf)) && !(await apArHistCovers(filter.compare.asOf))) return null
```

Baris komentar sesudahnya (`// takes minutes, so the comparison is left out instead of blocking the page.`) **dibiarkan**.

### 18.9b — `ar-aging.service.ts`

📁 File: ✏️ `src/server/services/ar-aging.service.ts`

Tiga Edit yang **sama persis** dengan 18.9a (teks `old_string` dan `new_string` identik; file ini juga memuat ketiga baris tersebut tepat satu kali).

✅ Cek selesai:
- `npm run typecheck` tanpa error.
- Jalankan `npm test`: semua test lulus (jumlah test sudah bertambah 14 dari Langkah 18.2).

---

## Langkah 18.10 — Scheduler membangun satu bulan per putaran

📁 File: ✏️ `src/server/dash/scheduler.ts`

Lakukan **tiga** Edit.

**Edit 1 — import.** `old_string` (satu baris, persis):

```
import { refreshGlMonthlySnapshot } from './gl-snapshot'
```

`new_string`:

```
import { refreshGlMonthlySnapshot } from './gl-snapshot'
import { refreshApArHistSnapshots } from './hist-ap-ar'
import { clearCache } from '~/server/cache'
```

**Edit 2 — konstanta.** `old_string` (satu baris, persis):

```
function today(): string {
```

`new_string`:

```
/** Month-end AP/AR history: months built per run, so the regular refresh is never held up for long. */
const HIST_MAX_BUILDS_PER_TICK = 1

function today(): string {
```

**Edit 3 — blok di `tick`.** `old_string` (satu baris, persis, termasuk empat spasi di depan):

```
    if (result.ran) {
```

`new_string` (blok baru, lalu baris lama di paling bawah):

```
    // Month-end AP/AR history: one month per run (the first fill takes a few runs; `npm run dash:refresh-hist` does it at once)
    const hist = await refreshApArHistSnapshots(today(), { maxBuilds: HIST_MAX_BUILDS_PER_TICK })
    if (hist.ran) {
      clearCache('dash:ap-ar:hist')
      console.log(`dash: AP/AR history built ${hist.built.length} month(s), removed ${hist.pruned} in ${Math.round(hist.durationMs / 1000)}s`)
    }
    if (result.ran) {
```

✅ Cek selesai:
- `npm run typecheck` tanpa error.
- `npx vitest run --project unit src/server/dash/guard.test.ts` lulus.
- Pastikan `if (result.ran) {` masih ada tepat **satu** kali di file (Read file `scheduler.ts` dan lihat bahwa blok baru berada di dalam `try { ... }` pada fungsi `tick`, sesudah baris `if (gl.ran) console.log(...)`).

---

## Langkah 18.11 — Skrip pengisian manual

### 18.11a — skrip

📁 File: ➕ `scripts/dash-refresh-hist.ts`

Buat file baru dengan isi **persis** berikut (nama file harus diawali `dash-` agar ikut dipindai `guard.test.ts`):

```ts
/**
 * npm run dash:refresh-hist              build every missing month-end of AP/AR history now
 * npm run dash:refresh-hist -- --max 2   build at most 2 months
 */
import { env } from '../src/server/env'
import { todayIn } from '../src/lib/format/date'
import { refreshApArHistSnapshots } from '../src/server/dash/hist-ap-ar'
import { pool } from '../src/server/db/client'

try {
  const today = env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
  const maxIndex = process.argv.indexOf('--max')
  const maxBuilds = maxIndex >= 0 ? Number(process.argv[maxIndex + 1]) : Number.POSITIVE_INFINITY
  if (!(maxBuilds >= 1)) throw new Error('--max needs a number of 1 or more')

  console.log(`Building the AP/AR month-end history as of ${today} (${env.DASH_AP_AR_HIST_MONTHS} months kept) ...`)
  const result = await refreshApArHistSnapshots(today, { maxBuilds })
  console.log(
    result.ran
      ? `Done in ${Math.round(result.durationMs / 1000)}s: built ${result.built.length} month(s) (${result.built.join(', ') || 'none'}), removed ${result.pruned}`
      : `Nothing to do (${result.reason}).`,
  )
  await pool.end()
} catch (error) {
  console.error('AP/AR history failed:', error instanceof Error ? error.message : error)
  await pool.end().catch(() => {})
  process.exit(1)
}
```

### 18.11b — script npm

📁 File: ✏️ `package.json`

Edit satu baris. `old_string` (persis, termasuk dua spasi di depan dan koma di akhir):

```
    "dash:refresh-gl": "tsx scripts/dash-refresh-gl.ts",
```

`new_string`:

```
    "dash:refresh-gl": "tsx scripts/dash-refresh-gl.ts",
    "dash:refresh-hist": "tsx scripts/dash-refresh-hist.ts",
```

(Indentasi di `package.json` adalah **dua** spasi per tingkat; baris `scripts` berada di tingkat dua, jadi empat spasi. Jika Edit gagal karena jumlah spasi, Read `package.json` dan salin baris `dash:refresh-gl` apa adanya.)

✅ Cek selesai:
- `npm run typecheck` tanpa error.
- `npx vitest run --project unit src/server/dash/guard.test.ts` lulus (ia memindai skrip baru).
- **Jangan menjalankan skripnya.** Itu menyentuh database; user yang menjalankannya.

---

## Langkah 18.12 — Test integrasi (ditulis oleh pelaksana, dijalankan oleh user)

📁 File: ➕ `tests/integration/snapshot-hist.int.test.ts`

Buat file baru dengan isi **persis** berikut:

```ts
import { describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { addDays } from '~/lib/format/date'
import { histOpenInvoices, histUnallocated } from '~/server/dash/snapshot-hist'
import { liveAgingInvoices, liveAgingUnallocated } from '~/server/repo/apar.repo'

/**
 * The month-end history must hold exactly what the live ERP query returns for the same day.
 * It uses the newest FINAL month-end in the history and is skipped when there is none
 * (run `npm run dash:refresh-hist` first). If someone back-dated entries into that month after it was built,
 * the numbers differ on purpose: rebuild the month and run the test again.
 */
const TIMEOUT = 900_000

async function newestFinalMonthEnd(): Promise<string | null> {
  const res = await rows<{ asOf: string }>(sql`
    SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOf
    FROM dash_snap_ap_ar_hist_dates WHERE is_final = 1 ORDER BY as_of_date DESC LIMIT 1
  `)
  return res[0] ? String(res[0].asOf) : null
}

function byId<T extends { invoiceId?: string; cardId?: string; balance: string }>(list: T[]): Map<string, string> {
  return new Map(list.map((r) => [(r.invoiceId ?? r.cardId) as string, r.balance]))
}

describe('AP/AR month-end history equals the live ERP query', () => {
  it('AR open invoices and unallocated receipts match exactly (all entities)', async () => {
    const asOf = await newestFinalMonthEnd()
    if (!asOf) return console.warn('skipped: no final month-end in the history (run npm run dash:refresh-hist)')
    const asOfPlusOne = addDays(asOf, 1)

    const [live, hist] = await Promise.all([
      liveAgingInvoices('ar', asOfPlusOne, 'all', 'customerId'),
      histOpenInvoices('ar', asOf, 'all', 'customerId'),
    ])
    expect(byId(hist)).toEqual(byId(live))

    const [liveU, histU] = await Promise.all([
      liveAgingUnallocated('ar', asOfPlusOne, 'all', 'customerId'),
      histUnallocated('ar', asOf, 'all', 'customerId'),
    ])
    expect(byId(histU)).toEqual(byId(liveU))
  }, TIMEOUT)

  it('AP open invoices and unallocated payments match for three real locations', async () => {
    const asOf = await newestFinalMonthEnd()
    if (!asOf) return console.warn('skipped: no final month-end in the history (run npm run dash:refresh-hist)')
    const asOfPlusOne = addDays(asOf, 1)

    // Three locations with a modest number of open bills (the full AP query takes minutes; the per-location one is fast)
    const locs = await rows<{ id: string }>(sql`
      SELECT CAST(location_id AS CHAR) AS id FROM dash_snap_ap_ar_hist_open
      WHERE as_of_date = ${asOf} AND module_type = 0 AND location_id IS NOT NULL
      GROUP BY location_id HAVING COUNT(*) BETWEEN 50 AND 3000 ORDER BY COUNT(*) DESC LIMIT 3
    `)
    expect(locs.length).toBeGreaterThan(0)
    const ids = locs.map((l) => String(l.id))

    const [live, hist] = await Promise.all([
      liveAgingInvoices('ap', asOfPlusOne, ids, 'vendorId'),
      histOpenInvoices('ap', asOf, ids, 'vendorId'),
    ])
    expect(hist.length).toBeGreaterThan(0)
    expect(byId(hist)).toEqual(byId(live))

    const [liveU, histU] = await Promise.all([
      liveAgingUnallocated('ap', asOfPlusOne, ids, 'vendorId'),
      histUnallocated('ap', asOf, ids, 'vendorId'),
    ])
    expect(byId(histU)).toEqual(byId(liveU))
  }, TIMEOUT)
})
```

✅ Cek selesai:
- `npm run typecheck` tanpa error.
- **Jangan menjalankan** test ini. File `tests/integration/**` menyentuh database (aturan proyek: tanya user dulu).

---

## Langkah 18.13 — Dokumentasi dan berhenti

### 18.13a — `CLAUDE.md`

📁 File: ✏️ `CLAUDE.md`

**Edit 1.** `old_string` (satu baris, persis):

```
npm run dash:refresh-gl    # build the monthly GL snapshot for Closed periods
```

`new_string`:

```
npm run dash:refresh-gl    # build the monthly GL snapshot for Closed periods
npm run dash:refresh-hist  # build the month-end AP/AR history (past asOf dates; --max N limits the months)
```

**Edit 2.** `old_string` (satu baris, persis):

```
- AP/AR requests for a past `asOf` still use the slow live ERP query.
```

`new_string`:

```
- `dash_snap_ap_ar_hist_*` hold the AP/AR state at the end of each of the last `DASH_AP_AR_HIST_MONTHS` (default 13) completed months, built by `hist-ap-ar.ts` (one month per scheduler run; the two newest months are rebuilt daily until final). `apar.repo.ts` reads today's snapshot first, then the month-end history when `asOf` is exactly a built month-end, then the slow live ERP query. Any other past `asOf` still uses the live query.
```

### 18.13b — `docs/progress.md`

📁 File: ✏️ `docs/progress.md`

Tabel di bagian atas file memiliki kolom `| Tanggal | Langkah | Hasil | Cek |`. Heading `## Ringkasan Proyek` ada di sekitar baris 85. Lakukan:

1. Read `docs/progress.md` baris 78–88 untuk melihat baris tabel terakhir (baris yang diawali `|`, tepat sebelum baris kosong dan heading `## Ringkasan Proyek`).
2. Gunakan Edit dengan `old_string` = **teks lengkap baris tabel terakhir itu** (satu baris, salin persis dari hasil Read) dan `new_string` = baris itu + akhir baris + baris baru berikut:

```
| 2026-10-29 | 18 | Snapshot AP/AR akhir bulan: tabel dash_snap_ap_ar_hist_open/unallocated/dates, pembangun hist-ap-ar.ts (13 bulan, satu bulan per putaran scheduler, dua bulan terbaru sementara), pembaca snapshot-hist.ts, angka pembanding AP/AR kembali tampil, skrip dash:refresh-hist; 14 unit test untuk perencana | Typecheck lulus, JUMLAH unit test lulus; migrasi, pembangunan snapshot, dan test integrasi belum dijalankan (butuh DB, dikerjakan user) |
```

Ganti kata `JUMLAH` dengan angka sebenarnya dari `npm test` (yaitu N + 14, dengan N dari Langkah 18.0). Jangan meninggalkan kata `JUMLAH` di file. Jangan menulis "lulus" bila ada yang gagal; tulis apa adanya.

### 18.13c — Pemeriksaan akhir

Jalankan, satu per satu:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run db:dash:check
```

```bash
git status --short
```

✅ Cek selesai:
- Typecheck tanpa error, semua unit test lulus (jumlah file dan jumlah test: lihat catatan jumlah di bawah), `db:dash:check` tanpa error.
- `git status --short` hanya menampilkan file yang ada di tabel peta file (bagian 1) ditambah file yang sudah berubah **sebelum** Anda mulai (Langkah 18.0). Tidak ada file lain, dan tidak ada perubahan pada `.env`.

Catatan jumlah: fase ini menambah **satu** file test unit (`ap-ar-hist-plan.test.ts`, 14 test). File `snapshot-hist.int.test.ts` berada di project `db`, bukan `unit`, sehingga **tidak** dihitung oleh `npm test`. Jadi `Test Files` menjadi F + 1 dan `Tests` menjadi N + 14.

**Setelah itu BERHENTI.** Jangan commit. Jangan menjalankan perintah database. Lapor ke user:
- file yang diubah dan dibuat (hanya yang ada di tabel peta file),
- hasil typecheck dan jumlah test (sebelum dan sesudah),
- bahwa langkah database di bagian 2 belum dilakukan.

---

## 2. Langkah database (dilakukan oleh USER, bukan oleh pelaksana)

Semua ini menyentuh database. Jalankan pada DB `demo` lokal lebih dulu, bukan pada DB klien.

1. **Terapkan migrasi** (membuat tiga tabel baru):

   ```bash
   npm run db:dash:migrate
   ```

   Periksa dengan `npm run db:dash:status`: tidak ada migrasi tertunda.

2. **Bangun satu bulan dulu** untuk melihat lama dan ukurannya (migrasi harus sudah diterapkan):

   ```bash
   npm run dash:refresh-hist -- --max 1
   ```

   Harapan: bulan lalu (akhir bulan terakhir yang sudah lewat) terbangun; log menampilkan jumlah baris dan detik. Catat angkanya. Di DB `demo`, pembacaan data satu sisi AP sudah diukur sekitar 163 ribu tagihan terbuka; lama total belum diukur.

3. **Bangun sisanya** (sekali jalan, bisa lama; boleh dibiarkan berjalan):

   ```bash
   npm run dash:refresh-hist
   ```

   Alternatif: biarkan scheduler server mengisi satu bulan per putaran (default tiap 10 menit).

4. **Jalankan test integrasi** (membandingkan snapshot dengan query langsung ERP; lambat):

   ```bash
   npx vitest run --project db tests/integration/snapshot-hist.int.test.ts
   ```

   Harapan: 2 test lulus (atau "skipped" bila belum ada bulan final di riwayat).

5. **Uji di browser** (`npm run dev`, login):
   - Pilih periode **Bulan Lalu** di Ringkasan, Payables, dan Receivables: halaman tampil tanpa error dan cepat (beberapa detik).
   - Pilih **Bulan Ini**: kartu AP/AR sekarang menampilkan angka **pembanding** (sebelumnya kosong).
   - Pilih rentang kustom yang berakhir di bulan lampau dalam 13 bulan terakhir: tampil cepat. Rentang yang berakhir lebih tua dari 13 bulan: masih lambat dan bisa menampilkan pesan error umum (sengaja, lihat bagian 0).

6. **Cek ukuran tabel** dan catat di `docs/progress.md` bila perlu:

   ```sql
   SELECT table_name, table_rows, ROUND((data_length + index_length) / 1024 / 1024) AS size_mb
   FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name LIKE 'dash_snap_ap_ar_hist%';
   ```

7. **Setelah dipakai di produksi (MySQL 5.7)**: jalankan langkah 1–5 di sana juga, karena DB lokal adalah MariaDB 10.4 dan keberhasilan lokal tidak membuktikan perilaku di 5.7.

---

## 3. Kesalahan yang sering terjadi (hindari)

| Kesalahan | Akibat | Yang benar |
|---|---|---|
| Menulis komentar berisi kata "update" atau "delete from" di `src/server/dash/*.ts` atau `scripts/dash-*.ts` | `guard.test.ts` gagal | Pakai kata lain ("change", "remove", "write") |
| Menukar urutan pemeriksaan di `apar.repo.ts` (hist sebelum snapshot hari ini) | Tanggal hari ini bisa terbaca dari riwayat yang lebih tua | Snapshot hari ini, lalu riwayat, lalu query langsung |
| Menjalankan `npm run db:dash:migrate` atau `dash:refresh-hist` sendiri | Melanggar aturan "tidak menyentuh database tanpa izin" | Biarkan user yang menjalankan |
| Mengubah isi `loadOpenInvoices` / `loadUnallocated` | Snapshot hari ini dan riwayat bisa berbeda hasilnya | Hanya tambahkan kata `export` (Langkah 18.5) |
| Memakai `Number()` atau `parseFloat()` pada uang | Melanggar aturan uang sebagai string | Tidak ada perhitungan uang baru di fase ini; nilai uang dibaca sebagai string |
| Mengubah mapping baris di `snapshot-hist.ts` | Bentuk data berbeda dari snapshot hari ini, memecahkan perhitungan aging | Pertahankan sama persis dengan `snapshot.ts` |
| Membangun bulan berjalan (bulan yang belum selesai) | Angka akhir bulan belum ada | `monthEndsBefore` memang tidak pernah menyertakannya |
| Menaikkan `HIST_MAX_BUILDS_PER_TICK` "biar cepat" | Refresh snapshot hari ini tertahan lama (satu putaran memegang `running`) | Biarkan 1; untuk isi awal pakai `npm run dash:refresh-hist` |
| Menambah string UI atau mengubah `en.json` / `id.json` | `src/i18n/keys.test.ts` bisa gagal | Tidak perlu string baru |
| Mengedit `.env` atau mencetak isinya | Melanggar aturan keamanan | Hanya `.env.example` yang boleh diubah |
| Edit multi-baris pada file CRLF gagal | Pesan "string not found" | Pakai `old_string` satu baris (lihat catatan CRLF di bagian 0) |

## 4. Cara membatalkan (rollback)

Fase ini belum di-commit saat selesai, jadi untuk membatalkan di sisi kode: kembalikan file yang diubah ke versi git dan hapus file baru. Lakukan ini hanya jika user memintanya.

```bash
git checkout -- src/server/dash/schema.ts src/server/dash/tables.ts src/server/env.ts .env.example src/server/dash/refresh-ap-ar.ts src/server/dash/snapshot.ts src/server/repo/apar.repo.ts src/server/services/ap-aging.service.ts src/server/services/ar-aging.service.ts src/server/dash/scheduler.ts package.json CLAUDE.md docs/progress.md drizzle-dash/meta/_journal.json
```

```bash
git clean -f src/lib/finance/ap-ar-hist-plan.ts src/lib/finance/ap-ar-hist-plan.test.ts src/server/dash/hist-ap-ar.ts src/server/dash/snapshot-hist.ts scripts/dash-refresh-hist.ts tests/integration/snapshot-hist.int.test.ts drizzle-dash/0004_create_ap_ar_hist.sql drizzle-dash/meta/0004_snapshot.json
```

Jika migrasi sudah diterapkan ke sebuah database, tiga tabel baru tetap ada di sana. Hanya user yang boleh menghapusnya (dengan `DROP TABLE` pada tiga tabel `dash_snap_ap_ar_hist_*` dan menghapus baris migrasi `0004` dari `dash_migrations`), dan hanya bila diminta.
