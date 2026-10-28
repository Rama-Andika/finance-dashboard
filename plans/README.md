# Rencana Implementasi — Finance Dashboard (TanStack Start)

> Status: **rencana, belum diimplementasikan** · Dibuat: 28 Oktober 2026
> Dokumen sumber (wajib dibaca sebelum mulai): [`docs/decisions.md`](../docs/decisions.md) · [`docs/data-model.md`](../docs/data-model.md) · [`docs/sql/dashboard-indexes.sql`](../docs/sql/dashboard-indexes.sql) · design system [Neraca UI](https://claude.ai/artifact/6YqBk8Tgx4MTr9eJvNvCpK)
> Pembaca utama: **AI pelaksana** (model murah) dan user sebagai pemberi izin.

Rencana ini terdiri dari **file ini** (`README.md`: aturan umum, struktur, dependensi, konvensi, O-item, lampiran, catatan) dan **17 file fase** `00_phase-…md` s.d. `16_phase-…md` di folder yang sama (daftarnya di §6). Rencana menerjemahkan semua keputusan proyek menjadi langkah kerja berurutan. Isinya tidak menambah keputusan baru. Bila sebuah langkah tampak bertentangan dengan `decisions.md` atau `data-model.md`, yang berlaku adalah kedua dokumen itu, dan pertentangannya sudah dicatat di [§9 Catatan untuk user](#9-catatan-untuk-user).

---

## Daftar isi

1. [Cara memakai dokumen ini](#1-cara-memakai-dokumen-ini)
2. [Aturan emas](#2-aturan-emas)
3. [Struktur folder final](#3-struktur-folder-final)
4. [Dependensi & versi](#4-dependensi--versi)
5. [Konvensi kode](#5-konvensi-kode)
6. [Fase implementasi (Fase 0 – Fase 16, satu file per fase)](#6-fase-implementasi)
7. [O-item terbuka & default sementara](#7-o-item-terbuka--default-sementara)
8. [Lampiran](#8-lampiran)
9. [Catatan untuk user](#9-catatan-untuk-user)

---

## 1. Cara memakai dokumen ini

### 1.1 Aturan untuk AI pelaksana

1. **Kerjakan berurutan.** Fase 0 → Fase 16 (file `00_phase-…md` → `16_phase-…md`), dan di dalam fase langkah pertama → langkah terakhir. Jangan melompat. Buka satu file fase saja pada satu waktu, ditambah `README.md` ini sebagai acuan.
2. **Satu langkah selesai baru lanjut.** Sebuah langkah dianggap selesai hanya bila **semua** poin di bagian "✅ Cek selesai" terpenuhi. Bila satu cek gagal, perbaiki dulu; jangan lanjut ke langkah berikutnya.
3. **Jangan menebak.** Nama tabel, nama kolom, kode akun, arti kode, dan rumus **hanya** boleh diambil dari rencana ini (`README.md` + file fase), `decisions.md`, `data-model.md`, atau `schema/columns.csv`. Bila informasi tidak ada di sana, **berhenti dan tanya user**.
4. **Berhenti & tanya user bila ragu**, terutama tentang arti data ERP (kode status, tipe transaksi, akun) dan apa pun yang menyentuh data sensitif.
5. **Langkah bertanda ⛔ IZIN USER** wajib meminta izin user di chat **sebelum** dijalankan, lalu menunggu jawaban "ya" yang jelas. Izin berlaku untuk satu langkah itu saja. Yang selalu butuh izin:
   - scaffold proyek (`npx @tanstack/cli …`, `npx shadcn …`);
   - install / tambah / hapus paket (`npm install …`);
   - `git init`, commit, push;
   - **menjalankan apa pun ke database** (termasuk `SELECT` biasa, `drizzle-kit pull`, test integrasi, script seed);
   - menjalankan script index `docs/sql/dashboard-indexes.sql` (script ini **hanya** dijalankan manual oleh user, AI tidak boleh menjalankannya sama sekali).
6. **Catat kemajuan.** Setiap selesai satu langkah, tambahkan satu baris di `docs/progress.md` (dibuat di Fase 0): tanggal, nomor langkah, ringkas hasil, hasil cek.
7. **Jangan mengubah keputusan.** Bila menurutmu ada cara yang lebih baik, tulis usulannya di `docs/progress.md` bagian "Usulan", lalu tetap kerjakan sesuai rencana.
8. **Jangan menyalin data sensitif** (nomor rekening, nomor pinjaman, nama pemegang saham, nama perusahaan klien, password) ke kode, test, log, commit, atau chat.

### 1.2 Arti simbol

| Simbol | Arti |
|---|---|
| ⛔ IZIN USER | Minta izin user dulu, tunggu jawaban "ya" |
| 🎯 Tujuan | Kenapa langkah ini ada |
| 📁 File | File yang dibuat (➕) atau diubah (✏️), dengan path persis dari root proyek |
| 🚫 Dilarang | Hal yang tidak boleh dilakukan di langkah ini |
| ✅ Cek selesai | Syarat lulus langkah; semuanya harus terpenuhi |
| D#, F#, S#, U#, T#, O# | Nomor keputusan di `decisions.md` |
| §x.y | Nomor bagian di `data-model.md` (kecuali ditulis "README §x" = bagian di file ini) |

### 1.3 Perintah standar

Semua perintah dijalankan dari root proyek `D:\React\Tanstack router\financeDashboard`.

| Tujuan | Perintah | Hasil yang diharapkan |
|---|---|---|
| Cek tipe | `npm run typecheck` | Selesai tanpa error (exit code 0) |
| Unit test | `npm test` | Semua test lulus |
| Test integrasi DB (⛔ IZIN USER) | `npm run test:db` | Semua test lulus |
| Jalankan dev server | `npm run dev` | Server di `http://localhost:3000` |
| Build produksi | `npm run build` | Selesai tanpa error |

Script di atas dibuat di Fase 1 langkah 1.2 (`package.json`).

---

## 2. Aturan emas

Aturan ini (G1–G38) berlaku di **semua** fase. Bila sebuah langkah melanggar salah satunya, langkah itu salah.

### 2.1 SQL & database

| # | Aturan | Rujukan |
|---|---|---|
| G1 | SQL wajib jalan di **MySQL 5.7.44**. **Dilarang:** `WITH` (CTE, termasuk rekursif), window function (`OVER`, `ROW_NUMBER`, `LAG`, …), `LATERAL`, `REGEXP_REPLACE`, `REGEXP_SUBSTR`. DB lokal `demo` (MariaDB 10.4) menerima sintaks itu, jadi lolos di laptop **tidak** berarti benar | D23, §9.2.1 |
| G2 | `GROUP BY` mencantumkan **semua** kolom non-agregat di `SELECT` (`ONLY_FULL_GROUP_BY`) | D23 |
| G3 | Upsert: `INSERT … ON DUPLICATE KEY UPDATE col = VALUES(col)`. **Dilarang** alias `AS new` | D23, §5.4 |
| G4 | Drizzle: pakai **core query builder** atau template `sql\`…\``. **Dilarang** relational API (`db.query.x.findMany({ with })`) | D23 |
| G5 | Agregasi (`SUM`, `GROUP BY`) dikerjakan **di SQL**, bukan dengan mengambil jutaan baris ke JavaScript | D12 |
| G6 | Semua query **berparameter**. Nilai dari user tidak pernah disambung ke string SQL. Nama tabel dinamis (arsip `gl_20xx`) hanya boleh lewat **whitelist** (README §5.6) | D14 |
| G7 | SQL hanya boleh ditulis di `src/server/repo/*.ts`. Komponen UI dan route **tidak pernah** mengimpor Drizzle, `mysql2`, atau `src/server/**` | §9.1 |
| G8 | **Dilarang** `drizzle-kit push`, `drizzle-kit migrate`, `drizzle-kit generate`, DDL (`CREATE/ALTER/DROP`) ke DB ERP. `drizzle-kit pull` hanya ke **DB lokal** | D13, §9.2 |
| G9 | Hak tulis dashboard ke DB **hanya** `INSERT`/`UPDATE` pada `system_main` (baris `DASHBOARD_ACCOUNT_MAPPING`). Tidak ada query lain yang menulis | D13 |
| G10 | Kredensial DB hanya di env server (`DATABASE_URL`). `.env` dan `.dbclient.cnf` tidak pernah di-commit, dicetak, atau dibaca isinya oleh AI | D14 |

### 2.2 Angka, ID, tanggal

| # | Aturan | Rujukan |
|---|---|---|
| G11 | Semua **ID** adalah `string` (`mysql2`: `supportBigNumbers: true`, `bigNumberStrings: true`; Drizzle `bigint({ mode: 'string' })`). Jangan pernah `Number(id)` atau `parseInt(id)` | D11, §4.8 |
| G12 | Semua nilai uang (`DECIMAL`, hasil `SUM`) dibaca sebagai **string** lalu dihitung dengan `decimal.js`. **Dilarang** `+`, `-`, `*`, `/`, `Number()` dan `parseFloat()` pada uang. Pembulatan hanya saat ditampilkan | §4.8 |
| G13 | Tanggal bisnis berupa string `YYYY-MM-DD` (`mysql2`: `dateStrings: true`). "Hari ini" dihitung di server memakai zona waktu `APP_TIMEZONE` | §1.2 |
| G14 | Angka **bulanan** memakai `gl.period_id`; angka **harian**/rentang hari memakai `gl.trans_date` | D18, §4.6 |
| G15 | Tabel GL dibaca sesuai `periode.table_name` (`gl`/`gl_detail` atau arsip `gl_20xx`/`gl_detail_20xx`) | D26, §2.2 |

### 2.3 Aturan akuntansi

| # | Aturan | Rujukan |
|---|---|---|
| G16 | Jurnal dihitung hanya bila `gl.posted_status = 1 AND gl.canceled_date IS NULL`. Jurnal pembalik **ikut** dihitung | §4.1 |
| G17 | Tanda (+/−) ditentukan oleh **sisi `account_group`**, bukan `coa.saldo_normal`. Sisi debit: Liquid Assets, Fixed Assets, Other Assets, Cost Of Sales, Expense, Other Expense → `debet − credit`. Sisi kredit: Current Liabilities, Long Term Liabilities, Equity, Revenue, Other Revenue → `credit − debet` | §3.5, §4.4 |
| G18 | Entitas = `pos_location` (1 lokasi = 1 entitas). Jalur jurnal: `gl_detail.<kolom segmen entitas>` → `segment_detail.location_id`. Kolom segmen entitas = `segment.column_name` dengan `segment.count = 1` | D8, D21, §4.2 |
| G19 | Konsolidasi = **penjumlahan biasa**, **tanpa eliminasi** intercompany | D2 |
| G20 | **Tidak ada** dimensi departemen. Tabel `department`, semua kolom `department_id`, `bank_account`, dan `acc_link.location_id` tidak dipakai | D9 |
| G21 | Sisa AP/AR **hanya** dari `ap_ar_card` + `ap_ar_card_detail`. **Dilarang** memakai `payment_status` untuk sisa/lunas dan **dilarang** menambah `bankpo_payment_detail` (hitung ganda) | D16, §6.6 |
| G22 | `ap_ar_card.in_out = 0` diabaikan; baris dengan `in_out` atau `transaction_date` NULL dibuang | §4.7 Q4, Q6 |
| G23 | `coa_budget.bgt_month` **0-based** (Januari = 0, Desember = 11) | D28 |
| G24 | Kode akun **tidak boleh** di-hardcode untuk keranjang Kas/Bank/Deposito/Dana dalam pencairan/Biaya Tetap; semuanya dari Settings (`system_main`). Pengecualian satu-satunya: `PNL_OCI_ROOT_CODES` (O4) | S1, O4 |
| G25 | `acc_link` tidak dipakai untuk menentukan akun kas | D10 |

### 2.4 Keamanan & data sensitif

| # | Aturan | Rujukan |
|---|---|---|
| G26 | Password `sysuser` hanya dibandingkan di server dengan `crypto.timingSafeEqual`; **tidak pernah** dikembalikan ke browser, di-log, dimasukkan ke pesan error, di-cache, atau disimpan di session | §9.3 |
| G27 | Query `sysuser` memilih kolom secara eksplisit (tidak `SELECT *`). Kolom `password` hanya dipilih di satu fungsi login | §9.3 |
| G28 | Jangan pernah memilih kolom rekening/identitas vendor & customer (`nomor_rekening`, `no_rek`, `npwp`, `no_npwp`, `id_number`, `bank_account_number`, dll.). Yang boleh dipilih dari `vendor`/`customer` hanya `vendor_id`/`customer_id`, `code`, `name` | §2.2 |
| G29 | Jangan menulis nomor rekening, nomor pinjaman, nama pemegang saham, atau nama perusahaan klien di kode, test, seed, log, atau dokumen | data-model.md (catatan 🔒) |
| G30 | Jangan mencetak atau membaca isi `.dbclient.cnf` dan `.env`. Boleh mengecek bahwa file itu ada | — |
| G31 | Setiap server function memeriksa session login lebih dulu (`authMiddleware`), kecuali `loginFn`, `logoutFn`, `getCurrentUserFn`, `getPrefsFn`, dan `setPrefsFn` | §5.4, §9.3 |

### 2.5 Tampilan

| # | Aturan | Rujukan |
|---|---|---|
| G32 | Semua UI memakai token & kelas Neraca UI. Tidak ada warna hex di komponen; selalu `var(--token)` atau kelas Tailwind yang dipetakan ke token | U7 |
| G33 | Satu kartu `forest` per layar; `lime` hanya sebagai isian (tidak pernah warna teks); tanpa gradien, tanpa bayangan di kartu biasa, tanpa emoji di UI | U7 (README Neraca UI) |
| G34 | Kartu: angka disingkat + tooltip angka penuh. Tabel: angka penuh, rata kanan, `tabular-nums`, negatif dalam kurung warna `ink` | U3, README Neraca UI |
| G35 | Semua teks UI lewat i18n (EN default + ID). Tidak ada teks UI yang ditulis langsung di komponen | U2 |
| G36 | Label UI memakai istilah finance, bukan nama tabel ("Utang Usaha", bukan `ap_ar_card`) | README Neraca UI |

### 2.6 Bahasa di kode

| # | Aturan | Rujukan |
|---|---|---|
| G37 | Semua yang ada di **kode** memakai **bahasa Inggris**: nama route/URL (`/summary`, `/cash-flow`, `/settings/account-mapping`, …), nama file & folder, nama variabel/fungsi/tipe, alias kolom SQL (`txDate`, `balance`, bukan `tgl`, `saldo`), komentar kode (`//`, `/* */`, `--` di SQL, `#` di `.env.example`/`.gitignore`), pesan `Error`, log (`console.*`), dan nama test (`describe`/`it`). Bahasa Indonesia **hanya** boleh ada di `src/i18n/locales/id.json` (teks UI) dan di dokumen `docs/` | Permintaan user |
| G38 | Nama kolom & tabel ERP **tidak** diterjemahkan (`ap_ar_card`, `bgt_month`, `posted_status`, …) karena itu nama asli di database; yang berbahasa Inggris adalah alias dan nama di kode TypeScript | — |

> Catatan: ikon ⚠️/ⓘ/🔴 di `data-model.md` adalah **penanda di dokumen**. Di UI, penanda itu diwujudkan dengan ikon Lucide (`triangle-alert`, `info`, `circle-alert`) + kata, sesuai aturan "tanpa emoji" Neraca UI.

---

## 3. Struktur folder final

Pohon di bawah adalah kondisi **akhir** setelah Fase 16. File bertanda `(gen)` dibuat otomatis oleh tool, jangan diedit manual.

```
financeDashboard/
├─ .dbclient.cnf                 # kredensial DB lokal untuk CLI mysql (dipindah dari docs/, gitignored)
├─ .env                          # rahasia lokal (gitignored, dibuat user)
├─ .env.example                  # contoh variabel tanpa nilai rahasia
├─ .gitignore
├─ components.json               # konfigurasi shadcn/ui
├─ drizzle.config.ts             # hanya untuk drizzle-kit pull ke DB lokal
├─ package.json
├─ package-lock.json             (gen)
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ plans/                        # rencana implementasi ini
│  ├─ README.md                  # aturan umum, struktur, konvensi, lampiran, catatan
│  └─ 00_phase-…md … 16_phase-…md   # satu file per fase
├─ docs/
│  ├─ decisions.md
│  ├─ data-model.md
│  ├─ progress.md                # log kemajuan (Fase 0)
│  ├─ verification-report.md     # hasil Fase 16
│  ├─ design/neraca-ui/          # salinan sumber design system (Fase 2)
│  │  ├─ README.md               # brand book (aturan warna, tipografi, layout)
│  │  ├─ design-system.json
│  │  ├─ tokens.json
│  │  └─ components/             # bundle.css + <Komponen>/README.md + preview.html (16 komponen + Cover)
│  └─ sql/
│     └─ dashboard-indexes.sql
├─ schema/                       # ekspor information_schema (gitignored)
│  ├─ columns.csv
│  └─ ap_lunas_tanpa_pembayaran.csv
├─ scripts/
│  └─ seed/                      # Fase 15 (opsional)
│     ├─ index.ts
│     ├─ guard.ts
│     ├─ guard.test.ts
│     ├─ ddl.sql
│     ├─ master-data.ts
│     ├─ transactions.ts
│     └─ README.md
├─ tests/
│  ├─ integration/               # test ke DB lokal (⛔ IZIN USER saat dijalankan)
│  │  ├─ setup.ts
│  │  ├─ expected.json           (gen) angka yang diharapkan dari seed (Fase 15)
│  │  ├─ mysql57-compat.int.test.ts
│  │  ├─ settings.int.test.ts
│  │  ├─ auth.int.test.ts
│  │  └─ metrics.int.test.ts
│  ├─ empty-module.ts            # pengganti penanda server-only di Vitest
│  └─ fixtures/                  # data kecil buatan sendiri untuk unit test
│     ├─ coa.fixture.ts
│     ├─ periods.fixture.ts
│     ├─ apar.fixture.ts
│     └─ cashflow.fixture.ts
└─ src/
   ├─ router.tsx
   ├─ routeTree.gen.ts           (gen)
   ├─ styles/
   │  ├─ app.css                 # entry Tailwind + import token & komponen
   │  ├─ tokens.css              # token Neraca UI light/dark
   │  ├─ neraca.css              # kelas nr-* (port bundle.css)
   │  └─ print.css               # @media print
   ├─ routes/
   │  ├─ __root.tsx
   │  ├─ login.tsx
   │  ├─ _authed.tsx             # layout + guard login
   │  └─ _authed/
   │     ├─ index.tsx            # redirect ke /summary
   │     ├─ summary.tsx
   │     ├─ revenue.tsx
   │     ├─ cash-position.tsx
   │     ├─ cash-flow.tsx
   │     ├─ profit-loss.tsx
   │     ├─ payables.tsx
   │     ├─ receivables.tsx
   │     ├─ payment-plan.tsx
   │     ├─ budget.tsx
   │     └─ settings/
   │        └─ account-mapping.tsx
   ├─ components/
   │  ├─ ui/                     (gen) komponen shadcn (dialog, sheet, popover, …)
   │  ├─ neraca/                 # komponen domain Neraca UI
   │  │  ├─ Button.tsx
   │  │  ├─ DeltaPill.tsx
   │  │  ├─ StatusPill.tsx
   │  │  ├─ Notice.tsx
   │  │  ├─ FigureTooltip.tsx
   │  │  ├─ Tabs.tsx
   │  │  ├─ KpiCard.tsx
   │  │  ├─ CashBalanceCard.tsx
   │  │  ├─ SidebarNav.tsx
   │  │  ├─ TopBar.tsx
   │  │  ├─ PeriodSelect.tsx
   │  │  ├─ EntityPicker.tsx
   │  │  ├─ CashflowChart.tsx
   │  │  ├─ DonutBreakdown.tsx
   │  │  ├─ AgingBar.tsx
   │  │  ├─ DataTable.tsx
   │  │  ├─ Skeleton.tsx
   │  │  └─ EmptyState.tsx
   │  ├─ layout/
   │  │  ├─ AppShell.tsx
   │  │  └─ MobileDrawer.tsx
   │  ├─ drill/
   │  │  ├─ DrillSheet.tsx
   │  │  └─ JournalList.tsx
   │  ├─ export/
   │  │  ├─ ExportCsvDialog.tsx
   │  │  └─ PrintButton.tsx
   │  ├─ data-checks/
   │  │  └─ DataChecksPanel.tsx
   │  └─ settings/
   │     ├─ CoaTreePicker.tsx
   │     └─ BasketPreview.tsx
   ├─ i18n/
   │  ├─ index.ts
   │  ├─ keys.test.ts
   │  └─ locales/
   │     ├─ en.json
   │     └─ id.json
   ├─ lib/                       # logika murni (tanpa DB, tanpa React) → mudah dites
   │  ├─ format/
   │  │  ├─ number.ts            (+ number.test.ts)
   │  │  ├─ date.ts              (+ date.test.ts)
   │  │  └─ csv.ts               (+ csv.test.ts)
   │  ├─ finance/
   │  │  ├─ types.ts
   │  │  ├─ money.ts             (+ money.test.ts)
   │  │  ├─ sign.ts              (+ sign.test.ts)
   │  │  ├─ coa-tree.ts          (+ coa-tree.test.ts)
   │  │  ├─ basket-resolver.ts   (+ basket-resolver.test.ts)
   │  │  ├─ periods.ts           (+ periods.test.ts)
   │  │  ├─ balance.ts           (+ balance.test.ts)
   │  │  ├─ revenue.ts           (+ revenue.test.ts)
   │  │  ├─ pnl.ts               (+ pnl.test.ts)
   │  │  ├─ cashflow.ts          (+ cashflow.test.ts)
   │  │  ├─ apar.ts              (+ apar.test.ts)
   │  │  ├─ aging.ts             (+ aging.test.ts)
   │  │  ├─ expense-paid.ts      (+ expense-paid.test.ts)
   │  │  ├─ fixed-cost.ts        (+ fixed-cost.test.ts)
   │  │  ├─ payment-plan.ts      (+ payment-plan.test.ts)
   │  │  ├─ budget.ts            (+ budget.test.ts)
   │  │  └─ runway.ts            (+ runway.test.ts)
   │  ├─ filters/
   │  │  ├─ search-schema.ts     (+ search-schema.test.ts)
   │  │  └─ entity-token.ts      (+ entity-token.test.ts)
   │  ├─ settings/
   │  │  ├─ mapping-schema.ts    (+ mapping-schema.test.ts)
   │  │  └─ mapping-validate.ts  (+ mapping-validate.test.ts)
   │  └─ cn.ts                   # helper className (shadcn)
   ├─ functions/                 # server function (createServerFn) — boleh diimpor route
   │  ├─ middleware.ts
   │  ├─ prefs.fn.ts
   │  ├─ auth.fn.ts
   │  ├─ filters.fn.ts
   │  ├─ settings.fn.ts
   │  ├─ drill.fn.ts
   │  ├─ data-checks.fn.ts
   │  └─ metrics/
   │     ├─ summary.fn.ts
   │     ├─ revenue.fn.ts
   │     ├─ cash-position.fn.ts
   │     ├─ cash-flow.fn.ts
   │     ├─ pnl.fn.ts
   │     ├─ expense-paid.fn.ts
   │     ├─ ap-aging.fn.ts
   │     ├─ ar-aging.fn.ts
   │     ├─ fixed-cost.fn.ts
   │     ├─ payment-plan.fn.ts
   │     ├─ budget.fn.ts
   │     └─ runway.fn.ts
   ├─ queries/                   # queryOptions TanStack Query (satu file per area)
   │  ├─ keys.ts
   │  ├─ filters.queries.ts
   │  ├─ settings.queries.ts
   │  └─ metrics.queries.ts
   └─ server/                    # KHUSUS SERVER — diawali `import '@tanstack/react-start/server-only'`
      ├─ env.ts
      ├─ session.ts
      ├─ login-limiter.ts
      ├─ rate-limit.ts           (+ rate-limit.test.ts)  # tanpa server-only (lihat Fase 5)
      ├─ password.ts             (+ password.test.ts)    # tanpa server-only
      ├─ oid.ts                  (+ oid.test.ts)         # tanpa server-only
      ├─ cache.ts                (+ cache.test.ts)       # tanpa server-only
      ├─ context.ts              # entitas & periode ter-resolve per request
      ├─ db/
      │  ├─ client.ts
      │  ├─ query.ts
      │  ├─ in-list.ts
      │  ├─ schema.ts            # hasil drizzle-kit pull yang dirapikan
      │  └─ gl-tables.ts         (+ gl-tables.test.ts)   # tanpa server-only
      ├─ services/               # merangkai repo + logika murni (dipakai server function)
      │  ├─ balance.service.ts
      │  ├─ revenue.service.ts
      │  ├─ cash-position.service.ts
      │  ├─ cash-flow.service.ts
      │  ├─ pnl.service.ts
      │  ├─ expense-paid.service.ts
      │  ├─ ap-aging.service.ts
      │  ├─ ar-aging.service.ts
      │  ├─ fixed-cost.service.ts
      │  ├─ payment-plan.service.ts
      │  ├─ budget.service.ts
      │  ├─ runway.service.ts
      │  ├─ summary.service.ts
      │  ├─ drill.service.ts
      │  └─ data-checks.service.ts
      └─ repo/
         ├─ sql-guard.test.ts   # test statis kompatibilitas MySQL 5.7
         ├─ auth.repo.ts
         ├─ entities.repo.ts
         ├─ periods.repo.ts
         ├─ coa.repo.ts
         ├─ gl.repo.ts
         ├─ settings.repo.ts
         ├─ apar.repo.ts
         ├─ cashflow.repo.ts
         ├─ budget.repo.ts
         ├─ bank-payment.repo.ts
         └─ data-checks.repo.ts
```

> Aturan penempatan: logika yang bisa dites tanpa DB **harus** di `src/lib/**` (fungsi murni). `src/server/repo/**` hanya menjalankan SQL dan mengembalikan baris mentah (string). `src/server/services/**` merangkai repo + `src/lib/finance/**`. `src/functions/**` tipis: cek session → validasi input → panggil service → kembalikan hasil.

---

## 4. Dependensi & versi

> ⛔ IZIN USER — install paket hanya di Fase 1 langkah 1.3, setelah user setuju.
> Versi di bawah adalah versi terbaru per 28 Oktober 2026 (dicek dengan `npm view <paket> version`). Pasang **persis** versi ini (`npm install --save-exact`). Bila npm menolak karena konflik *peer dependency*, **berhenti**, salin pesan error ke user, jangan memakai `--force` atau `--legacy-peer-deps`.

**Runtime (`dependencies`)**

| Paket | Versi | Untuk |
|---|---|---|
| `@tanstack/react-start` | 1.169.4 | Framework full-stack, SSR, server function |
| `@tanstack/react-router` | 1.170.46 | Routing file-based |
| `@tanstack/react-query` | 5.105.0 | Data fetching & cache |
| `@tanstack/react-router-ssr-query` | 1.167.3 | Integrasi SSR Router + Query |
| `@tanstack/react-table` | 9.3.1 | Tabel |
| `@tanstack/react-virtual` | 3.14.23 | Daftar panjang |
| `react` | 19.3.1 | UI |
| `react-dom` | 19.3.1 | UI |
| `zod` | 4.6.7 | Validasi search params & input server function |
| `drizzle-orm` | 0.45.4 | Query builder |
| `mysql2` | 3.24.6 | Driver MySQL |
| `iron-session` | 9.0.1 | Session cookie terenkripsi (dipakai bersama `getCookie`/`setCookie` TanStack Start) |
| `decimal.js` | 10.6.0 | Hitungan uang |
| `date-fns` | 4.4.0 | Hitungan tanggal |
| `i18next` | 26.5.11 | i18n |
| `react-i18next` | 17.1.9 | i18n untuk React |
| `papaparse` | 5.7.0 | Export CSV |
| `recharts` | 3.10.1 | Grafik |
| `lucide-react` | 1.63.0 | Ikon |
| `clsx` | 2.1.1 | Helper className |
| `tailwind-merge` | 3.7.0 | Helper className |
| `class-variance-authority` | 0.7.1 | Varian komponen shadcn |

**Development (`devDependencies`)**

| Paket | Versi | Untuk |
|---|---|---|
| `vite` | 8.3.5 | Bundler (wajib ≥ 8 untuk Start) |
| `@vitejs/plugin-react` | 6.1.2 | React di Vite |
| `typescript` | 5.9.3 | Pemeriksa tipe (lihat catatan) |
| `@types/react` | 19.3.0 | Tipe React |
| `@types/react-dom` | 19.3.0 | Tipe React DOM |
| `@types/node` | 24.19.2 | Tipe Node 24 |
| `@types/papaparse` | 5.5.2 | Tipe papaparse |
| `tailwindcss` | 4.3.3 | CSS |
| `@tailwindcss/vite` | 4.3.3 | Plugin Tailwind untuk Vite |
| `tw-animate-css` | 1.4.0 | Animasi bawaan shadcn |
| `vite-tsconfig-paths` | 6.1.1 | Alias `~/` |
| `drizzle-kit` | 0.31.11 | `pull` skema dari DB lokal saja |
| `vitest` | 5.0.5 | Unit test |
| `tsx` | 4.23.15 | Menjalankan script TypeScript (seed) |
| `@faker-js/faker` | 10.6.0 | Data dummy seed (Fase 15) |

Catatan versi:
- **TypeScript dikunci di 5.9.3**, bukan 7.x (versi `latest` npm). TypeScript 7 adalah compiler generasi baru; dukungan tool lain (plugin editor, tool berbasis API TypeScript) belum tentu siap. Ganti hanya bila user memintanya.
- Node.js lokal user **v24.14.1** memenuhi syarat Start (`>= 22.12.0`).
- Bila npm atau shadcn (langkah 2.5) memasang versi lain untuk paket di tabel ini, **ubah ke versi tabel ini** di `package.json`, lalu minta izin untuk menjalankan ulang `npm install`.
- Beberapa paket memakai **versi mayor baru**: TanStack Table 9, Zod 4, Recharts 3, Vite 8, Vitest 5, lucide-react 1, i18next 26. Sebelum memakai API sebuah paket, baca dokumentasi versi tersebut (mis. lewat Context7 atau situs resminya). **Jangan** mengandalkan ingatan tentang API versi lama; bila contoh kode di rencana ini tidak cocok dengan API versi terpasang, ikuti dokumentasi resmi dan catat perbedaannya di `docs/progress.md`.

---

## 5. Konvensi kode

### 5.1 Umum

- TypeScript **strict** (`"strict": true`, `"noUncheckedIndexedAccess": true`).
- Alias impor `~/` = `src/` (contoh: `import { cn } from '~/lib/cn'`).
- Nama file: `kebab-case.ts`; komponen React: `PascalCase.tsx`; test di sebelah file: `nama.test.ts`.
- Satu fungsi publik = satu tanggung jawab. Fungsi di `src/lib/**` **tidak boleh** mengimpor apa pun dari `src/server/**`, React, atau Drizzle.
- Tidak ada `any`. Bila tipe dari DB belum jelas, pakai `unknown` lalu parse dengan Zod.
- Bahasa di kode: **Inggris** (G37). Contoh: komentar `// never send an empty IN () to MySQL`, error `throw new Error('Unknown GL table name: …')`, test `it('ignores cards with in_out = 0', …)`. Teks yang dilihat user di layar tetap lewat i18n (EN + ID).

### 5.2 Tipe dasar (dibuat di Fase 2 langkah 2.6, file `src/lib/finance/types.ts`)

```ts
export type Id = string            // every ID (G11)
export type Money = string         // raw money value from the DB, e.g. "1234567.89" (G12)
export type IsoDate = string       // "YYYY-MM-DD" (G13)

export type AccountGroup =
  | 'Liquid Assets' | 'Fixed Assets' | 'Other Assets'
  | 'Current Liabilities' | 'Long Term Liabilities' | 'Equity'
  | 'Revenue' | 'Other Revenue'
  | 'Cost Of Sales' | 'Expense' | 'Other Expense'

export type Lang = 'en' | 'id'

export type BasketKey = 'cash' | 'bank' | 'deposit' | 'inTransit' | 'fixedCost'

export type PeriodStatus = 'Open' | 'Pre Closed' | 'Closed'

export type Period = {
  periodeId: Id
  name: string
  startDate: IsoDate
  endDate: IsoDate
  status: PeriodStatus
  type: 0 | 1 | 2 | 3            // 0 regular · 1 period 13 · 2 pre-closed · 3 unknown
  tableName: string             // 'gl' or 'gl_2015' … 'gl_2020'
}

export type Entity = {
  locationId: Id
  code: string
  name: string
  isActive: boolean
  segmentDetailIds: Id[]        // gl_detail.<entity segment column> values that belong to this entity
}

/** Filter resolved by the server for one request. */
export type ResolvedFilter = {
  locationIds: Id[] | 'all'     // 'all' = no location filter (consolidate all data)
  segmentDetailIds: Id[] | 'all'
  d1: IsoDate                   // range start
  asOf: IsoDate                 // range end, never after today (data-model §1.2)
  periodIds: Id[]               // accounting periods in range (G14)
  compare: { d1: IsoDate; asOf: IsoDate; periodIds: Id[] } // comparison period (phase 7, step 7.2)
  today: IsoDate
}
```

### 5.3 Pola server function

Semua server function memakai pola ini (contoh lengkap ada di Fase 6 langkah 6.4):

```ts
// src/functions/metrics/revenue.fn.ts
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'

export const getRevenueFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(metricInputSchema)
  .handler(async ({ data }) => {
    // Server modules are imported DYNAMICALLY inside the handler so they stay out of the browser bundle:
    const { computeRevenue } = await import('~/server/services/revenue.service')
    // 1. resolve the filter: const filter = await resolveFilter(data)   (src/server/context.ts, also imported dynamically)
    // 2. compute: return computeRevenue(filter)   (the service calls repos + src/lib/finance/*.ts)
    // 3. result = plain serializable object (string/number/boolean/array/object)
  })
```

- Method `GET` untuk baca, `POST` untuk login/logout/simpan Settings/ganti preferensi.
- Hasil server function **tidak boleh** berisi `Decimal`, `Date`, `Map`, `Set`, atau `bigint`. Uang dikembalikan sebagai string (`Money`), tanggal sebagai `IsoDate`.

### 5.4 Pola query (TanStack Query)

```ts
// src/queries/metrics.queries.ts
import { queryOptions } from '@tanstack/react-query'
import { getRevenueFn } from '~/functions/metrics/revenue.fn'
import { qk } from './keys'
import type { MetricInput } from '~/lib/filters/search-schema'

export const revenueQuery = (input: MetricInput) =>
  queryOptions({
    queryKey: qk.metric('revenue', input),
    queryFn: () => getRevenueFn({ data: input }),
  })
```

Route memanggil `context.queryClient.ensureQueryData(revenueQuery(input))` di `loader`, dan komponen memanggil `useSuspenseQuery(revenueQuery(input))`.

### 5.5 Pola repository

```ts
// src/server/repo/example.repo.ts
import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'

export async function example(periodIds: string[]): Promise<{ coaId: string; debet: string; credit: string }[]> {
  if (periodIds.length === 0) return []          // never send an empty IN () to MySQL
  return rows(sql`
    SELECT d.coa_id AS coaId, SUM(d.debet) AS debet, SUM(d.credit) AS credit
    FROM gl g
    JOIN gl_detail d ON d.gl_id = g.gl_id
    WHERE g.posted_status = 1 AND g.canceled_date IS NULL
      AND g.period_id IN (${sql.join(periodIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY d.coa_id
  `)
}
```

- Setiap fungsi repo yang menerima daftar ID **wajib** mengembalikan `[]` lebih dulu bila daftarnya kosong.
- Alias kolom ditulis `camelCase` dengan `AS` supaya hasil langsung cocok dengan tipe TypeScript.
- Hasil `SUM` bisa `null` bila tidak ada baris → bungkus `COALESCE(SUM(x), 0)` bila dibutuhkan angka, atau tangani `null` di JS.

### 5.6 Nama tabel GL dinamis (arsip)

Nama tabel tidak bisa jadi parameter `?`. Aturannya (diimplementasikan di Fase 5 langkah 5.5, `src/server/db/gl-tables.ts`):

```ts
const GL_TABLE_RE = /^gl(_20\d{2})?$/          // 'gl', 'gl_2015', …, 'gl_2099'
export function glTablesOf(tableName: string): { gl: string; glDetail: string } {
  if (!GL_TABLE_RE.test(tableName)) throw new Error(`Unknown GL table name: ${tableName}`)
  const suffix = tableName.slice(2)                 // '' or '_2015'
  return { gl: tableName, glDetail: `gl_detail${suffix}` }
}
```

Di SQL, nama tabel dimasukkan dengan `sql.identifier(nama)` (bukan `${nama}` biasa, bukan `sql.raw`).

---

## 6. Fase implementasi

Setiap fase ada di file sendiri (klik judul untuk membuka). Nomor langkah di dalam file (mis. "Langkah 7.3") = nomor fase + urutan langkah, jadi "langkah 7.3" selalu ada di `07_phase-…md`.

Ringkasan urutan:

| Fase | Judul & file | Hasil akhir |
|---|---|---|
| 0 | [Prasyarat & keamanan](./00_phase-prasyarat-keamanan.md) | `.gitignore`, `.env.example`, `progress.md`, kredensial aman |
| 1 | [Scaffold manual](./01_phase-scaffold-manual.md) | Proyek TanStack Start kosong yang bisa `npm run dev` |
| 2 | [Neraca UI](./02_phase-neraca-ui.md) | Token CSS light/dark, font, kelas `nr-*`, komponen dasar |
| 3 | [App shell & route](./03_phase-app-shell-route.md) | Sidebar, top bar, semua halaman (masih kosong) |
| 4 | [i18n & util format](./04_phase-i18n-format.md) | EN/ID, format angka/tanggal/CSV + test |
| 5 | [DB layer](./05_phase-db-layer.md) | Koneksi `mysql2` + Drizzle, skema, helper SQL |
| 6 | [Auth](./06_phase-auth.md) | Login `sysuser`, session, guard, logout |
| 7 | [Filter global](./07_phase-filter-global.md) | Search params Zod, EntityPicker, PeriodSelect |
| 8 | [Pohon CoA, keranjang, Settings](./08_phase-coa-keranjang-settings.md) | Halaman Pemetaan Akun yang menyimpan ke `system_main` |
| 9 | [Repo & server function metrik](./09_phase-metrik-repo-server-function.md) | Semua angka metrik + test |
| 10 | [Halaman metrik](./10_phase-halaman-metrik.md) | UI lengkap tiap halaman |
| 11 | [Drill-down side sheet](./11_phase-drill-down.md) | Rincian sampai jurnal, state di URL |
| 12 | [Export CSV & print](./12_phase-export-print.md) | Dialog CSV, print A4 |
| 13 | [Panel "Data perlu dicek"](./13_phase-data-perlu-dicek.md) | Temuan kualitas data & rekonsiliasi |
| 14 | [Cache periode Closed](./14_phase-cache-periode-closed.md) | Agregat periode tutup buku di-cache |
| 15 | [Seed DB lokal (opsional)](./15_phase-seed-db-lokal.md) | Data dummy deterministik |
| 16 | [Verifikasi akhir](./16_phase-verifikasi-akhir.md) | Laporan cocok dengan ERP |

---

## 7. O-item terbuka & default sementara

Pelaksana memakai default di bawah tanpa menunggu jawaban. Bila user memberi jawaban berbeda, ikuti jawaban user dan catat di `docs/progress.md`.

| # | Pertanyaan (decisions.md) | Default yang dipakai pelaksana | Dampak di rencana |
|---|---|---|---|
| O2 | Apakah entitas benar-benar didaftarkan di `pos_location`? | Ya, 1 lokasi = 1 entitas (D8) | Langkah 7.3 |
| O3 | Segment Lokasi bertipe NBAL → saldo kas/utang per entitas bisa janggal | Tampilkan apa adanya + ikon info pada saldo negatif | Langkah 9.3, 9.6 (K11) |
| O4 | Penanda akun OCI klien lain | Env `PNL_OCI_ROOT_CODES` (default `9`) | Langkah 5.1, 9.5 |
| O5 | Arti `coa_budget.segment1_id` | Sama dengan Lokasi (filter entitas memakai `segmentDetailIds`) | Langkah 9.12 |
| O6 | Pembayaran biaya langsung tanpa tagihan AP | Dihitung bila lawannya Cost Of Sales / Expense | Langkah 9.7 (K14) |
| O8 | Password `sysuser` plain text | Verifikasi langsung dengan pengaman §9.3 | Fase 6 |
| O10 | Database mana (±72 DB di server kantor) | Diatur lewat `DATABASE_URL`; development memakai DB lokal | Langkah 0.4 |
| O11 | Index tambahan & read replica | Script `docs/sql/dashboard-indexes.sql` **dijalankan manual oleh user**; AI tidak menjalankannya | Fase 9 (performa) |
| O13 | Celah `cash_flow_setup` klien | Ikuti setup apa adanya; yang tak terpetakan → "Belum terklasifikasi" | Langkah 9.6 |

---

## 8. Lampiran

### Lampiran A — Glosarium super sederhana

| Istilah | Arti sederhana |
|---|---|
| Debit / Kredit | Dua sisi pencatatan. Harta & biaya bertambah di debit; utang, modal & pendapatan bertambah di kredit. Total debit selalu sama dengan total kredit |
| Jurnal (`gl`) | Satu catatan transaksi, berisi beberapa baris debit/kredit (`gl_detail`) |
| Posted | Jurnal yang sudah disahkan. Hanya ini yang dihitung |
| CoA (Chart of Accounts) | Daftar semua akun, berbentuk pohon folder |
| HEADER / POSTABLE | HEADER = folder (tidak menerima jurnal); POSTABLE = akun daun tempat jurnal dicatat |
| Saldo | Jumlah uang di sebuah akun pada satu tanggal ("foto") |
| Mutasi | Perubahan saldo selama suatu rentang waktu ("video") |
| Saldo awal | Saldo di awal periode, disimpan ERP saat tutup buku |
| Periode | Bulan akuntansi |
| Periode 13 | Periode tambahan akhir tahun untuk penyesuaian/audit |
| Tutup buku (Closed) | Periode yang sudah dikunci; angkanya tidak berubah lagi |
| Entitas | Satu lokasi/anak perusahaan (`pos_location`) |
| Konsolidasi | Menjumlahkan beberapa entitas. Di proyek ini tanpa eliminasi |
| Eliminasi intercompany | Menghapus transaksi antar anak perusahaan supaya tidak dihitung dua kali. **Tidak dipakai** di proyek ini |
| Revenue / Pendapatan | Uang yang dihasilkan dari penjualan |
| COGS / HPP | Harga pokok barang yang terjual |
| OPEX / Beban | Biaya operasional (gaji, sewa, listrik, …) |
| Laba Kotor | Pendapatan − HPP |
| Laba Usaha | Laba Kotor − Beban operasional |
| Laba Bersih | Laba Usaha + pendapatan lain − beban lain |
| OCI | Penghasilan komprehensif lain (mis. selisih nilai investasi); dipisah di bawah Laba Bersih |
| Cash Position / Posisi Kas | Kas + Bank pada satu tanggal |
| Kas & setara kas | Kas + Bank + Deposito (dipakai Arus Kas) |
| Dana dalam pencairan | Uang dari pembayaran kartu/QRIS/e-wallet yang belum masuk rekening |
| Arus Kas (Cash Flow) | Uang masuk dan keluar, dibagi 3 laci: Operasional, Investasi, Pendanaan |
| AP / Utang Usaha | Tagihan dari supplier yang belum kita bayar |
| AR / Piutang | Tagihan ke pelanggan yang belum mereka bayar |
| Item | Baris kartu AP/AR yang punya saldo (tagihan, retur, memo) |
| Kartu pelunasan | Pembayaran/penyesuaian yang mengurangi item |
| Retur | Pengembalian barang; mengurangi tagihan |
| Memo | Koreksi nilai tagihan (bisa menambah atau mengurangi) |
| Jatuh tempo | Tanggal paling lambat tagihan harus dibayar |
| Aging | Pengelompokan tagihan berdasarkan umur terhadap jatuh tempo |
| Voucher pembayaran | Pengajuan bayar tagihan (belum tentu sudah dibayar) |
| Outstanding | Sisa yang belum lunas |
| Budget / Anggaran | Rencana angka per akun per bulan |
| Variance | Selisih Actual − Budget |
| Runway | Berapa bulan kas cukup bila pengeluaran bersih seperti 3 bulan terakhir |
| Margin | Laba dibagi pendapatan (dalam persen) |
| Current Ratio | Harta lancar ÷ utang lancar; > 1 berarti harta lancar lebih besar |
| NBAL | Segmen yang tidak dipaksa seimbang per lokasi; saldo per entitas bisa terlihat aneh |
| Subledger | Buku pembantu (kartu AP/AR) yang seharusnya sama dengan akun kontrol di GL |
| Rekonsiliasi | Mencocokkan dua sumber angka yang seharusnya sama |

### Lampiran B — Pemetaan metrik

| Metrik | Halaman | Server function | Service | Repo | Logika & test |
|---|---|---|---|---|---|
| Ringkasan | `/summary` | `getSummaryFn` | `summary.service.ts` | (memakai service lain) | — |
| Revenue | `/revenue` | `getRevenueFn` | `revenue.service.ts` | `gl.repo.ts` | `revenue.ts` · `revenue.test.ts` |
| Cash Position + Dana dalam pencairan | `/cash-position` | `getCashPositionFn` | `cash-position.service.ts`, `balance.service.ts` | `gl.repo.ts`, `bank-payment.repo.ts` | `balance.ts` · `balance.test.ts` |
| Cash Flow | `/cash-flow` | `getCashFlowFn` | `cash-flow.service.ts` | `cashflow.repo.ts` | `cashflow.ts` · `cashflow.test.ts` |
| Expense Paid | `/cash-flow` (tab) | `getExpensePaidFn` | `expense-paid.service.ts` | `apar.repo.ts`, `cashflow.repo.ts` | `expense-paid.ts` · `expense-paid.test.ts` |
| Profit & Loss | `/profit-loss` | `getPnlFn` | `pnl.service.ts` | `gl.repo.ts` | `pnl.ts` · `pnl.test.ts` |
| Monthly Fixed Cost | `/profit-loss` (tab) | `getFixedCostFn` | `fixed-cost.service.ts` | `gl.repo.ts` | `fixed-cost.ts` · `fixed-cost.test.ts` |
| Outstanding Liability (AP Aging) | `/payables` | `getApAgingFn` | `ap-aging.service.ts` | `apar.repo.ts` | `apar.ts`, `aging.ts` · `apar.test.ts`, `aging.test.ts` |
| AR Aging | `/receivables` | `getArAgingFn` | `ar-aging.service.ts` | `apar.repo.ts` | `apar.ts`, `aging.ts` · `apar.test.ts`, `aging.test.ts` |
| Daily Payment Plan | `/payment-plan` | `getPaymentPlanFn` | `payment-plan.service.ts` | `apar.repo.ts`, `bank-payment.repo.ts` | `payment-plan.ts` · `payment-plan.test.ts` |
| Budget vs Actual | `/budget` | `getBudgetFn` | `budget.service.ts` | `budget.repo.ts`, `gl.repo.ts` | `budget.ts` · `budget.test.ts` |
| Cash Runway & Rasio | `/cash-position`, `/summary`, `/profit-loss` | `getRunwayFn` | `runway.service.ts` | (memakai service lain) | `runway.ts` · `runway.test.ts` |
| Settings | `/settings/account-mapping` | `getAccountMappingFn`, `saveAccountMappingFn`, `getCoaTreeFn` | — | `settings.repo.ts`, `coa.repo.ts` | `coa-tree.ts`, `basket-resolver.ts`, `mapping-schema.ts`, `mapping-validate.ts` (+ test) |
| Data perlu dicek | panel TopBar | `getDataChecksFn` | `data-checks.service.ts` | `data-checks.repo.ts` | — |
| Drill-down | semua halaman | `getDrillFn` | `drill.service.ts` | `gl.repo.ts`, `apar.repo.ts`, `bank-payment.repo.ts` | — |

### Lampiran C — Checklist rilis ke DB klien

Dilakukan oleh user / tim DB, bukan oleh AI.

- [ ] Versi **server** dicek dengan `SELECT VERSION();` (harus 5.7.x) (O9).
- [ ] Semua query lulus di MySQL 5.7.44 (`mysql57-compat.int.test.ts`).
- [ ] User DB dashboard dibuat: `SELECT` pada tabel `drizzle.config.ts` + `INSERT, UPDATE` **hanya** pada `system_main` (D13).
- [ ] Index `docs/sql/dashboard-indexes.sql` dijalankan manual di luar jam sibuk, satu blok per tabel, setelah backup (O11).
- [ ] `DATABASE_URL` mengarah ke database holding yang benar (O10); TLS aktif bila lewat jaringan publik (§9.2.1).
- [ ] `SESSION_SECRET` baru (≥ 32 karakter acak), berbeda dari development.
- [ ] `APP_TIMEZONE` sesuai lokasi klien (K5).
- [ ] Pemetaan akun di halaman Pemetaan Akun sudah disimpan (banner "Selesaikan pengaturan akun" hilang).
- [ ] Verifikasi V1–V7 (langkah 16.2) diulang di DB klien.
- [ ] Tim finance sudah membaca daftar O3 (NBAL) dan O13 (celah `cash_flow_setup`).

---

## 9. Catatan untuk user

Hal di bawah ditemukan saat menyusun rencana. Rencana memakai **default** yang tertulis; mohon konfirmasi atau koreksi sebelum fase terkait dikerjakan. Nomor K mengikuti urutan penemuan; kedua tabel bersama-sama berisi K1–K26.

### 9.1 Pertentangan antar dokumen

| # | Temuan | Default di rencana | Fase |
|---|---|---|---|
| K1 | Contoh SQL Revenue di `data-model.md` §6 memakai `trans_date`, sedangkan D18 menyebut angka bulanan memakai `period_id` | `period_id` (D18) | 9.4 |
| K2 | §4.1 menyebut tabel arsip `gl_20XX` "di prototype tidak relevan", sedangkan §2.2 `periode` & D26 menyebut **wajib** membaca sesuai `table_name` | Wajib (G15) | 5.5, 9.1 |
| K3 | §7.2 seed menyebut tabel `coa_opening_balance`, padahal §2.2 & D19 memakai `coa_opening_balance_location` (yang lama tidak dipakai) | `coa_opening_balance_location` | 15.2 |
| K12 | §8 menulis cek "Kas awal + net = kas akhir **= Cash Position**", padahal kas & setara kas Cash Flow = Kas + Bank + **Deposito**, sedangkan Cash Position = Kas + Bank saja | Cek identitas memakai Kas + Bank + Deposito. Selain itu, arus kas dihitung per `period_id` sedangkan saldo per `trans_date`; jurnal backdated/Periode 13 bisa membuat selisih → ditampilkan sebagai Notice, bukan disembunyikan | 9.6 |
| K13 | §6.5(a) memfilter kartu bayar `in_out = −1`, tetapi catatan di bawahnya meminta kartu type 10 `in_out = +1` dihitung sebagai pengurang | `in_out IN (−1, 1)` (kartu +1 otomatis mengurangi) | 9.7 |
| K14 | Expense Paid (b): `decisions.md` §5 "biaya operasional saja (COGS + OPEX)", `data-model.md` §6.5(b) juga menyebut `Other Expense` dengan pengecualian akun penyusutan/bunga/pajak (yang belum punya penanda) | COGS + Expense saja | 9.7 |
| K18 | `decisions.md` §2 menyebut "session cookie terenkripsi bawaan TanStack Start"; dokumentasi Start terbaru memakai `iron-session` dengan helper cookie bawaan Start | `iron-session` + `getCookie`/`setCookie` Start (tujuan sama) | 6.1 |
| K26 | `data-model.md` tidak punya judul `### 6.3` untuk Cash Flow; isinya berada setelah §6.2 (mulai paragraf "Referensi ERP: `web/fin/freport/cashflow_report.jsp`" sampai sebelum §6.4) | Rencana menyebut bagian itu "§6.3". Sebaiknya judul `### 6.3 Cash Flow` ditambahkan di `data-model.md` (tidak diubah oleh rencana ini) | 9.6 |
| K19 | D3 menyebut development memakai DB lokal + **script seed**; kenyataannya user sudah memakai DB lokal `demo` (data dev nyata), dan T2 (angka pasti dari seed) baru bisa setelah seed ada | Fase 15 opsional; sebelum itu test integrasi hanya memeriksa tidak error & identitas | 9.15, 15 |

### 9.2 Hal yang belum diputuskan dokumen

| # | Pertanyaan | Default di rencana | Fase |
|---|---|---|---|
| K4 | ID baris baru di `system_main` (`sysmain_id`) dibuat ERP dengan `OIDGenerator` (waktu + `0x0100000000000000 × APP_ID_INDEX` + 1 digit acak). Berapa `APP_ID_INDEX` yang aman dipakai dashboard? | Env `ERP_APP_ID_INDEX = 7` (default ERP) | 8.5 |
| K5 | Zona waktu "hari ini". Contoh JSON di §5.2 memakai `+08:00` (WITA) | Env `APP_TIMEZONE = Asia/Jakarta` | 4.4, 7.3 |
| K6 | `user_status` mana yang boleh login? ERP: 0 New, 1 Logged out, 2 Logged In, 3 Password Expired, 4 Inactive | Boleh 0, 1, 2; tolak 3 & 4 | 6.3 |
| K7 | Periode `type = 2` (pre-closed) dan `type = 3` (belum diketahui) | Tidak ikut preset | 7.2 |
| K8 | Halaman untuk Expense Paid, Fixed Cost, Runway (sidebar Neraca UI hanya 9 halaman) | Expense Paid = tab di Arus Kas; Fixed Cost = tab di Laba Rugi; Runway di Posisi Kas & Ringkasan | 3.2, 10.3 |
| K9 | Kolom pencarian & notifikasi di TopBar (README TopBar) | Pencarian tidak dibuat; notifikasi = panel "Data perlu dicek" | 3.3, 13 |
| K10 | Akun OCI: §6.4 hanya mengeluarkan OCI dari Other Revenue. Bila ada akun OCI di grup lain, akan terhitung dua kali | Akun OCI dikeluarkan dari **semua** baris P&L | 9.5 |
| K11 | Arus Kas dengan filter entitas: baris kas milik entitas lain di jurnal yang sama (mis. transfer dari kantor pusat) | Dianggap akun lawan → biasanya "Belum terklasifikasi" | 9.6 |
| K15 | Status rencana bayar bila tagihan masih bersisa tetapi vouchernya `Paid` | Tidak dihitung; status dari voucher lain (`Posted`/`Partialy Paid` > `Not Posted` > Belum diajukan) | 9.8 |
| K16 | Bucket aging untuk baris tanpa `due_date` (mis. pembayaran belum dialokasikan) | Pakai tanggal transaksi sebagai jatuh tempo | 9.8 |
| K17 | Angka pembanding KPI ("Bulan lalu …"). F3 melarang toggle "bandingkan periode", tetapi KpiCard Neraca UI selalu punya baris pembanding | Pembanding otomatis tetap (tabel langkah 7.2), tanpa toggle | 7.2, 10.3 |
| K20 | Dana belum cair memakai `bank_payment.status = 0` (status hari ini) sesuai §6.2, sehingga untuk `asOf` lampau angkanya kurang tepat | Ikuti §6.2 apa adanya | 9.3 |
| K21 | Versi TypeScript: `latest` di npm adalah 7.0.2 (compiler generasi baru) | Kunci di 5.9.3 | 1.3 |
| K22 | `entity = all`: apakah baris "Tanpa lokasi" & lokasi tidak dikenal ikut? | Ikut (tanpa filter lokasi) supaya total sama dengan laporan ERP seluruh perusahaan | 7.3 |
| K23 | User DB lokal `claude_ro` read-only; menyimpan Settings di DB lokal butuh hak `INSERT, UPDATE` pada `system_main` | User menyiapkan user DB di `.env` dengan hak itu, atau test simpan dilewati | 8.7 |
| K24 | Rentang grafik bulanan (README CashflowChart: select milik kartu) | Search param `chart` = `ytd` (default) / `last-12m` | 10.1 |
| K25 | Token entitas di URL memakai `pos_location.code`; belum dipastikan unik dan hanya berisi huruf, angka, `_`, `.`, `~`, `-` (regex langkah 7.1) | Dicek sekali (langkah 7.3); bila tidak unik atau ada karakter lain, berhenti dan tanya user | 7.1, 7.3 |

