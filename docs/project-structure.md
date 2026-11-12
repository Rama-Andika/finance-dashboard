# Panduan Struktur Folder `src` — Apa Masuk ke Mana

> **Tujuan:** menjawab satu pertanyaan sebelum menulis kode: _"file ini ditaruh di mana?"_ Dokumen ini adalah acuan untuk developer dan untuk AI yang mengerjakan proyek ini.
>
> **Aturan pemeliharaan:** setiap kali ada folder baru di `src`, atau ada aturan penempatan yang berubah, perbarui dokumen ini dan tambahkan baris di [Riwayat Perubahan](#riwayat-perubahan).
>
> **Terakhir diperbarui:** 2026-11-12

## 1. Tiga aturan utama

1. **Satu file, satu tujuan.** Setiap file punya satu peran yang bisa disebut dalam satu kalimat (menampilkan, mengambil data, menghitung, atau menjalankan SQL). Kalau butuh kata "dan" untuk menjelaskannya, pecah.
2. **Dependensi hanya mengalir satu arah** (lihat bagian 2). Lapisan atas boleh memanggil lapisan bawah, tidak sebaliknya.
3. **Folder diberi nama menurut tujuannya, bukan nama merek atau nama proyek.** Itu sebabnya folder `neraca` dihapus: "Neraca UI" adalah nama design system (token dan kelas CSS `nr-*`), bukan nama folder komponen.

## 2. Arah dependensi

```
src/routes            halaman (URL)            ─┐
src/components        tampilan React            │  sisi klien: tidak boleh mengimpor
src/hooks             hook yang dipakai bersama │  src/server, Drizzle, atau mysql2
src/queries           TanStack Query            ─┘
src/functions         server function (pintu masuk dari klien ke server)
src/server/services   merangkai repo + logika murni
src/server/repo       satu-satunya tempat SQL ditulis
src/lib               logika murni (tanpa DB, tanpa React) — bisa diuji tanpa database
```

`src/lib/core` tidak bergantung pada apa pun. `src/lib/format` dan `src/lib/table` tidak mengimpor `src/lib/finance`.

## 3. Peta folder

```
src/
├─ routes/                 satu file per halaman; src/routeTree.gen.ts dibuat otomatis (jangan diubah)
├─ components/
│  ├─ ui/                  komponen dasar yang bebas domain (Button, Notice, KpiCard, DataTable, ...)
│  │  ├─ shadcn/           hasil generate shadcn (jangan diubah tangan)
│  │  └─ data-table/       DataTable dan bagian-bagiannya
│  ├─ layout/              kerangka halaman: AppShell, SidebarNav, MetricError, MetricSkeleton, ...
│  │  └─ top-bar/          TopBar, EntityPicker, PeriodSelect, PrefsToggles
│  ├─ charts/              grafik yang dipakai lebih dari satu halaman (CashflowChart, DonutBreakdown, EntityDonut)
│  └─ <halaman>/           aging, balance-sheet, budget, cash-flow, cash-position, data-checks, drill, export,
│                          payment-plan, profit-loss, revenue, settings, summary
├─ hooks/                  hook yang dipakai banyak area (use-lang, use-is-desktop, use-table-search, ...)
├─ queries/                queryOptions TanStack Query + kunci di keys.ts
├─ functions/              server function (*.fn.ts) + middleware.ts
│  ├─ ap-ar/  cash/  pnl/  halaman metrik per domain
│  ├─ balance-sheet/       neraca (Balance Sheet)
│  └─ (root)               summary, drill, settings, filters, snapshot, data-checks, auth, prefs, client-error
├─ server/
│  ├─ services/            rangkaian repo + logika; satu folder per domain besar
│  │  ├─ ap-ar/  cash/  pnl/  drill/
│  │  ├─ balance-sheet/       neraca (Balance Sheet)
│  │  └─ shared/           helper yang dipakai beberapa domain (account-mapping.ts)
│  ├─ repo/                SQL; satu folder per domain besar
│  │  ├─ ap-ar/  cash/  gl/  master-data/  pnl/
│  │  └─ (root)            auth, settings, data-checks, dan sql-guard.test.ts
│  ├─ db/  dash/  auth/    koneksi/pembantu DB, tabel snapshot dash_*, login & sesi
│  ├─ logging/             logger pino, request ID, konteks log, file harian, pencarian log (src/server/logging/)
│  └─ cache.ts  context.ts  env.ts  error-classify.ts  log.ts  metric-settings.ts  oid.ts  public-error.ts
├─ lib/
│  ├─ core/                tipe, uang (decimal), compare, label i18n — tidak bergantung pada apa pun
│  ├─ finance/             logika keuangan murni per domain: ap-ar, balance-sheet, cash, checks, coa, entity, journal, period, pnl
│  ├─ filters/             skema filter URL, token entitas, lingkup filter
│  ├─ format/              format angka, tanggal, CSV, KPI, donut
│  ├─ settings/  table/    skema pemetaan akun; kueri tabel dan potongan ekspor
│  ├─ client-errors/       skema laporan error browser dan reporter (murni, dipakai browser dan server)
│  └─ brand.ts  cn.ts  error-message.ts
├─ i18n/                   en.json (default) dan id.json
└─ styles/                 tokens.css, neraca.css (kelas nr-*), print.css, app.css
```

## 4. Tabel keputusan: file baru ditaruh di mana?

| Saya ingin menambah...                                                                                   | Taruh di                                                                                                                                                             | Catatan                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komponen dasar yang bisa dipakai di mana saja tanpa peduli domain (dialog, tombol, kartu, tabel generik) | `src/components/ui/`                                                                                                                                                 | Tidak boleh mengimpor halaman, layout, charts, `lib/finance`, `functions`, atau `queries` (dijaga ESLint).                                                                                                     |
| Menulis log, atau menambah field log                                                                     | Memanggil: `createLogger` dari `src/server/log.ts`. Nama field baru: `src/server/logging/log-fields.ts`                                                              | Bentuk panggilan `log.error({ err, fn }, 'pesan')`; jangan `console.*`, jangan `errorText(error)` di dalam pesan (bab 10.6 project-guide).                                                                     |
| Pengaturan (variabel lingkungan) baru                                                                    | Skema di `src/server/env.ts`; namanya di `scripts/lib/env-keys.mjs` (tes gagal bila lupa); contoh di `.env.example`; baris di tabel `docs/project-guide.md` bab 10.1 | Nilai asli hanya ada di file env tiap lingkungan, tidak pernah di git atau di dokumen.                                                                                                                         |
| Skrip untuk komputer pembangun yang mengirim ke server (deploy)                                          | `scripts/deploy/` (tidak ikut dikirim ke server), logikanya di `deploy-flow.mjs`, tesnya di sebelahnya                                                               | Tidak boleh menyebut nama klien atau server asli; file target asli ada di `env/deploy-targets.json` (diabaikan git).                                                                                           |
| Alat yang dijalankan di server (hanya Node)                                                              | `scripts/ops/*.mjs`; modul bersamanya di `scripts/lib/*.mjs`                                                                                                         | Ikut dikirim ke server; tanpa paket tambahan, tanpa `tsx`. Skrip TypeScript yang harus jalan di server cukup bernama `scripts/dash-*.ts` atau `scripts/logs-find.ts`: `build:ops` membundelnya ke `dist/ops/`. |
| Komponen shadcn baru                                                                                     | `src/components/ui/shadcn/`                                                                                                                                          | Dibuat oleh `npx shadcn add`; izin user diperlukan.                                                                                                                                                            |
| Bagian dari kerangka aplikasi (sidebar, top bar, footer, pembungkus halaman)                             | `src/components/layout/`                                                                                                                                             |                                                                                                                                                                                                                |
| Grafik yang dipakai oleh lebih dari satu halaman                                                         | `src/components/charts/`                                                                                                                                             | Grafik yang hanya dipakai satu halaman tinggal di folder halaman itu.                                                                                                                                          |
| Komponen khusus satu halaman                                                                             | `src/components/<halaman>/`                                                                                                                                          |                                                                                                                                                                                                                |
| Komponen yang dipakai dua halaman atau lebih tetapi punya makna domain                                   | Folder halaman yang memiliki konsepnya; halaman lain mengimpor dari sana                                                                                             | Contoh: `CashBalanceCard` ada di `cash-position/` dan dipakai juga oleh Summary.                                                                                                                               |
| Hook yang dipakai banyak area                                                                            | `src/hooks/use-*.ts`                                                                                                                                                 |                                                                                                                                                                                                                |
| Hook milik satu fitur                                                                                    | Di sebelah fiturnya, mis. `src/components/drill/use-drill-data.ts`                                                                                                   |                                                                                                                                                                                                                |
| Fungsi perhitungan murni (tanpa DB, tanpa React)                                                         | `src/lib/finance/<domain>/` atau `src/lib/format/`                                                                                                                   | Wajib ada test di sebelahnya.                                                                                                                                                                                  |
| Tipe atau helper uang yang dipakai semua lapisan                                                         | `src/lib/core/`                                                                                                                                                      | Hanya yang benar-benar universal.                                                                                                                                                                              |
| Query SQL                                                                                                | `src/server/repo/<domain>/<topik>.repo.ts`                                                                                                                           | Satu-satunya tempat SQL. Harus lolos `sql-guard.test.ts`.                                                                                                                                                      |
| Rangkaian beberapa repo + logika menjadi satu hasil                                                      | `src/server/services/<domain>/<topik>.service.ts`                                                                                                                    | Mengembalikan objek sederhana yang bisa diserialisasi.                                                                                                                                                         |
| Helper server yang dipakai beberapa domain                                                               | `src/server/services/shared/`                                                                                                                                        |                                                                                                                                                                                                                |
| Pintu masuk dari klien ke server                                                                         | `src/functions/<domain>/<topik>.fn.ts`                                                                                                                               | Urutan: `authMiddleware`, validasi zod, `resolveFilter`, service.                                                                                                                                              |
| Opsi TanStack Query                                                                                      | `src/queries/`                                                                                                                                                       | Kunci cache selalu lewat `qk` di `keys.ts`.                                                                                                                                                                    |
| Teks tampilan                                                                                            | `src/i18n/locales/en.json` dan `id.json`                                                                                                                             | Kedua file harus punya kunci yang sama.                                                                                                                                                                        |

## 5. Domain dan lokasinya di tiap lapisan

| Domain                                          | `lib/finance`                | `server/repo`                                                              | `server/services`        | `functions`         | Komponen                              | Route                                              |
| ----------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- | ------------------------ | ------------------- | ------------------------------------- | -------------------------------------------------- |
| Utang/piutang, rencana bayar, biaya dibayar     | `ap-ar/`                     | `ap-ar/`                                                                   | `ap-ar/`                 | `ap-ar/`            | `aging/`, `payment-plan/`             | `payables`, `receivables`, `payment-plan`          |
| Kas (posisi, arus, runway, saldo)               | `cash/`, `period/balance.ts` | `cash/`                                                                    | `cash/`                  | `cash/`             | `cash-position/`, `cash-flow/`        | `cash-position`, `cash-flow`                       |
| Laba rugi (P&L, revenue, biaya tetap, anggaran) | `pnl/`                       | `pnl/`                                                                     | `pnl/`                   | `pnl/`              | `profit-loss/`, `revenue/`, `budget/` | `profit-loss`, `revenue`, `budget`                 |
| Neraca (Balance Sheet)                          | `balance-sheet/`             | `master-data/` (tahun buku, properti akun laba); jurnal dibaca lewat `gl/` | `balance-sheet/`         | `balance-sheet/`    | `balance-sheet/`                      | `balance-sheet`                                    |
| Jurnal buku besar                               | `journal/`                   | `gl/`                                                                      | (dipakai semua service)  | —                   | —                                     | —                                                  |
| Data induk (akun, entitas, periode)             | `coa/`, `entity/`, `period/` | `master-data/`                                                             | `filters.service.ts`     | `filters.fn.ts`     | —                                     | —                                                  |
| Summary                                         | —                            | —                                                                          | `summary.service.ts`     | `summary.fn.ts`     | `summary/`                            | `summary` (`index` hanya mengarahkan ke `summary`) |
| Drill-down                                      | —                            | —                                                                          | `drill/`                 | `drill.fn.ts`       | `drill/`                              | (lembar samping, parameter `drill`)                |
| Cek data                                        | `checks/`                    | `data-checks.repo.ts`                                                      | `data-checks.service.ts` | `data-checks.fn.ts` | `data-checks/`                        | —                                                  |
| Pengaturan pemetaan akun                        | `coa/` dan `lib/settings/`   | `settings.repo.ts`                                                         | `settings.service.ts`    | `settings.fn.ts`    | `settings/`                           | `settings/account-mapping`                         |
| Snapshot data                                   | —                            | —                                                                          | `snapshot.service.ts`    | `snapshot.fn.ts`    | `layout/DataFreshness.tsx`            | —                                                  |
| Login                                           | —                            | `auth.repo.ts`                                                             | `server/auth/`           | `auth.fn.ts`        | —                                     | `login`                                            |

## 6. Aturan penamaan file

| Jenis             | Aturan                                                                                     | Contoh                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Komponen React    | `PascalCase.tsx`; bagian pendukung memakai akhiran `Parts` atau `Rows` di folder yang sama | `KpiCard.tsx`, `DataTableRows.tsx`                     |
| Hook              | `use-*.ts` (kebab-case); nama export tetap `useXxx`                                        | `use-lang.ts` mengekspor `useLang`                     |
| Context           | `*-context.tsx`                                                                            | `prefs-context.tsx`                                    |
| Repo              | `<topik>.repo.ts`; helper repo tanpa akhiran di dalam folder domain                        | `ap-ar/aging.repo.ts`, `ap-ar/rows.ts`, `gl/shared.ts` |
| Service           | `<topik>.service.ts`; helper tanpa akhiran `.helper`                                       | `cash/cash-flow.service.ts`, `ap-ar/aging-helpers.ts`  |
| Server function   | `<topik>.fn.ts`                                                                            | `ap-ar/ap-aging.fn.ts`                                 |
| Query options     | `<topik>.queries.ts`                                                                       | `drill.queries.ts`                                     |
| Test              | `<nama file>.test.ts` di sebelah file yang diuji                                           | `money.test.ts`                                        |
| Logika murni lain | `kebab-case.ts`                                                                            | `period-type.ts`                                       |

Nama yang diekspor (fungsi, komponen, tipe) tidak boleh berubah hanya karena file dipindah.

## 7. Penjaga otomatis

| Penjaga                                | Menjaga apa                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js` — layering          | `routes`, `components`, `queries`, `lib` tidak mengimpor `~/server` atau `drizzle-orm`/`mysql2`.                                                                                         |
| `eslint.config.js` — `lib` murni       | `src/lib` tidak mengimpor React atau router.                                                                                                                                             |
| `eslint.config.js` — `ui` bebas domain | `src/components/ui` (kecuali `shadcn/`) tidak mengimpor halaman, layout, charts, `lib/finance`, `functions`, atau `queries`.                                                             |
| `src/server/repo/sql-guard.test.ts`    | Semua file di `src/server/repo`, termasuk subfolder, kompatibel dengan MySQL 5.7, bebas `SELECT *`, dan tidak menulis ke database (satu-satunya pengecualian adalah `settings.repo.ts`). |
| `src/server/dash/guard.test.ts`        | Hanya tabel `dash_*` yang ditulis; repo tidak menulis ke tabel `dash_*`.                                                                                                                 |
| `src/i18n/keys.test.ts`                | Kunci `en.json` dan `id.json` sama.                                                                                                                                                      |

## 8. Menambah metrik baru (urutan kerja)

1. Logika murni dan test: `src/lib/finance/<domain>/`.
2. SQL: `src/server/repo/<domain>/<topik>.repo.ts` (patuhi aturan MySQL 5.7).
3. Rangkaian: `src/server/services/<domain>/<topik>.service.ts`.
4. Pintu masuk: `src/functions/<domain>/<topik>.fn.ts` dan opsi query di `src/queries/metrics.queries.ts` (kunci lewat `qk`).
5. Tampilan: `src/components/<halaman>/` dan route di `src/routes/_authed/`.
6. Teks di `en.json` dan `id.json`.
7. Bila menyentuh data, query, tabel (termasuk `dash_*`), rumus, halaman, atau istilah: `docs/project-guide.md` ikut diperbarui dalam perubahan yang sama, beserta riwayat dan tabel konfirmasinya (bab 12 dan 14).

## 9. Riwayat Perubahan

| Tanggal    | Perubahan                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | Dokumen dibuat bersama penataan ulang folder src: peta folder, tabel keputusan, aturan penamaan, domain per lapisan, dan penjaga otomatis.                                                                                                                                       |
| 2026-11-05 | Langkah 7 di "Menambah metrik baru" mengarah ke `docs/project-guide.md` (menggantikan dokumen Summary dan Revenue).                                                                                                                                                              |
| 2026-11-09 | Domain Balance Sheet (neraca) ditambahkan: `balance-sheet/` di lib/finance, services, functions, dan components, serta route `balance-sheet`.                                                                                                                                    |
| 2026-11-09 | Snapshot neraca bulanan: `src/server/dash/balance-snapshot.ts` dan `balance-snapshot-read.ts`, skrip `scripts/dash-refresh-balance.ts`.                                                                                                                                          |
| 2026-11-09 | `src/server/metric-settings.ts`: batas dan nilai bawaan pengaturan cache metrik, dipakai `env.ts` dan `cache.ts`.                                                                                                                                                                |
| 2026-11-10 | Folder baru: `src/server/logging/` (logger, request ID, konteks, file log, pencarian), `src/lib/client-errors/`; file `src/server/error-classify.ts` dan `src/functions/client-error.fn.ts`, serta skrip `scripts/logs-find.ts`.                                                 |
| 2026-11-12 | Pengaturan lingkungan: `src/lib/core/app-env.ts` (aturan tiga lingkungan); `src/server/env.ts` tidak lagi membaca file env; skrip pendukung di `scripts/lib/` dan `scripts/ops/` (di luar `src`); satu baris baru di tabel keputusan untuk variabel lingkungan baru (D66).       |
| 2026-11-12 | Rilis dan deploy: `scripts/deploy/` (skrip untuk komputer pembangun), `scripts/ops/release.mjs` dan `health-check.mjs`, modul `scripts/lib/release-*.mjs` dan `health-wait.mjs`, `vite.ops.config.ts` (hasil di `dist/ops/`), `src/server/health.ts` dan `health-core.ts` (D67). |
