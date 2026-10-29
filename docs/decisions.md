# Keputusan Proyek — Finance Dashboard (Prototype)

> Status: **disepakati** · Tanggal sesi discovery: **28 Oktober 2026**
> Dokumen pendamping: [`data-model.md`](./data-model.md) (struktur data & rumus metrik) · [`plans/README.md`](../plans/README.md) (rencana implementasi langkah demi langkah, satu file per fase)

Dokumen ini mencatat **apa** yang diputuskan dan **kenapa**, supaya tidak perlu dibahas ulang.
Kalau ada keputusan yang berubah, ubah baris di tabel dan tambahkan catatan di bagian [Riwayat Perubahan](#riwayat-perubahan).

---

## 1. Konteks

- Klien: perusahaan **holding** yang membawahi banyak entitas/anak perusahaan.
- Produk: **prototype full-stack** Finance Dashboard berskala enterprise, dibangun dengan **TanStack Start** yang **membaca langsung database ERP** (MySQL/MariaDB, ERP buatan sendiri) lewat *server function*.
- Saat development, database yang dipakai adalah **MySQL/MariaDB lokal** berisi tabel ERP versi ramping (nama tabel & kolom sama) yang diisi **script seed data dummy**. Untuk pindah ke database kantor cukup mengganti connection string.

---

## 2. Tech Stack

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| Framework | **TanStack Start** (React + Vite + TypeScript strict) | Full-stack: halaman + *server function* untuk akses database |
| Rendering | **SSR penuh** | Data diambil di server lalu dikirim sebagai HTML |
| Routing & state URL | TanStack Router (bawaan Start, file-based) + search params divalidasi Zod | Filter tersimpan di URL → bisa di-bookmark & dibagikan |
| Data fetching | TanStack Query + integrasi SSR (`@tanstack/react-router-ssr-query`) | Cache, loading/error state, hidrasi dari server |
| Akses database | **Drizzle ORM** (utamakan core query builder) + driver `mysql2` | Tim kantor sudah memakai Drizzle; skema di-*introspect* dari DB lokal yang strukturnya sama. ⚠️ **Dilarang** `drizzle-kit push`/`migrate` ke DB ERP. Batasan MySQL 5.7: D23 |
| Database | ERP klien: **MySQL 5.7.44** · development: MySQL/MariaDB **lokal di laptop** (DB `demo` = MariaDB 10.4) | SQL wajib kompatibel MySQL 5.7 (D23) |
| Session login | Session cookie terenkripsi bawaan TanStack Start (`httpOnly`, `secure`, `SameSite=Lax`) | Lihat U6 |
| UI | Tailwind CSS + shadcn/ui | Ditetapkan sejak awal |
| Chart | Recharts (via komponen `chart` shadcn) | Sudah menyatu dengan tema shadcn |
| Tabel | TanStack Table (+ TanStack Virtual untuk daftar panjang) | Sort, expand baris, ribuan baris tanpa lag |
| Data dummy | Script seed Node + `@faker-js/faker` (seed tetap) → menulis ke DB lokal | Deterministik, bisa diulang |
| Hitungan uang | `decimal.js` (atau dinero.js) | Menghindari error desimal JavaScript (`0.1 + 0.2 ≠ 0.3`); DECIMAL dari MySQL dibaca sebagai teks |
| Tanggal | date-fns | Ringan, tree-shakable |
| i18n | react-i18next | EN (default) + ID |
| CSV | papaparse | Export CSV |
| PDF/Print | CSS `@media print` + "Save as PDF" bawaan browser | Paling cepat, chart tetap tajam (vektor) |
| Testing | Vitest (unit test logika angka) | Logika angka paling berisiko kalau salah |

---

## 3. Data & Konsolidasi

| # | Keputusan | Alasan / Catatan |
|---|---|---|
| D1 | Mata uang tampilan **IDR saja** | Kolom `debet`/`credit` di `gl_detail` **sudah dalam Rupiah** (terkonfirmasi), walau ada akun valas |
| D2 | Konsolidasi = **penjumlahan biasa** entitas terpilih, **tanpa eliminasi intercompany** | Diputuskan user. Data dummy **tidak** membuat transaksi antar entitas supaya angka tidak menggelembung. ⚠️ Saat memakai data asli, akun "Pihak Berelasi" (1133, 1135, 2102, 2112) perlu dibahas ulang |
| D3 | Development memakai **MySQL/MariaDB lokal di laptop** yang diisi **script seed** (seed tetap → data selalu sama) | DB dev kantor terlalu sedikit isinya (30 jurnal, tanpa AP). Tidak menyentuh data asli |
| D4 | Data dummy di **level transaksi** (jurnal `gl` + `gl_detail`, kartu `ap_ar_card`) | Drill-down sampai transaksi & angka antar halaman pasti konsisten |
| D5 | DB lokal **meniru tabel ERP asli versi ramping** (nama tabel & kolom sama) | Query yang sama langsung jalan di DB kantor |
| D6 | Jurnal aktif = **`gl` / `gl_detail`** | `journal`/`journal_detail` adalah versi lama |
| D7 | Subledger AP/AR = **`ap_ar_card` + `ap_ar_card_detail`** | `ar_card_*` / `ap_card_*` **tidak dipakai** |
| D8 | **1 lokasi = 1 entitas**: entitas = baris **`pos_location`** | Jalur dari jurnal: `gl_detail.segment1_id` → `segment_detail.location_id` → `pos_location`; dari AP/AR: `ap_ar_card.location_id`. DB `demo` memakai **87 lokasi** di AP |
| D16 | Sisa AP/AR dihitung **hanya** dari **`ap_ar_card` + `ap_ar_card_detail`** (aturan `sisa = amount × in_out + Σ detail`), **bukan** dari `payment_status` dan **tidak** ditambah `bankpo_payment_detail` | Sama dengan rumus ERP (`DbApArCard.getInvoiceAdjAndPayment`). `payment_status=2` sudah terisi saat tagihan masuk voucher, sebelum dibayar; `bankpo_payment_detail` duplikat dari kartu bayar (hitung ganda). Detail: data-model.md §2.2, §6.6 |
| D23 | Semua SQL dashboard **kompatibel MySQL 5.7**: tanpa CTE (termasuk rekursif), window function, `LATERAL`, `REGEXP_REPLACE`; `GROUP BY` lengkap (`ONLY_FULL_GROUP_BY`); Drizzle utamakan core query builder (relational API hanya dengan `mode: 'planetscale'`). Pohon CoA & roll-up HEADER dihitung di JavaScript. Detail: data-model.md §9.2.1 | Klien memakai **MySQL 5.7.44** (dikonfirmasi user). DB lokal `demo` (MariaDB 10.4) menerima CTE & window function → bisa lolos di dev tapi gagal di klien |
| D22 | Voucher pembayaran (`bankpo_payment` type 0) dipakai sebagai **status rencana bayar** tagihan: `Belum diajukan` / `Diajukan` / `Disetujui, menunggu bayar` | Menambah nilai Daily Payment Plan & Outstanding Liability tanpa mengubah angka sisa utang |
| D26 | Laba Rugi mengikuti versi **"generate"** ERP (`profitloss_segmentgen.jsp` → `SessGeneratePNL`): hanya jurnal **posted**, per `gl.period_id` × akun × lokasi, **YTD = Σ bulan** Jan s.d. bulan terpilih, tabel GL mengikuti `periode.table_name` (arsip `gl_20xx`). `balance_gl` (cache ERP) hanya untuk rekonsiliasi | Versi lain di menu ERP ikut menghitung jurnal draft dan memakai saldo awal P&L dari `coa_opening_balance_location` yang di DB `demo` **tidak cocok** dengan GL. Detail: data-model.md §6.4 |
| D27 | Cash Flow memakai **`cash_flow_setup` klien** sebagai sumber klasifikasi (sama dengan ERP: akun lawan dicocokkan lewat `account_group` + `sub_account_group` akun wakil), dengan dua perbaikan **disetujui user**: (1) **alokasi proporsional ke kas** untuk jurnal campuran, (2) kas yang lawannya tidak terpetakan tampil sebagai baris **"Belum terklasifikasi"** ⚠️. Aturan cadangan bawaan hanya dipakai bila setup kosong/tidak valid (seperti DB `demo`). Kas & setara kas = keranjang Kas + Bank + Deposito; hanya jurnal posted; wajib lolos cek *kas awal + arus kas = kas akhir* | Setup klien valid (contoh dari user); cara ERP menghitung seluruh baris lawan & mengabaikan yang tak terpetakan membuat kas akhir ERP bisa meleset. Detail: data-model.md §2.2, §6.3 |
| D28 | Budget vs Actual memakai `coa_budget.budget_type = 1` (Accounting), **`bgt_month` 0-based** (Jan = 0), per lokasi (`segment1_id`); budget HEADER = Σ anak; YTD = Σ bulan 0…(bulan−1). `budget_type = 2` (Operasional, Revenue saja) tampil terpisah sebagai "Target Operasional" | Sama dengan `SessBudgetComparisson` ERP; terverifikasi di DB `demo` (bgt_month 0–11). Detail: data-model.md §6.10 |
| D30 | `bank_payment` (type 1/2, register pencairan kartu/QRIS/e-wallet POS) dipakai untuk: rincian **Dana dalam pencairan** per channel/lokasi/tanggal + umur dana belum cair (> 3 hari ⚠️); **estimasi tanggal cair** per channel di Daily Payment Plan (rata-rata `payment_date − transaction_date` 90 hari terakhir, default 1 hari); cek rekonsiliasi dengan saldo GL keranjang `inTransit`. Angka utama Dana dalam pencairan tetap dari GL. Kolom `piutang`/`expense` (MDR) tidak dipakai | DB `demo`: 3,44 juta transaksi, dana cair ±1 hari; `due_date` = tanggal transaksi (tak berguna); kolom MDR kosong sejak ±Sep 2025. Detail: data-model.md §2.2, §6.2, §6.9 |
| D29 | Saldo awal akun neraca dari `coa_opening_balance_location`; metode Neraca Saldo ERP (Σ GL posted sebelum periode, `tb_report.jsp`) dipakai sebagai **cek rekonsiliasi & cadangan** | Keduanya terbukti sama untuk akun neraca di DB `demo`; untuk akun P&L tabel saldo awal tidak cocok → tidak dipakai. Detail: data-model.md §4.5 |
| D25 | AR Aging **mengikuti AR Aging ERP** (`web/fin/ar/ar_aging.jsp` → `SessApArCard.listAgingAr`): item = type 0,3,4,5; pelunasan = type 1 (bayar) & 2 (retur); retur tanpa detail masuk saldo; **pembayaran pelanggan tanpa alokasi tidak dihitung** (sama dengan ERP, ditampilkan di panel "Data perlu dicek" bila ada). Bucket & saldo neto sama dengan D24. Detail: data-model.md §6.7 | Total dashboard harus sama dengan AR Aging ERP |
| D24 | Outstanding Liability & aging **mengikuti AP Aging ERP** (`ap_aging.jsp` → `SessApArCard.listAgingAp`): angka utama = saldo **neto** per vendor = item (type 0,1,2,3,4,5,6,12) ± pelunasan (type 7,8,9,10,11,13,14) **+ pembayaran belum dialokasikan**; bucket "Sudah jatuh tempo" 0–30/31–60/61–90/>90 (jatuh tempo hari ini = 0–30) & "Akan jatuh tempo" 1–30/31–60/61–90/>90. Dua bug ERP tidak ditiru (join detail berlipat, batas bucket berjam). Detail: data-model.md §6.6 | Total dashboard harus sama dengan laporan AP Aging ERP. DB `demo`: pembayaran belum dialokasikan ±Rp4,27 M — tanpa itu utang terlihat lebih besar |
| D9 | Tabel `bank_account`, tabel **`department`** (beserta semua kolom `department_id`), dan kolom `acc_link.location_id` **tidak dipakai** → dashboard **tanpa** dimensi departemen; rincian biaya lewat pohon CoA & entitas | Info dari user |
| D10 | `acc_link` **tidak dipakai** untuk menentukan akun kas | Terbukti berisi daftar akun lawan untuk dropdown formulir, bukan klasifikasi akun |
| D11 | Semua **ID** (`coa_id`, `gl_id`, `location_id`, …) diperlakukan sebagai **string** (`mysql2`: `supportBigNumbers` + `bigNumberStrings`) | ID seperti `504404509311573860` melebihi batas aman angka JavaScript (±9×10¹⁵) → digit terakhir berubah diam-diam |
| D12 | **Agregasi dikerjakan di SQL** (`SUM … GROUP BY`), bukan di JavaScript | `gl_detail` asli bisa jutaan baris |
| D13 | Hak akses user DB dashboard: **SELECT saja**, kecuali **INSERT/UPDATE di `system_main`** (untuk Settings) | Dashboard tidak boleh bisa mengubah data ERP |
| D14 | Kredensial DB hanya di **environment variable server**; semua query **berparameter** | Tidak pernah sampai ke browser; anti SQL injection |
| D15 | Dexie **tidak dipakai** | Semua data dari DB lewat server function; preferensi kecil (tema, bahasa) di cookie |
| D17 | Rumus GL **mengikuti laporan resmi ERP** (Neraca `web/fin/freport/neracabysegment.jsp`, Buku Besar `glreport.jsp` → `gl.jsp`, logika di `DbGlDetail` & `DbCoaOpeningBalanceLocation`) | Angka dashboard harus sama dengan laporan yang sudah dipakai tim finance |
| D18 | Angka **bulanan** memakai `gl.period_id`; angka **harian** memakai `gl.trans_date` | Sama seperti ERP; menangani jurnal backdated & Periode 13 (data-model.md §4.6) |
| D19 | Saldo awal dari **`coa_opening_balance_location`** (per periode × akun × lokasi); HEADER dijumlah lewat `gl_detail.coa_levelN_id` | Algoritma Neraca/Buku Besar ERP (data-model.md §4.5) |
| D20 | Hasil agregat periode **`Closed`** di-cache | Periode tutup buku tidak berubah; `gl_detail` ±13,6 juta baris |
| D21 | Segmen entitas = segmen dengan **`segment.count = 1`** | Cara ERP memilih segmen Lokasi; tidak meng-hardcode `segment1_id` |

---

## 4. Filter & Navigasi

| # | Keputusan | Catatan |
|---|---|---|
| F1 | Entitas: **±87 lokasi** (DB `demo`), daftar datar (tanpa grup), **multi-select** + pencarian + "Pilih semua / Kosongkan" | URL memakai `all` atau daftar `location_id` dipisah koma (string, bukan kode pendek) — diubah 2026-10-29 atas permintaan user |
| F2 | Tahun buku **Januari–Desember** | |
| F3 | Periode: **preset cepat saja** (Bulan ini, Bulan lalu, Kuartal ini, YTD, 12 bulan terakhir) | Tidak ada rentang bebas & tidak ada toggle "bandingkan periode" |
| F4 | Daily Payment Plan memakai **preset ke depan**: 7 / 14 / 30 hari | Payment plan melihat masa depan, bukan masa lalu |
| F5 | Drill-down **hybrid**: baris kategori bisa di-expand; daftar transaksi muncul di **side sheet**; state sheet disimpan di URL | Konteks halaman tidak hilang & tetap bisa dibagikan |

---

## 5. Metrik dalam Scope

| Metrik | Status | Catatan singkat |
|---|---|---|
| Revenue | ✅ | |
| Cash Position | ✅ | Kas + Bank. Deposito **baris terpisah** (tidak masuk angka utama) |
| Dana dalam proses pencairan | ✅ (kartu terpisah) | EDC, QRIS, e-wallet, Cash Sales in Transit |
| Cash Flow | ✅ | 3 laci: OPERATING / INVESTING / FUNDING (dari `cash_flow_group`) |
| Profit & Loss | ✅ | OCI ditampilkan **terpisah di bawah Laba Bersih** |
| Expense Paid | ✅ | **Biaya operasional saja** (COGS + OPEX), tanpa cicilan pokok pinjaman, beli aset, dividen |
| Outstanding Liability | ✅ | **Tagihan supplier (AP) saja** |
| Monthly Fixed Cost | ✅ (dihidupkan kembali) | Lewat keranjang "Biaya Tetap" di Settings |
| Daily Payment Plan | ✅ | Default hanya uang keluar; toggle "Sertakan proyeksi penerimaan" |
| Budget vs Actual | ✅ (tambahan) | Dari `coa_budget` |
| AR Aging | ✅ (tambahan) | |
| Cash Runway & Rasio | ✅ (tambahan) | Gross Margin, Net Margin, Current Ratio |

---

## 6. Settings › Account Mapping

| # | Keputusan | Alasan |
|---|---|---|
| S1 | Kode akun **tidak boleh di-hardcode**; diatur lewat halaman Settings | Kode CoA berbeda di setiap klien |
| S2 | Ada **5 keranjang**: Kas, Bank, Deposito, Dana dalam pencairan, Biaya Tetap | Hanya ini yang bisa diatur untuk saat ini |
| S3 | Cara memilih: **centang di pohon CoA** | Pohon dibangun dari `coa.acc_ref_id`; centang HEADER = seluruh isinya ikut (termasuk akun baru) |
| S4 | Pilihan disimpan per **`coa_id`** (bukan kode) | Kode bisa diganti admin, ID tetap |
| S5 | Disimpan di tabel ERP **`system_main`** (satu baris, `valueprop` berisi JSON), dibaca/ditulis lewat server function | Tabel pengaturan *key-value* yang sudah ada; berlaku untuk semua admin |
| S6 | **Satu set settings** per instalasi (tanpa profil klien) | Sederhana |
| S7 | Default klien baru: akun dengan **`sub_account_group = 'Cash'`** otomatis tercentang | Admin tinggal memisahkan ke Kas/Bank/Deposito |
| S8 | Yang **tidak** bisa diatur (sementara): baris P&L, kolom segment entitas, ambang aging/runway | Mengikuti `account_group` & `segment1_id` |

---

## 7. UI, Aksi & Lokalisasi

| # | Keputusan |
|---|---|
| U1 | **Fully responsive** (tabel jadi kartu di HP), mode **light & dark**, default **light** |
| U2 | Bahasa **English (default)** & **Bahasa Indonesia** |
| U3 | Angka besar **disingkat** + tooltip angka penuh; singkatan mengikuti bahasa (ID: Rb/Jt/M/T · EN: K/M/B/T). ⚠️ "M" = Miliar di ID, Million di EN |
| U4 | **Print & PDF** lewat print CSS (layout A4 tetap tabel walau dibuka dari HP) |
| U5 | **Export CSV** dengan dialog pilihan format: `,` + titik desimal **atau** `;` + koma desimal; selalu UTF-8 BOM |
| U6 | **Login memakai akun ERP** dari tabel **`sysuser`** (`login_id` + `password`, hanya `user_status` aktif); semua akun **akses penuh** (tanpa RBAC). ⚠️ Password di `sysuser` tersimpan **plain text** (tabel legacy) → lihat pengaman di data-model.md §9.3. Di DB lokal, akun demo dibuat oleh script seed |
| U7 | **Design system = [Neraca UI](https://claude.ai/artifact/6YqBk8Tgx4MTr9eJvNvCpK)** (dibuat dari gambar referensi user): kanvas abu kehijauan, kartu putih datar ber-border, `forest` sebagai bobot (kartu Posisi Kas, tombol utama, batang kas keluar), `lime` satu-satunya aksen (menu aktif, kas masuk, delta baik); Plus Jakarta Sans + JetBrains Mono (kode akun); 16 komponen domain (KpiCard, CashBalanceCard, CashflowChart, DonutBreakdown, AgingBar, DataTable, EntityPicker, PeriodSelect, dll.). Semua UI wajib memakai token & aturan di README-nya | Menghindari tampilan "AI slop" generik; konsisten antar halaman |

---

## 8. Testing

| # | Keputusan |
|---|---|
| T1 | **Vitest** untuk logika angka: agregasi GL, saldo, aging, cash flow, format angka/singkatan, CSV, pembangun pohon CoA, resolver keranjang |
| T2 | Query SQL metrik dites terhadap **DB lokal hasil seed** (seed tetap → angka yang diharapkan pasti) |
| T3 | Tidak ada E2E untuk saat ini |

---

## 9. Hal yang Masih Terbuka

| # | Pertanyaan | Default sementara |
|---|---|---|
| ~~O1~~ | ✅ **Terjawab:** `gl.posted_status` `1` = POSTED, `0` = NOT POSTED (`DbGl.java`) | — |
| O2 | Apakah entitas benar-benar akan didaftarkan di `pos_location`? | Ya (sesuai info user, belum final) |
| O3 | Segment Lokasi bertipe **NBAL** (non-balancing) → saldo kas/utang **per entitas** bisa terlihat janggal di data asli | Diabaikan di prototype; dibahas dengan tim finance sebelum produksi |
| O4 | Penanda akun OCI untuk klien lain (di klien ini: subtree akun `9`) | Konfigurasi di kode, bukan di Settings |
| O5 | Arti `coa_budget.segment1_id` (diasumsikan = Lokasi, sama seperti `gl_detail`) | Diasumsikan Lokasi |
| O6 | Pembayaran biaya langsung tanpa tagihan AP (petty cash, bank NONPO) — apakah semuanya dianggap Expense Paid? | Ya, bila akun lawannya akun Beban/HPP |
| ~~O7~~ | ✅ **Terjawab (user):** baris Settings di `system_main` diisi `name='DASHBOARD_ACCOUNT_MAPPING'`, `groupprop='Application'`, `valtype='STRING'`, `distype=''`, `company_id=0` | — |
| O8 | Password `sysuser` plain text → idealnya ERP pindah ke hash (bcrypt/argon2) & verifikasi lewat *stored function* | Prototype: verifikasi langsung dengan pengaman di data-model.md §9.3 |
| ~~O9~~ | ✅ **Terjawab (user):** **MySQL 5.7.44** → D23. Catatan: angka itu dari `mysql --version` (program klien); pastikan versi **server** sama lewat `SELECT VERSION();`. MySQL 5.7 sudah *end-of-life* sejak Okt 2023 — rekomendasi upgrade ke 8.x di sisi klien (di luar scope) | — |
| O10 | Server kantor berisi ±72 database dengan struktur sama — database mana yang dipakai untuk holding ini? | Diatur lewat env `DATABASE_URL` |
| O11 | Index tambahan di DB klien & ketersediaan *read replica* | 🟡 Script siap: [`docs/sql/dashboard-indexes.sql`](./sql/dashboard-indexes.sql) (8 index berawalan `idx_dash_` dalam 5 blok per tabel, ±2–2,5 GB, online DDL `ALGORITHM=INPLACE, LOCK=NONE` → ERP tetap jalan, + rollback) — **dijalankan manual oleh user**, disarankan di luar jam sibuk. *Read replica* belum dibahas |
| O13 | **Celah `cash_flow_setup` klien** untuk tim finance: (a) grup tanpa pemetaan — Inventory, Long Term Liabilities (leasing/hutang investasi), Other Assets, Cost Of Sales, debit Equity (dividen/prive); (b) pinjaman bank (2161/2162) masuk "Pembayaran Kewajiban" (OPERATING) bukan FUNDING; (c) grup akun wakil `504404772253463511` (Biaya Dibayar Dimuka) perlu dipastikan | Dashboard mengikuti setup apa adanya; yang tak terpetakan → "Belum terklasifikasi" (D27) |
| ~~O14~~ | ✅ **Terjawab (user):** acuan Laba Rugi = versi **generate** `profitloss_segmentgen.jsp` (D26) | — |
| ~~O12~~ | ✅ **Terjawab:** 40.011 item AP "lunas tanpa pembayaran" = tagihan yang sudah masuk **voucher pembayaran** (`bankpo_payment` type 0, status `Not Posted`/`Posted`) tetapi **belum dibayar**; ERP mengisi `payment_status=2` terlalu awal. Tetap dihitung sebagai utang (D16) + diberi status rencana bayar (D22). 77 item non-dagang lama (2021–2024) masuk panel "Data perlu dicek" (data-model.md §4.7 Q1b) | — |

---

## Riwayat Perubahan

| Tanggal | Perubahan |
|---|---|
| 2026-10-28 | Dokumen dibuat dari sesi discovery |
| 2026-10-28 | Eliminasi intercompany **dihapus** dari scope (D2) |
| 2026-10-28 | Monthly Fixed Cost sempat dihapus, lalu **dihidupkan kembali** setelah ditemukan folder Fixed Cost di CoA |
| 2026-10-28 | Penentuan akun kas berpindah dari `acc_link` → **Settings berbasis pohon CoA** |
| 2026-10-28 | **Revisi tech stack:** React+Vite+TanStack Router → **TanStack Start (SSR penuh)** yang membaca DB ERP langsung lewat server function + **Drizzle**. MSW, generator di browser, dan localStorage dihapus; Dexie sempat diusulkan lalu **tidak dipakai**. Data dev dari **DB lokal + script seed**. Settings → **`system_main`**. Login dummy → **akun ERP `sysuser`** |
| 2026-10-28 | Analisis `ap_ar_card*` di DB `demo`: aturan sisa tagihan terbukti (D16), peran tiap `transaction_type` dipetakan, temuan kualitas data dicatat (data-model.md §4.7), entitas = **1 lokasi** (D8), item lunas tanpa pembayaran menjadi O12 |
| 2026-10-28 | Studi laporan Neraca & Buku Besar ERP (`oxysystem_general_ver3`): D17–D21 (rumus mengikuti ERP, periode vs tanggal, saldo awal per lokasi, cache periode Closed, segmen entitas `count=1`); O1 terjawab; koreksi: `coa.level` **bisa dipercaya** |
| 2026-10-28 | O12 terjawab lewat alur Bank Payment PO: `payment_status=2` ≠ sudah dibayar; `bankpo_payment_detail` duplikat kartu bayar → D16 dipertegas, D22 (status rencana bayar) ditambahkan |
| 2026-10-28 | Review user: konvensi `system_main` dikonfirmasi (O7 terjawab); DB klien **MySQL 5.x** → D23 (SQL kompatibel 5.x); script index `docs/sql/dashboard-indexes.sql` dibuat untuk dijalankan manual (O11) |
| 2026-10-28 | Versi DB klien sempat disebut 5.1, lalu **dikoreksi user menjadi MySQL 5.7.44** → D23 disesuaikan ke 5.7 (larangan utama: CTE, window function, `LATERAL`); script index memakai online DDL (`ALGORITHM=INPLACE, LOCK=NONE`), tetap digabung per tabel |
| 2026-10-28 | Studi AP Aging ERP (`ap_aging.jsp`): D24 — rumus Outstanding & bucket aging disamakan dengan ERP, ditambah komponen "pembayaran belum dialokasikan"; daftar type item/pelunasan diperluas; Expense Paid ikut menghitung pembayaran belum dialokasikan |
| 2026-10-28 | Studi AR Aging ERP (`web/fin/ar/ar_aging.jsp`): D25 — retur bukan item melainkan pelunasan/bagian B, pembayaran pelanggan tanpa alokasi diabaikan seperti ERP; piutang non-dagang (±Rp24,7 M di DB `demo`) jadi kategori tersendiri |
| 2026-10-28 | Studi Neraca Saldo (`tb_report.jsp`), Laba Rugi (5 versi di menu), Arus Kas (`cashflow_report.jsp`), Anggaran (`budgetreport_month.jsp`, `profitloss_budgetgen*.jsp`): D26–D29, O13–O14. Temuan utama: `bgt_month` 0-based, `cash_flow_setup` rusak di DB `demo`, saldo awal P&L di tabel tidak cocok GL, `periode.table_name` untuk tabel arsip |
| 2026-10-28 | O14 terjawab: acuan Laba Rugi = versi generate (`profitloss_segmentgen.jsp`) |
| 2026-10-28 | User mengirim contoh `cash_flow_setup` klien (valid) → D27 direvisi: setup klien jadi sumber utama + alokasi proporsional ke kas + baris "Belum terklasifikasi" (keduanya dipilih user); aturan bawaan jadi cadangan; O13 diganti menjadi daftar celah setup untuk tim finance |
| 2026-10-28 | Revisi user: tabel `department` tidak dipakai (D9) → semua drill-down "departemen" diganti entitas/pohon CoA, master data dummy departemen dihapus |
| 2026-10-28 | Studi `bank_payment` & `bank_payment_history`: register pencairan pembayaran non-tunai POS → D30 (rincian & umur Dana dalam pencairan, estimasi tanggal cair per channel untuk Payment Plan menggantikan asumsi H+1); temuan Q9 (9 baris janggal) |
| 2026-10-28 | Design system **Neraca UI** dibuat dari gambar referensi user (U7): token warna 2 tema, skala tipografi, spacing, radius, bayangan, layout, brand book, 16 komponen + cover |
