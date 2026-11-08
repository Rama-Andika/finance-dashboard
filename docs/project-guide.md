# Panduan Proyek — Oxy Finance Dashboard

> **Untuk siapa:** pemilik produk dan tim finance yang ingin memahami **data apa yang dipakai, dari tabel mana, dengan query apa, dan dengan rumus apa** setiap angka di dashboard ini dihasilkan, tanpa harus paham kode. Developer juga memakainya sebagai peta ke kode.
>
> **Fungsi dokumen:** (1) kamus dan panduan belajar, (2) bahan **konfirmasi** ke tim finance: setiap bagian memuat daftar "Perlu dikonfirmasi", dan semuanya dikumpulkan di [bab 12](#12-tabel-pusat-konfirmasi).
>
> **Dokumen ini menggantikan** `summary-page.md`, `summary-queries.md`, `revenue-page.md`, dan `revenue-queries.md` (sudah dihapus; isinya dipindahkan ke bab 7 dan bab 8).
>
> **Aturan pemeliharaan:** dokumen ini **wajib diperbarui dalam perubahan yang sama** setiap kali ada perubahan pada data, query, tabel (termasuk tabel `dash_*` baru), rumus, halaman, istilah, atau konfigurasi. Tambahkan baris di [bab 14](#14-riwayat-perubahan), perbarui tanggal di bawah, dan perbarui [bab 12](#12-tabel-pusat-konfirmasi) bila ada pertanyaan baru atau jawaban baru dari finance. Aturan ini juga tertulis di `CLAUDE.md`.
>
> **Bila dokumen ini berbeda dengan `docs/decisions.md` atau `docs/data-model.md`, kedua dokumen itu yang menang** (lalu perbaiki dokumen ini). Keduanya tetap menjadi sumber keputusan (D#, O#) dan rincian kolom per tabel ERP.
>
> **Terakhir diperbarui:** 2026-11-08

## Daftar isi

0. [Cara memakai dokumen ini](#0-cara-memakai-dokumen-ini)
1. [Gambaran proyek dan alur data](#1-gambaran-proyek-dan-alur-data)
2. [Dasar akuntansi untuk non-akuntan](#2-dasar-akuntansi-untuk-non-akuntan)
3. [Glosarium A–Z](#3-glosarium-az)
4. [Tabel ERP yang dibaca dashboard](#4-tabel-erp-yang-dibaca-dashboard)
5. [Tabel milik dashboard (`dash_*`)](#5-tabel-milik-dashboard-dash_)
6. [Aturan perhitungan umum](#6-aturan-perhitungan-umum)
7. [Katalog query bersama](#7-katalog-query-bersama)
8. [Penjelasan per halaman](#8-penjelasan-per-halaman)
9. [Cache, performa, dan umur angka](#9-cache-performa-dan-umur-angka)
10. [Operasional: konfigurasi, perintah, dan jadwal](#10-operasional-konfigurasi-perintah-dan-jadwal)
11. [FAQ: kenapa angka tidak cocok dengan ERP?](#11-faq-kenapa-angka-tidak-cocok-dengan-erp)
12. [Tabel pusat konfirmasi](#12-tabel-pusat-konfirmasi)
13. [Rujukan ke dokumen lain](#13-rujukan-ke-dokumen-lain)
14. [Riwayat perubahan](#14-riwayat-perubahan)

---

## 0. Cara memakai dokumen ini

### 0.1 Penanda tingkat keyakinan

Setiap rumus, query, atau pernyataan penting diberi penanda supaya jelas seberapa jauh isinya sudah dicek:

| Penanda                            | Arti                                                                                                                       | Artinya untuk Anda                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ✅ **Dicek ke kode**               | Isinya dibaca langsung dari kode proyek pada tanggal pembaruan di atas. SQL yang tertulis adalah SQL yang dijalankan kode. | Dokumen dan program sama. Belum tentu sama dengan keinginan finance.                                            |
| 🔵 **Dicocokkan ke DB lokal**      | Struktur tabel atau angkanya dicek dengan `SELECT` ke database lokal `demo`.                                               | Tabel dan kolom benar-benar ada. Database lokal adalah **MariaDB 10.4** berisi data demo, **bukan** data klien. |
| 🟣 **Dicocokkan ke laporan ERP**   | Angkanya terbukti sama dengan laporan resmi ERP (mis. Neraca, Laba Rugi, AP Aging) pada data uji.                          | Paling kuat. Hanya dipasang bila ada catatan pencocokan di `data-model.md` atau `decisions.md`.                 |
| ⚠️ **Asumsi / belum dikonfirmasi** | Dibuat berdasarkan tebakan atau default sementara. Menunggu jawaban finance.                                               | **Perlu perhatian Anda.** Setiap ⚠️ punya kode `KF-nn` di bab 12.                                               |

Satu pernyataan bisa punya lebih dari satu penanda (mis. ✅ 🟣).

### 0.2 Kode yang muncul di dokumen

| Kode        | Contoh   | Artinya                                                                                   |
| ----------- | -------- | ----------------------------------------------------------------------------------------- |
| `D#`        | D16, D24 | Keputusan di `docs/decisions.md`                                                          |
| `O#`        | O4, O19  | Pertanyaan terbuka di `docs/decisions.md`                                                 |
| `G#`        | G7       | Aturan emas di `plans/README.md`                                                          |
| `KF-nn`     | KF-07    | **Konfirmasi finance** yang dikumpulkan dokumen ini (bab 12)                              |
| `Q#` / `R#` | Q11, R3  | Nomor query di katalog (bab 7 dan bab 8). Bukan nomor temuan data di `data-model.md` §4.7 |
| `§x.y`      | §6.6     | Nomor bagian di `data-model.md`                                                           |

### 0.3 Cara membaca satu halaman metrik

Setiap sub-bab halaman di bab 8 memakai urutan yang sama:

1. **Apa yang ditampilkan** (kartu, grafik, tabel).
2. **Data yang diambil** (tabel apa, untuk apa).
3. **Query** (SQL lengkap dari kode, lalu penjelasan bahasa biasa per bagian).
4. **Rumus** (cara angka dihitung).
5. **Contoh angka**.
6. **Perlu dikonfirmasi** (pertanyaan untuk finance, dengan kode `KF-nn`).

### 0.4 Cara memakai dokumen ini untuk konfirmasi dengan finance

1. Buka [bab 12](#12-tabel-pusat-konfirmasi). Urutkan menurut **prioritas** (kolom pertama).
2. Bacakan pertanyaan beserta **default sementara** (apa yang dilakukan program sekarang).
3. Isi kolom **Status**, **Jawaban finance**, dan **Tanggal**.
4. Jawaban yang mengubah perilaku program dikerjakan sebagai perubahan kode; dokumen ini diperbarui bersamaan (lihat aturan pemeliharaan di atas).

---

## 1. Gambaran proyek dan alur data

### 1.1 Apa itu proyek ini

**Oxy Finance Dashboard** adalah aplikasi web yang **membaca langsung database ERP milik klien** (perusahaan induk/holding dengan banyak anak perusahaan) dan menampilkan angka keuangan gabungan: posisi kas, pendapatan, laba rugi, arus kas, utang (AP), piutang (AR), rencana pembayaran, dan anggaran. Aplikasi **tidak menyimpan transaksi sendiri**. Semua angka dihitung dari data ERP yang sudah ada.

- **ERP** = sistem pencatatan transaksi perusahaan klien (buatan sendiri). Basis datanya **MySQL 5.7.44**.
- **Dashboard** = aplikasi ini. Dibangun dengan TanStack Start (React + server), membaca ERP lewat _server function_ dan Drizzle ORM.
- **Login** memakai akun ERP sendiri (tabel `sysuser`). Semua akun yang aktif punya akses penuh (tanpa peran).
- **Database ERP hanya dibaca.** Satu-satunya tempat dashboard menulis: (a) tabel miliknya sendiri berawalan `dash_` (bab 5), dan (b) satu baris pengaturan di `system_main` (Settings › Account Mapping).

### 1.2 Halaman yang ada

| Menu (sidebar)             | Alamat                      | Isi singkat                                                                                                     | Bab  |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| Summary                    | `/summary`                  | Ringkasan: Cash Position, Revenue, Net Profit, Payables, grafik Cash Flow, komposisi, tabel tagihan, kartu mini | 8.1  |
| Revenue                    | `/revenue`                  | Pendapatan per folder, per entitas, tren bulanan                                                                | 8.2  |
| Cash Position              | `/cash-position`            | Saldo kas, bank, deposito, dana dalam pencairan                                                                 | 8.3  |
| Cash Flow                  | `/cash-flow`                | Arus kas masuk dan keluar per laci (operasi, investasi, pendanaan)                                              | 8.4  |
| Profit & Loss              | `/profit-loss`              | Laporan laba rugi                                                                                               | 8.5  |
| Payables                   | `/payables`                 | Utang usaha dan umurnya (AP aging)                                                                              | 8.7  |
| Receivables                | `/receivables`              | Piutang dan umurnya (AR aging)                                                                                  | 8.8  |
| Payment Plan               | `/payment-plan`             | Rencana pembayaran harian ke depan                                                                              | 8.9  |
| Budget                     | `/budget`                   | Anggaran vs realisasi                                                                                           | 8.6  |
| Settings › Account Mapping | `/settings/account-mapping` | Menentukan akun mana yang dihitung sebagai Kas, Bank, dst.                                                      | 8.10 |
| (panel) Data perlu dicek   | di halaman terkait          | Temuan kualitas data                                                                                            | 8.11 |
| (sheet samping) Drill-down | parameter `drill` di URL    | Dari angka ke akun, entitas, sampai baris jurnal                                                                | 8.12 |

### 1.3 Alur data dari ERP sampai layar

```text
  DATABASE ERP (MySQL 5.7.44, hanya dibaca)
  ├─ gl, gl_detail        jurnal buku besar (jutaan baris)
  ├─ ap_ar_card (+detail) tagihan & pembayaran utang/piutang (jutaan baris)
  ├─ coa, periode, pos_location, segment*, ...   data induk
  └─ system_main          pengaturan (Account Mapping disimpan di sini)
         │
         │ (a) dibaca langsung oleh query ──────────────────────────────┐
         │                                                              │
         │ (b) dibaca berkala oleh "pembangun snapshot" (scheduler,     │
         │     atau tombol "Perbarui sekarang")                         │
         ▼                                                              │
  TABEL SNAPSHOT dash_* (di database yang sama, ringkas dan cepat)      │
  ├─ dash_snap_ap_ar_open / _unallocated       utang-piutang terbuka     │
  ├─ dash_snap_ap_ar_hist_*                    utang-piutang akhir bulan │
  ├─ dash_snap_gl_monthly / _periods           mutasi GL periode Closed  │
  ├─ dash_snap_cash_lines / _periods           baris jurnal kas Closed   │
  └─ dash_snap_meta                            status & "Data as of"     │
         │                                                              │
         ▼                                                              ▼
  REPO (src/server/repo)    ← satu-satunya tempat SQL ditulis; membaca snapshot
         │                    bila ada, dan ERP langsung bila tidak
         ▼
  SERVICE (src/server/services)  ← merangkai beberapa repo + rumus murni (src/lib)
         │                         hasil dicache sebentar di memori server
         ▼
  SERVER FUNCTION (src/functions)  ← pintu masuk dari browser; cek login, validasi filter
         ▼
  QUERY KLIEN (src/queries) → ROUTE/HALAMAN (src/routes) → KOMPONEN (src/components)
```

Penjelasan singkat tiap lapisan ada di `docs/project-structure.md`. Yang perlu diingat finance:

- **Angka tidak dihitung di browser.** Browser hanya menampilkan hasil dari server.
- **Ada dua jalur baca:** langsung ke ERP (selalu terkini, bisa lambat untuk data besar) dan lewat tabel `dash_*` (cepat, tetapi tidak selalu terkini: lihat "Data as of …" di sidebar).
- **Hasil perhitungan di-cache beberapa menit** di memori server (bab 9). Angka di layar bisa sampai sekitar 4 menit lebih tua dari ERP.

### 1.4 Prinsip yang menjaga angka tetap benar

Ringkasan dari `CLAUDE.md` dan `plans/README.md` yang berdampak ke angka:

| Prinsip                                                                                              | Dampak                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Uang disimpan dan dijumlah sebagai **teks desimal** (`decimal.js`), tidak pernah sebagai angka biasa | Tidak ada selisih pembulatan JavaScript                    |
| **ID selalu teks**                                                                                   | ID ERP yang sangat panjang tidak berubah digit terakhirnya |
| Hanya jurnal **posted** (sudah diposting) yang dihitung                                              | Draft tidak masuk angka                                    |
| Tanda angka (+/−) mengikuti **sisi alami kelompok akun**, bukan kolom `saldo_normal`                 | Akun lawan otomatis mengurangi                             |
| Kode akun Kas/Bank/dst. **tidak ditulis mati** di kode, diatur di Settings                           | Cocok untuk klien lain                                     |
| SQL harus jalan di **MySQL 5.7**: tanpa CTE (`WITH`), tanpa window function                          | Query lebih panjang, tetapi aman di server klien           |
| Dashboard tidak menulis ke tabel ERP                                                                 | ERP tidak bisa rusak oleh dashboard                        |

---

## 2. Dasar akuntansi untuk non-akuntan

Bab ini memuat konsep yang diperlukan untuk membaca dokumen ini. Sumber lengkapnya ada di `data-model.md` bab 1.

### 2.1 Debit dan kredit

Setiap transaksi dicatat **minimal dua baris**: dari mana dan ke mana. **Total debit selalu sama dengan total kredit.** Debit dan kredit bukan "tambah" dan "kurang". Bergantung jenis akun, debit bisa menambah atau mengurangi.

| Jenis akun    | Bertambah di | Contoh                         |
| ------------- | ------------ | ------------------------------ |
| Harta (aset)  | **Debit**    | Kas, Bank, Piutang, Persediaan |
| Beban (biaya) | **Debit**    | Gaji, Sewa, HPP                |
| Utang         | **Kredit**   | Hutang usaha, Hutang bank      |
| Modal         | **Kredit**   | Modal disetor, Laba ditahan    |
| Pendapatan    | **Kredit**   | Penjualan                      |

Pengingat: **"Harta dan Biaya → Debit. Utang, Modal, dan Pendapatan → Kredit."**

Contoh jual tunai Rp100:

| Akun                 | Debit | Kredit |
| -------------------- | ----- | ------ |
| Kas                  | 100   |        |
| Pendapatan Penjualan |       | 100    |

Di database, satu transaksi = satu **kepala jurnal** (`gl`) + beberapa **baris jurnal** (`gl_detail`) yang masing-masing punya kolom `debet` dan `credit`.

### 2.2 Daftar akun (CoA) berbentuk pohon

**CoA** (_Chart of Accounts_, "daftar akun") adalah daftar semua akun yang boleh dipakai mencatat transaksi, tersusun seperti folder:

- **HEADER** = folder. Tidak menerima jurnal. Angkanya = jumlah isinya.
- **POSTABLE** = akun "daun" tempat jurnal benar-benar dicatat.

Tiap akun punya **grup akun** (`account_group`) yang menentukan di laporan mana ia muncul dan sisi mana yang menambah:

| Laporan       | `account_group`                            | Sisi bertambah |
| ------------- | ------------------------------------------ | -------------- |
| Neraca: Harta | Liquid Assets, Fixed Assets, Other Assets  | Debit          |
| Neraca: Utang | Current Liabilities, Long Term Liabilities | Kredit         |
| Neraca: Modal | Equity                                     | Kredit         |
| Laba Rugi     | Revenue, Other Revenue                     | Kredit         |
| Laba Rugi     | Cost Of Sales, Expense, Other Expense      | Debit          |

### 2.3 Dua laporan utama

- **Laba Rugi (P&L)** menjawab "selama periode ini, untung atau rugi?". Berisi pendapatan dikurangi biaya. Ini angka yang **mengalir** selama periode (_flow_).
- **Neraca** menjawab "pada tanggal ini, apa yang dimiliki dan berapa utangnya?". Ini angka **potret** pada satu tanggal (_snapshot_).

Susunan Laba Rugi di dashboard:

```text
  Revenue (Pendapatan)
− Cost Of Sales (HPP, harga pokok penjualan)
= Gross Profit (Laba Kotor)
− Expense (Beban Operasional)
= Operating Profit (Laba Usaha)
+ Other Revenue (Pendapatan Lain-lain)
− Other Expense (Beban Lain-lain)
= Net Profit (Laba Bersih)
```

### 2.4 Flow (video) dan snapshot (foto)

| Jenis        | Arti                          | Metrik di dashboard                                               | Arti filter periode                             |
| ------------ | ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| **Flow**     | Yang terjadi _selama_ periode | Revenue, P&L, Cash Flow, Fixed Cost, Budget vs Actual             | Jumlah dari awal sampai akhir periode           |
| **Snapshot** | Kondisi _pada satu tanggal_   | Cash Position, Dana dalam pencairan, Payables, Receivables, rasio | Kondisi pada **tanggal acuan** (`asOf`) periode |

**Hati-hati dengan kata "snapshot":** di dokumen ini kata itu punya dua arti yang berbeda.

1. _Snapshot sebagai jenis angka_ (potret pada satu tanggal), seperti di tabel di atas.
2. _Tabel snapshot `dash_*`_, yaitu salinan hasil hitung yang dibuat dashboard supaya cepat (bab 5). Tabel snapshot bisa berisi angka flow (mis. `dash_snap_gl_monthly`) maupun potret.

### 2.5 Accrual (pembukuan) vs kas

Jual kredit tanggal 5 Oktober, dibayar pelanggan 20 November:

- **Laba Rugi** mencatat pendapatan di **Oktober** (saat tagihan terbit).
- **Arus kas** mencatat uang masuk di **November** (saat uang benar-benar masuk).

Karena itu wajar bila "untung tetapi kas tipis". Halaman **Revenue** dan **P&L** memakai dasar pembukuan (accrual): penjualan kredit yang belum dibayar tetap masuk. Halaman **Cash Position** dan **Cash Flow** memakai uang yang benar-benar bergerak.

### 2.6 Periode akuntansi dan tutup buku

ERP membagi waktu menjadi **periode** (satu per bulan, plus **Periode 13** untuk penyesuaian akhir tahun). Setiap jurnal masuk ke satu periode (`gl.period_id`), yang bisa berbeda dari tanggal transaksinya (mis. jurnal bertanggal 30 September yang baru dicatat Oktober).

| Status periode | Arti                  | Dampak di dashboard                                                                                      |
| -------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Open**       | Masih menerima jurnal | Selalu dibaca langsung dari ERP; banner peringatan "angka bisa berubah"                                  |
| **Pre Closed** | Hampir ditutup        | Sama dengan Open                                                                                         |
| **Closed**     | Sudah tutup buku      | Angka dianggap tetap, boleh disalin ke tabel `dash_snap_*` (tetapi dicek ulang bila periode dibuka lagi) |

Angka **bulanan** memakai `gl.period_id` (sama dengan laporan resmi ERP). Angka **harian** (saldo kas per tanggal, Payment Plan) memakai tanggal transaksi (`gl.trans_date`).

### 2.7 Jurnal posted dan draft

Sebuah jurnal punya status `posted_status`: `1` = sudah **diposting** (resmi masuk buku besar), `0` = draft. Dashboard **hanya menghitung yang posted**. Konsekuensinya: transaksi yang baru diinput tetapi belum diposting tidak muncul di angka.

### 2.8 Utang (AP) dan piutang (AR)

- **AP** (_Accounts Payable_, utang usaha): tagihan dari pemasok yang harus kita bayar.
- **AR** (_Accounts Receivable_, piutang usaha): tagihan kita ke pelanggan.
- **Umur utang/piutang** (_aging_): dikelompokkan menurut keterlambatan terhadap tanggal jatuh tempo, dalam "bucket" 0–30, 31–60, 61–90, dan di atas 90 hari.
- Di ERP, utang/piutang dicatat di tabel **kartu** (`ap_ar_card`) terpisah dari jurnal buku besar. Dashboard memakai kartu itu sebagai sumber sisa utang/piutang (bab 4.4).

### 2.9 Entitas dan konsolidasi

Klien adalah holding dengan banyak anak perusahaan/lokasi. Dashboard menyebutnya **entitas**, yaitu satu baris `pos_location` di ERP (1 lokasi = 1 entitas). Setiap baris jurnal diberi kode lokasi lewat kolom segmen. **Konsolidasi** di dashboard = **penjumlahan biasa** entitas yang dipilih, **tanpa eliminasi transaksi antar-entitas** (keputusan D2). Artinya penjualan antar-entitas, bila dicatat sebagai pendapatan di kedua sisi, terhitung dua kali.

### 2.10 Mata uang

Tampilan memakai **rupiah (IDR) saja**. Kolom `debet`/`credit` di ERP sudah dalam rupiah walau akunnya valas (D1).

---

## 3. Glosarium A–Z

Istilah teknis dan istilah finance yang dipakai di dokumen dan di layar. "Lihat" menunjuk ke bab tempat penjelasannya.

| Istilah                               | Arti sederhana                                                                                                                      | Lihat    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Account Mapping**                   | Halaman Settings tempat admin memilih akun mana yang dihitung sebagai Kas, Bank, Deposito, Dana dalam pencairan, dan Biaya Tetap.   | 8.10     |
| **Accrual**                           | Pencatatan pendapatan/biaya saat terjadi, bukan saat uang bergerak.                                                                 | 2.5      |
| **Aging / Umur**                      | Pengelompokan tagihan menurut berapa hari terlambat dari jatuh tempo.                                                               | 8.7      |
| **AP**                                | _Accounts Payable_, utang usaha.                                                                                                    | 2.8      |
| **AR**                                | _Accounts Receivable_, piutang usaha.                                                                                               | 2.8      |
| **`asOf` (tanggal acuan)**            | Tanggal yang dipakai untuk angka potret. Ditentukan filter periode, maksimal hari ini.                                              | 6.1      |
| **`ap_ar_card`**                      | Tabel ERP berisi tagihan dan pembayaran utang/piutang.                                                                              | 4.4      |
| **Bank Payment PO**                   | Alur pembayaran utang di ERP (voucher → pembayaran).                                                                                | 4.6      |
| **Basket / Keranjang akun**           | Kumpulan akun yang dihitung sebagai satu kelompok (Kas, Bank, Deposito, Dana dalam pencairan, Biaya Tetap).                         | 6.6      |
| **Bucket**                            | Satu kelompok umur dalam aging (mis. 31–60 hari).                                                                                   | 8.7      |
| **Budget vs Actual**                  | Anggaran dibandingkan realisasi.                                                                                                    | 8.6      |
| **Burn (laju bakar)**                 | Rata-rata uang bersih yang keluar per bulan. Dipakai untuk Runway.                                                                  | 8.4.6    |
| **Cash Flow (arus kas)**              | Uang yang benar-benar masuk dan keluar selama periode.                                                                              | 8.4      |
| **Cash Position**                     | Saldo Kas + Bank pada tanggal acuan.                                                                                                | 8.3      |
| **Closed / Open / Pre Closed**        | Status periode akuntansi.                                                                                                           | 2.6      |
| **CoA**                               | _Chart of Accounts_, daftar akun berbentuk pohon.                                                                                   | 2.2      |
| **Cost Of Sales (HPP)**               | Harga pokok penjualan, biaya langsung barang yang terjual.                                                                          | 2.3      |
| **Current Ratio**                     | Aset lancar ÷ kewajiban lancar. Ukuran kemampuan membayar utang jangka pendek.                                                      | 8.4.6    |
| **`dash_*`**                          | Tabel milik dashboard (salinan hasil hitung).                                                                                       | 5        |
| **Dana dalam pencairan (in transit)** | Uang pembayaran kartu/QRIS/e-wallet yang sudah dibayar pelanggan tetapi belum masuk rekening bank.                                  | 8.3      |
| **Data as of**                        | Kartu di sidebar yang menunjukkan kapan tabel `dash_*` terakhir dibangun.                                                           | 10.4     |
| **Debit / Kredit**                    | Dua sisi pencatatan jurnal.                                                                                                         | 2.1      |
| **Deposito**                          | Simpanan berjangka. Baris terpisah di Cash Position, tidak masuk angka utama.                                                       | 8.3      |
| **Draft**                             | Jurnal yang belum diposting. Tidak dihitung.                                                                                        | 2.7      |
| **Drill-down**                        | Membuka rincian sebuah angka sampai baris jurnal.                                                                                   | 8.12     |
| **EDC**                               | Mesin gesek kartu di kasir. Pembayarannya termasuk dana dalam pencairan.                                                            | 8.3      |
| **Eliminasi intercompany**            | Menghapus transaksi antar-entitas dalam satu grup agar tidak terhitung dua kali. **Tidak dilakukan** di dashboard.                  | 2.9      |
| **Entitas**                           | Satu lokasi (`pos_location`), mewakili satu anak perusahaan/cabang.                                                                 | 2.9      |
| **ERP**                               | Sistem pencatatan transaksi klien yang menjadi sumber data.                                                                         | 1.1      |
| **Expense Paid**                      | Biaya operasional yang sudah dibayar kas.                                                                                           | 8.4.7    |
| **Fingerprint (sidik jari)**          | Ringkasan kecil kondisi data ERP yang disimpan bersama snapshot. Bila berubah, snapshot dibangun ulang.                             | 5.1      |
| **Fixed Cost (Biaya Tetap)**          | Biaya tetap bulanan; akunnya dipilih di Account Mapping.                                                                            | 8.5      |
| **Flow**                              | Angka yang mengalir selama periode.                                                                                                 | 2.4      |
| **`gl`, `gl_detail`**                 | Kepala dan baris jurnal buku besar di ERP.                                                                                          | 4.3      |
| **Giro / Cek beredar**                | Pembayaran dengan giro/cek yang sudah dicatat tetapi belum dicairkan bank. Hanya informasi di Cash Position.                        | 8.3      |
| **Gross Profit / Margin**             | Laba kotor (Revenue − HPP) dan rasionya terhadap Revenue.                                                                           | 2.3      |
| **HEADER / POSTABLE**                 | Akun folder / akun tempat jurnal dicatat.                                                                                           | 2.2      |
| **HPP**                               | Harga pokok penjualan (Cost Of Sales).                                                                                              | 2.3      |
| **`in_out`**                          | Kolom kartu utang/piutang: `1` menambah saldo, `-1` mengurangi, `0` abaikan.                                                        | 4.4      |
| **Jatuh tempo (`due_date`)**          | Tanggal tagihan harus dibayar.                                                                                                      | 8.7      |
| **Jurnal pembalik (reversal)**        | Jurnal yang membatalkan jurnal lain. Dihitung bersama aslinya.                                                                      | 6.2      |
| **Konsinyasi**                        | Barang titipan; hutangnya muncul dari penjualan (nomor `…/SLS/…`).                                                                  | 4.4      |
| **Konsolidasi**                       | Penjumlahan banyak entitas.                                                                                                         | 2.9      |
| **Kredit vendor**                     | Semua item AP yang sisanya negatif: retur, memo kredit, kelebihan bayar. Memotong utang.                                            | 8.7      |
| **Laba Rugi (P&L)**                   | Laporan untung/rugi selama periode.                                                                                                 | 2.3      |
| **MDR**                               | Biaya yang dipotong penyedia pembayaran dari transaksi kartu/QRIS. Kolomnya tidak dipakai.                                          | 4.5      |
| **NBAL (non-balancing)**              | Segmen Lokasi tidak memaksa jurnal seimbang per lokasi, jadi saldo kas/utang per entitas bisa terlihat janggal.                     | 6.4      |
| **Neraca**                            | Laporan posisi harta, utang, modal pada satu tanggal.                                                                               | 2.3      |
| **Net Profit / Margin**               | Laba bersih dan rasionya terhadap Revenue.                                                                                          | 2.3      |
| **OCI**                               | _Other Comprehensive Income_. Fitur **dinonaktifkan sementara** (D39, O4).                                                          | 8.5      |
| **Operating Profit**                  | Laba usaha: Laba Kotor − Beban Operasional.                                                                                         | 2.3      |
| **Other Revenue / Other Expense**     | Pendapatan/beban di luar usaha utama (jasa giro, bunga, selisih kurs). Tidak masuk Revenue.                                         | 2.3      |
| **Overdue**                           | Tagihan yang sudah lewat jatuh tempo. Kartu Payables memakai tagihan positif saja; halaman Payables memakai neto per bucket.        | 8.7      |
| **Payment Plan**                      | Rencana pembayaran harian ke depan (7/14/30 hari).                                                                                  | 8.9      |
| **Pembayaran belum dialokasikan**     | Hanya AP: kartu pelunasan (tipe 7–14) tanpa detail sama sekali; mengurangi utang.                                                   | 8.7      |
| **Pengakuan Biaya**                   | Dokumen ERP (`bankpo_payment` tipe 0) tempat finance memilih beberapa tagihan satu vendor untuk dibayar bersamaan. Bukan "voucher". | 4.6      |
| **Periode 13**                        | Periode tambahan akhir tahun untuk penyesuaian/audit.                                                                               | 2.6      |
| **`period_id`**                       | Periode pencatatan sebuah jurnal. Dasar angka bulanan.                                                                              | 6.3      |
| **Posted**                            | Jurnal yang sudah diposting. Hanya ini yang dihitung.                                                                               | 2.7      |
| **`pos_location`**                    | Tabel ERP berisi lokasi = entitas.                                                                                                  | 4.2      |
| **Preset periode**                    | Pilihan cepat filter: Bulan ini, Bulan lalu, Kuartal ini, YTD, 12 bulan.                                                            | 6.1      |
| **QRIS / e-wallet**                   | Pembayaran non-tunai; termasuk dana dalam pencairan.                                                                                | 8.3      |
| **Realisasi (Actual)**                | Angka sebenarnya dari jurnal, lawan dari anggaran.                                                                                  | 8.6      |
| **Retur dengan nota**                 | Retur AR yang langsung menunjuk faktur (kartu retur memegang detailnya sendiri). Sudah selesai saat dibuat.                         | 8.8      |
| **Retur langsung**                    | Kartu retur tanpa baris detail sendiri: berdiri sendiri, belum dikaitkan ke tagihan. Terpakai bila ada alokasi pelunasan.           | 8.7, 8.8 |
| **Refresh now (Perbarui sekarang)**   | Tombol di sidebar untuk membangun ulang tabel `dash_*` sekarang.                                                                    | 10.4     |
| **Repo / Service / Server function**  | Lapisan kode: repo = SQL, service = merangkai repo dan rumus, server function = pintu masuk dari browser.                           | 1.3      |
| **Revenue (Pendapatan)**              | Pendapatan usaha utama (grup akun Revenue, bukan Other Revenue).                                                                    | 8.2      |
| **Runway**                            | Berapa bulan kas bertahan bila laju bakar tetap.                                                                                    | 8.4.6    |
| **`segment1_id` / segmen**            | Kolom baris jurnal yang menunjuk lokasi.                                                                                            | 4.2      |
| **Seleksi Invoice**                   | Menu ERP untuk memilih tagihan yang akan dibayar; menghasilkan Pengakuan Biaya.                                                     | 4.6      |
| **Snapshot**                          | (1) potret angka pada satu tanggal; (2) tabel `dash_snap_*` berisi salinan hasil hitung.                                            | 2.4, 5   |
| **SWR (_stale-while-revalidate_)**    | Menampilkan angka lama seketika sambil menghitung ulang di belakang layar.                                                          | 9        |
| **`sysuser`**                         | Tabel akun ERP yang dipakai login dashboard.                                                                                        | 4.7      |
| **`system_main`**                     | Tabel pengaturan ERP; menyimpan Account Mapping.                                                                                    | 4.7      |
| **Tanpa entitas**                     | Baris pendapatan/jurnal yang tidak punya lokasi.                                                                                    | 8.2      |
| **`trans_date`**                      | Tanggal transaksi jurnal. Dasar angka harian.                                                                                       | 6.3      |
| **YTD**                               | _Year To Date_, dari Januari sampai sekarang.                                                                                       | 6.1      |

---

## 4. Tabel ERP yang dibaca dashboard

> Rincian **kolom demi kolom** semua tabel ini ada di `docs/data-model.md` bagian 2.2 dan 3. Bab ini menjelaskan **untuk apa** tiap tabel dipakai, kolom yang penting, dan hubungannya. Tabel ERP **hanya dibaca**; dashboard tidak pernah mengubahnya (kecuali satu baris di `system_main`, bagian 4.7).
>
> Tingkat keyakinan: ✅ kolom dan pemakaian tabel dicek ke kode (`src/server/repo/**`, `src/server/db/schema.ts`). Arti kode status/tipe berasal dari studi ERP di `data-model.md`.

### 4.1 Peta tabel

```text
pos_location ◄── segment_detail ◄── gl_detail.segment1_id
 (entitas)        (nilai segmen)           │
                                           ├── gl_id ──► gl (kepala jurnal) ──► periode
                                           └── coa_id ─► coa (pohon akun, induk = coa.acc_ref_id)

coa ◄── coa_opening_balance_location   saldo awal per periode × akun × lokasi
coa ◄── cash_flow_setup ──► cash_flow_group   (OPERATING / INVESTING / FUNDING)
coa ◄── coa_budget                     anggaran per bulan

ap_ar_card (tagihan & pembayaran) ◄── ap_ar_card_detail (alokasi bayar → tagihan)
   ├── owner_id ─► vendor (AP) / customer (AR)
   └── location_id ─► pos_location

bankpo_payment (+ _detail)   Pengakuan Biaya & pembayaran utang → status rencana bayar
bank_payment                 transaksi kartu/QRIS belum cair; giro/cek beredar

system_main  → pengaturan (Account Mapping)        sysuser → login
```

| Tabel                                     | Isi dalam satu kalimat                            | Dipakai oleh                                                                 |
| ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `coa`                                     | Daftar akun (pohon)                               | Semua halaman                                                                |
| `periode`                                 | Periode akuntansi dan statusnya                   | Semua halaman berbasis periode                                               |
| `pos_location`                            | Daftar lokasi = entitas                           | Filter entitas, semua halaman                                                |
| `segment`, `segment_detail`               | Jembatan dari baris jurnal ke lokasi              | Filter entitas pada jurnal                                                   |
| `gl`, `gl_detail`                         | Jurnal buku besar                                 | Revenue, P&L, Cash Position, Cash Flow, Budget, Drill-down                   |
| `coa_opening_balance_location`            | Saldo awal akun neraca per periode dan lokasi     | Cash Position (saldo kas)                                                    |
| `ap_ar_card`, `ap_ar_card_detail`         | Tagihan, pembayaran, dan alokasinya               | Payables, Receivables, Payment Plan, Summary, Data checks, snapshot `dash_*` |
| `vendor`, `customer`                      | Nama pemasok dan pelanggan (hanya id, kode, nama) | Aging, Payment Plan, tabel tagihan                                           |
| `bank_payment`                            | Transaksi bank yang menunggu pencairan; giro/cek  | Cash Position, Payment Plan                                                  |
| `bankpo_payment`, `bankpo_payment_detail` | Pengakuan Biaya dan pembayaran utang              | Status rencana bayar tagihan                                                 |
| `cash_flow_group`, `cash_flow_setup`      | Klasifikasi arus kas buatan klien                 | Cash Flow                                                                    |
| `coa_budget`                              | Anggaran                                          | Budget                                                                       |
| `system_main`                             | Pengaturan ERP (baris Account Mapping)            | Settings, semua perhitungan keranjang                                        |
| `sysuser`                                 | Akun login                                        | Login                                                                        |
| `information_schema` (milik MySQL)        | Info struktur tabel                               | Pemeriksaan apakah `gl` punya kolom `canceled_date` (D31)                    |

Tabel yang **ada di definisi skema tetapi tidak dibaca query** pada saat dokumen ini diperbarui: `company`, `balance_gl`, `bank_payment_history` ✅ (hanya tercatat di `src/server/db/schema.ts`).

### 4.2 Data induk

**`pos_location` (entitas).** Satu baris = satu lokasi = satu entitas (D8). Kolom penting: `location_id`, `code`, `name`, `is_active`, `inactive_date`. Entitas nonaktif tetap bisa dipilih untuk periode lampau. Di URL, entitas ditulis sebagai `location_id` (bukan kode pendek).

**`segment` dan `segment_detail` (jembatan jurnal → entitas).** Setiap baris jurnal punya beberapa kolom segmen (`segment1_id`, `segment2_id`, …). Dashboard memilih kolom entitas lewat `segment.count = 1` (tidak ditulis mati sebagai `segment1_id`, D21). Alurnya:

```text
gl_detail.segment1_id  →  segment_detail.segment_detail_id  →  segment_detail.location_id  →  pos_location
```

Baris jurnal yang tidak punya segmen/lokasi masuk entitas khusus "Tanpa entitas" bila relevan (lihat 8.2).

**`periode`.** Kolom penting: `periode_id`, `name`, `start_date`, `end_date`, `status` (`Open` / `Pre Closed` / `Closed`), `type` (`0` reguler, `1` Periode 13), dan `table_name` (tabel GL tempat jurnal periode itu disimpan: `gl` atau arsip `gl_2015` … `gl_2020`). Dashboard **wajib** membaca tabel sesuai `table_name`, dan nama tabel divalidasi lewat `src/server/db/gl-tables.ts` sebelum dipakai di SQL.

**`coa` (pohon akun).** Kolom penting: `coa_id`, `acc_ref_id` (induk, `0` = akar), `code`, `name`, `status` (`HEADER`/`POSTABLE`), `level`, `account_group`, `sub_account_group`, `saldo_normal`. Pohon dibentuk dari `acc_ref_id` (bukan dari pola kode akun). Kolom `saldo_normal` **tidak dipakai** untuk menentukan tanda angka (bagian 6.4).

**`coa_opening_balance_location`.** Saldo awal akun **per periode, akun, dan lokasi**, diisi ERP saat tutup buku. Dipakai sebagai titik awal saldo kas (8.3). Untuk akun laba rugi tabel ini tidak cocok dengan jumlah GL, jadi tidak dipakai untuk P&L (`data-model.md` §4.5).

**`vendor`, `customer`.** Dari kedua tabel ini dashboard hanya mengambil `id`, `code`, `name` (aturan keamanan: tidak pernah mengambil rekening bank, NPWP, atau kolom identitas).

### 4.3 Jurnal buku besar: `gl` dan `gl_detail`

- **`gl`** = kepala jurnal: `gl_id`, `journal_number`, `trans_date` (tanggal transaksi), `period_id` (periode pencatatan), `journal_type` (sumber jurnal), `posted_status` (1 = posted), `canceled_date` (tidak ada di semua versi ERP, D31), `memo`.
- **`gl_detail`** = baris debit/kredit: `gl_id`, `coa_id`, `debet`, `credit`, `segment1_id` (lokasi), `coa_level1_id … coa_level7_id` (leluhur akun di pohon, dipakai menjumlah HEADER tanpa rekursi), `memo`.
- Volume: pada database `demo` `gl` ±1,5 juta dan `gl_detail` ±13,6 juta baris (D20); ERP klien bisa lebih besar. Karena itu semua penjumlahan dilakukan **di SQL**, bukan di JavaScript (D12).
- **Jurnal yang dihitung:** `posted_status = 1`, dan `canceled_date IS NULL` hanya bila tabel `gl` punya kolom itu. Jurnal pembalik ikut dihitung (bagian 6.2).
- **Kelompok `journal_type`** dipakai hanya untuk label dan pengelompokan di drill-down (uang masuk/keluar, penjualan, pembelian, pinjaman, aset tetap, penyesuaian). Daftar kodenya: `data-model.md` §3.4.

### 4.4 Utang dan piutang: `ap_ar_card` dan `ap_ar_card_detail`

Satu tabel (`ap_ar_card`) berisi **dua peran**: **item** (tagihan, retur, memo, yang punya saldo) dan **kartu pelunasan** (pembayaran/penyesuaian yang "memakan" item lewat `ap_ar_card_detail`).

| Kolom                          | Arti                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `module_type`                  | `0` = AP (utang), `1` = AR (piutang)                                                                                                             |
| `transaction_type`             | Jenis dokumen (tabel di bawah)                                                                                                                   |
| `in_out`                       | `1` menambah saldo, `-1` mengurangi, `0` penanda nol (**abaikan**)                                                                               |
| `amount`                       | Nominal, selalu positif; arah dari `in_out`                                                                                                      |
| `transaction_date`, `due_date` | Tanggal dokumen dan jatuh tempo                                                                                                                  |
| `owner_id`                     | Vendor (AP) atau customer (AR)                                                                                                                   |
| `location_id`                  | Entitas pemilik                                                                                                                                  |
| `payment_status`               | Status "lunas" versi ERP. **Tidak dipakai** (tidak bisa dipercaya: terisi lunas begitu tagihan masuk Pengakuan Biaya, padahal uang belum keluar) |

`ap_ar_card_detail` menghubungkan kartu pelunasan ke item yang dilunasi: `ap_ar_card_id` (kartu pelunasan), `invoice_id` (item), `amount` (alokasi, bertanda berlawanan dengan `in_out` item).

**Rumus sisa satu item** (terbukti di data, sama dengan rumus ERP, D16):

```text
sisa(item) = item.amount × item.in_out + Σ detail.amount  (detail.invoice_id = item)
```

**Jenis dokumen (`transaction_type`) untuk AP** (ringkas; lengkap di `data-model.md` §3.1):

| Kode  | Arti                                 | Peran                 |
| ----- | ------------------------------------ | --------------------- |
| 0     | Hutang dagang                        | Item (mayoritas data) |
| 1     | Hutang non-dagang                    | Item                  |
| 2     | Retur                                | Item kredit           |
| 3     | Hutang aset                          | Item                  |
| 4     | AP memo                              | Item (dua arah)       |
| 7, 8  | Penyesuaian penerimaan (qty / nilai) | Kartu pelunasan       |
| 9, 10 | Pembayaran (tunggal / multi)         | Kartu pelunasan       |

Untuk AR: `0` piutang penjualan (item), `1` pembayaran piutang (pelunasan), `2` retur. **Retur dengan nota** memegang detailnya sendiri (memotong faktur). **Retur langsung** (tanpa detail sendiri) menjadi saldo kredit tersendiri sampai sebuah kartu pelunasan tipe 1 atau 2 membuat detail yang menunjuk ke kartu retur itu; sisanya `-nominal + jumlah detail yang menunjuk` (retur yang sisanya 0 tidak dihitung), `3` piutang non-dagang (item), `5` AR memo (item).

Daftar kode yang dihitung dibaca dari satu tempat, `src/server/db/erp-codes.ts` ✅ (item AP: 0,1,2,3,4,5,6,12; pelunasan AP: 7,8,9,10,11,13,14; item AR: 0,3,4,5; pelunasan AR: 1,2, mengikuti AP/AR Aging ERP, D24 dan D25).

**Temuan kualitas data** (item "lunas tanpa pembayaran", `due_date` sebelum tanggal transaksi, `owner_id` tidak dikenal, dan seterusnya) ada di `data-model.md` §4.7 dan tampil di panel "Data perlu dicek" (8.11).

### 4.5 Transaksi bank: `bank_payment`

Satu baris = satu transaksi bank yang menunggu atau sudah dicairkan. Pada data demo hampir semuanya **tipe 1/2**: pembayaran non-tunai di kasir (kartu kredit/debit, QRIS, e-wallet) yang dicatat sebagai piutang ke bank/penyedia pembayaran sampai dananya masuk rekening.

| Kolom                              | Arti                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                             | `1` kartu kredit (dipakai untuk semua non-tunai POS), `2` kartu debit, `0`/`3`/`4`/`7` Bank Payment PO (biasa/grup/cek/e-banking), `5`/`6`/`8` Bank Payment Non-PO |
| `status`                           | `0` belum cair, `1` sudah cair                                                                                                                                     |
| `coa_id`                           | Akun piutang channel (sama dengan keranjang "Dana dalam pencairan")                                                                                                |
| `amount`                           | Nilai transaksi (bruto)                                                                                                                                            |
| `transaction_date`, `payment_date` | Tanggal transaksi dan tanggal dana benar-benar cair                                                                                                                |
| `segment1_id`                      | Lokasi/entitas                                                                                                                                                     |

Dipakai untuk: rincian dan umur **Dana dalam pencairan** (D30, D32), estimasi tanggal cair per channel di Payment Plan, dan **giro/cek beredar** (D35). Kolom `piutang`/`expense` (MDR) **tidak dipakai** karena kosong sejak ±September 2025.

### 4.6 Alur pembayaran utang: `bankpo_payment`

```text
Tagihan AP (ap_ar_card)
   │ 1. diseleksi lewat menu "Seleksi Invoice"  → bankpo_payment tipe 0 "Pengakuan Biaya"
   │       status: Not Posted (diseleksi) → Posted (disetujui, menunggu bayar)
   │       ⚠️ pada titik ini ERP sudah mengisi payment_status = 2 (lunas) padahal uang belum keluar
   │ 2. uang keluar     → bankpo_payment tipe 1 "Pembayaran Bank" (atau tipe 3 "Pembayaran langsung")
   │ 3. saat diposting  → ERP membuat kartu pelunasan di ap_ar_card + ap_ar_card_detail
   ▼     Pengakuan Biaya berubah menjadi Partialy Paid / Paid
```

Dashboard memakai tabel ini **hanya untuk label status rencana bayar** tagihan (D22, D36) dan **tidak** untuk menghitung sisa utang (menjumlahkannya dengan kartu bayar akan menghitung ganda, D16):

| Kondisi dokumen Pengakuan Biaya (tipe 0) | Label di layar             |
| ---------------------------------------- | -------------------------- |
| Tidak ada dokumen aktif                  | Belum diseleksi            |
| `Not Posted`                             | Diseleksi, belum disetujui |
| `Posted` atau `Partialy Paid`            | Disetujui, menunggu bayar  |

> Catatan istilah: dokumen lama menyebut tipe 0 sebagai "voucher". Nama ERP yang benar adalah **Pengakuan Biaya** (`TYPE_PENGAKUAN_BIAYA`).

### 4.7 Tabel lain

| Tabel                                   | Penjelasan                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cash_flow_group` dan `cash_flow_setup` | Klasifikasi arus kas milik klien. `cash_flow_group` = tiga laci (OPERATING, INVESTING, FUNDING). `cash_flow_setup` = daftar sub-baris ("Penerimaan dari pelanggan", "Pembelian asset", …) dan akun wakil. ERP tidak memakai akun wakil secara langsung, tetapi pasangan `account_group` + `sub_account_group` akun itu. Dipakai Cash Flow (8.4). Celah pemetaan klien tercatat di O13 |
| `coa_budget`                            | Anggaran per akun per bulan. **`bgt_month` 0-based** (Januari = 0). `budget_type = 1` Accounting (semua akun laba rugi, dipakai Budget vs Actual), `2` Operasional (hanya Revenue, tampil sebagai "Target Operasional"). `segment1_id` = lokasi                                                                                                                                       |
| `system_main`                           | Tabel pengaturan _key-value_ ERP. Dashboard membaca dan menulis **satu baris** dengan `name = 'DASHBOARD_ACCOUNT_MAPPING'` (`groupprop='Application'`, `valtype='STRING'`, `distype=''`, `company_id=0`, kolom `valueprop` berisi JSON). Ini **satu-satunya** penulisan ke tabel ERP dan hanya dilakukan dari Settings (D13, S5)                                                      |
| `sysuser`                               | Akun login (`login_id`, `password`, `user_status`). ⚠️ Password tersimpan **plain text** (tabel lama ERP): dashboard hanya membandingkannya di server dengan `timingSafeEqual`, tidak pernah mengembalikan, mencatat di log, atau menyimpan di cache (O8)                                                                                                                             |

### 4.8 Tabel yang sengaja tidak dipakai

| Tabel/kolom                                  | Alasan                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `department` dan semua kolom `department_id` | Dashboard tanpa dimensi departemen (D9). Rincian biaya lewat pohon akun dan entitas                                 |
| `bank_account`, `acc_link.location_id`       | Info dari user (D9)                                                                                                 |
| `acc_link`                                   | Daftar akun lawan untuk dropdown formulir ERP, bukan klasifikasi akun, jadi tidak dipakai menentukan akun kas (D10) |
| `journal`, `journal_detail`                  | Versi lama jurnal; jurnal aktif = `gl` dan `gl_detail` (D6)                                                         |
| `ar_card_*`, `ap_card_*`                     | Subledger lama; yang dipakai `ap_ar_card` (D7)                                                                      |
| `coa_opening_balance` (tanpa lokasi)         | Diganti `coa_opening_balance_location`                                                                              |
| `balance_gl`                                 | Cache laba rugi buatan ERP; bisa basi bila jurnal berubah setelah "Generate". Hanya cocok untuk rekonsiliasi (D26)  |
| `payment_status` pada kartu                  | Tidak bisa dipercaya sebagai "sudah dibayar" (D16)                                                                  |
| `bankpo_payment_detail` untuk sisa utang     | Duplikat kartu bayar; menjumlah keduanya menghitung ganda (D16)                                                     |

---

## 5. Tabel milik dashboard (`dash_*`)

### 5.1 Apa itu tabel `dash_*` dan mengapa ada

**Masalahnya.** Tabel ERP yang paling berat, `ap_ar_card` dan `gl`/`gl_detail`, berisi jutaan baris. Beberapa angka (sisa utang per vendor, umur utang, arus kas per bulan) tidak bisa dijawab cepat bila setiap kali halaman dibuka database harus membaca ulang jutaan baris itu. Pengukuran awal (`docs/performance-measurement.md`, `plans/00_phase0_overview.md`) menemukan: Runway 52–60 detik, Cash Flow YTD 172–186 detik, dan AP Aging ±91 detik pada data demo tanpa indeks tambahan (`docs/progress.md`).

**Solusinya.** Dashboard menyimpan **salinan hasil hitung yang ringkas** di tabel miliknya sendiri, di database yang sama dengan ERP. Semua nama tabel diawali **`dash_`** supaya jelas ini milik dashboard dan bukan ERP. Tabel ini:

- **berisi turunan data ERP**, bukan data asli. Hilang pun tidak apa-apa; selalu bisa dibangun ulang dari ERP;
- **dibangun oleh proses latar belakang** (bagian 5.4), bukan saat pengguna membuka halaman;
- **hanya dihitung ulang bila perlu** (sidik jari, bagian 5.5);
- **dibaca lebih dulu**; bila tidak tersedia atau tidak mencakup tanggal yang diminta, query langsung ke ERP dipakai (lebih lambat, tetapi angkanya sama).

**Yang dijaga otomatis oleh tes** (`src/server/dash/guard.test.ts`): kode dashboard **tidak boleh** menulis ke tabel mana pun yang tidak berawalan `dash_`. Satu-satunya penulisan lain adalah baris `DASHBOARD_ACCOUNT_MAPPING` di `system_main` (Settings). Dashboard tidak pernah menjalankan `drizzle-kit push` atau migrasi terhadap tabel ERP.

**Asal-usul (riwayat singkat).**

| Kapan      | Migrasi                | Yang ditambahkan                                                                                                   | Alasan                                                                                                                           |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-29 | `0000`, `0001`, `0002` | `dash_snap_meta`, `dash_snap_ap_ar_open`, `dash_snap_ap_ar_unallocated`, lalu kolom `fingerprint` dan `checked_at` | AP/AR Aging terlalu lambat; hitung sekali, baca berkali-kali                                                                     |
| 2026-10-29 | `0003`                 | `dash_snap_gl_monthly`, `dash_snap_gl_periods`                                                                     | Angka laba rugi dan Revenue bulan yang sudah ditutup tidak berubah, jadi tidak perlu dihitung dari jutaan baris jurnal tiap kali |
| 2026-10-29 | `0004`                 | `dash_snap_ap_ar_hist_*` (3 tabel)                                                                                 | "Bulan lalu" dan pembanding AP/AR timeout karena harus menghitung utang pada tanggal lampau dari nol                             |
| 2026-11-04 | `0005` (fase 1A)       | Kolom sidik jari periode pada `dash_snap_gl_periods`                                                               | Admin ERP bisa membuka dan menutup ulang periode lama; salinan harus ikut diperbarui                                             |
| 2026-11-04 | `0006` (fase 1B)       | `dash_snap_cash_lines`, `dash_snap_cash_periods`                                                                   | Runway dan Cash Flow butuh baris jurnal kas yang berat dibaca ulang tiap kali                                                    |

Fase performa lain (2–6) tidak menambah tabel; lihat bab 9.

### 5.2 Peta tabel `dash_*`

| Tabel                              | Isi                                                                                 | Dibangun oleh         | Dipakai oleh                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| `dash_snap_meta`                   | Status dan waktu bangun snapshot AP/AR ("Data as of …")                             | `refresh-ap-ar.ts`    | Sidebar, semua pembacaan AP/AR                            |
| `dash_snap_ap_ar_open`             | Tagihan AP dan AR yang masih punya sisa (hari ini)                                  | `refresh-ap-ar.ts`    | Payables, Receivables, Payment Plan, Summary              |
| `dash_snap_ap_ar_unallocated`      | Pembayaran/retur yang belum dialokasikan (hari ini)                                 | `refresh-ap-ar.ts`    | Payables, Receivables                                     |
| `dash_snap_ap_ar_hist_dates`       | Daftar akhir bulan yang sudah punya riwayat                                         | `hist-ap-ar.ts`       | Menentukan apakah riwayat boleh dipakai                   |
| `dash_snap_ap_ar_hist_open`        | Seperti `…_open`, pada akhir bulan lampau                                           | `hist-ap-ar.ts`       | Payables/Receivables untuk "Bulan lalu", pembanding       |
| `dash_snap_ap_ar_hist_unallocated` | Seperti `…_unallocated`, pada akhir bulan lampau                                    | `hist-ap-ar.ts`       | Idem                                                      |
| `dash_snap_gl_periods`             | Penanda periode Closed yang sudah disalin + sidik jarinya                           | `gl-snapshot.ts`      | Menentukan periode mana yang boleh dibaca dari snapshot   |
| `dash_snap_gl_monthly`             | Jumlah debit/kredit per periode × akun × entitas                                    | `gl-snapshot.ts`      | Revenue, P&L, Budget, Cash Position (via mutasi), Summary |
| `dash_snap_cash_periods`           | Penanda periode Closed yang baris kasnya sudah disalin + sidik jari + hash akun kas | `cash-lines-build.ts` | Menentukan apakah baris kas boleh dibaca dari snapshot    |
| `dash_snap_cash_lines`             | Baris jurnal yang menyentuh akun kas                                                | `cash-lines-build.ts` | Cash Flow, Runway, Expense Paid                           |

Skema ada di `src/server/dash/schema.ts` (sumber untuk `drizzle.dash.config.ts`); migrasi SQL di folder `drizzle-dash/` (tabel migrasi bernama `dash_migrations`).

### 5.3 Tabel satu per satu

#### 5.3.1 `dash_snap_meta`: status snapshot

- **Tujuan:** satu baris per snapshot (saat ini hanya `name = 'ap_ar'`): kapan terakhir dibangun, untuk tanggal berapa, berapa lama, apakah berhasil.
- **Kolom:** `name` (kunci), `refreshed_at` (kapan baris data terakhir **dibangun ulang**), `checked_at` (kapan terakhir **diperiksa** dan ternyata ERP tidak berubah), `as_of_date` (tanggal yang digambarkan snapshot), `row_count`, `duration_ms`, `fingerprint` (ringkasan tabel ERP saat dibangun), `status` (`ok` / `running` / `failed`), `error` (pesan bila gagal, maksimal 1000 karakter).
- **Dibaca:** `snapshot.ts` (`apArSnapshotInfo`): hasilnya tampil di sidebar sebagai "Data as of …". Query:

```sql
SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
       DATE_FORMAT(refreshed_at, '%Y-%m-%dT%H:%i:%sZ') AS refreshedAt,
       DATE_FORMAT(COALESCE(checked_at, refreshed_at), '%Y-%m-%dT%H:%i:%sZ') AS checkedAt,
       status AS status, row_count AS rowCount, duration_ms AS durationMs, error AS error
FROM dash_snap_meta WHERE name = 'ap_ar' LIMIT 1
```

- **Snapshot dianggap basi (peringatan di sidebar)** bila: `as_of_date` lebih awal dari hari ini, **atau** terakhir diperiksa lebih lama dari `max(3 × DASH_REFRESH_MINUTES, 30)` menit (artinya refresh gagal atau pekerjaan latar belakang tidak jalan) ✅ (`src/lib/finance/ap-ar/snapshot-state.ts`).

#### 5.3.2 `dash_snap_ap_ar_open`: tagihan yang masih terbuka

- **Tujuan:** daftar semua tagihan AP (`module_type = 0`) dan AR (`module_type = 1`) yang sisanya ≠ 0 pada hari ini. Menggantikan perhitungan sisa dari jutaan kartu setiap kali halaman dibuka.
- **Kolom:** `card_id` (kunci utama; sama dengan `ap_ar_card_id`), `module_type`, `party_id` (vendor/customer), `location_id` (entitas), `coa_id`, `tx_date`, `due_date`, `item_type` (= `transaction_type` kartu), `invoice_number`, `original_amount` (nominal asli bertanda), `balance` (sisa bertanda).
- **Indeks:** `idx_dash_open_mod_loc_due (module_type, location_id, due_date)` dan `idx_dash_open_mod_party (module_type, party_id)`.
- **Cara dibangun:** bagian 5.6 (rebuild AP/AR). Seluruh tabel diganti sekaligus lewat tabel bayangan `_new` + `RENAME TABLE` yang atomik, jadi pembaca tidak pernah melihat tabel setengah jadi.
- **Dibaca oleh:** `src/server/dash/snapshot.ts` (daftar tagihan), `snapshot-aggregate.ts` (penjumlahan aging dan jatuh tempo langsung di SQL). Pembacaan satu sisi penuh memakai `FORCE INDEX (PRIMARY)` (`scan-hint.ts`, D48) karena tanpa itu optimizer memilih indeks sekunder yang 6–10 kali lebih lambat.
- **Cakupan:** hanya "hari ini". Untuk tanggal sebelum `as_of_date` snapshot tidak bisa dipakai (`apArSnapshotCovers`).

#### 5.3.3 `dash_snap_ap_ar_unallocated`: retur langsung (AR) dan pembayaran belum dialokasikan (AP)

- **Tujuan:** kartu pelunasan (pembayaran AP, retur langsung AR) yang **tidak punya baris detail sendiri**, sehingga belum dikaitkan ke tagihan. Mengurangi utang/piutang pihak itu tetapi tidak menempel ke tagihan tertentu. Nama tabel `dash_snap_ap_ar_unallocated` tetap dipertahankan demi stabilitas basis kode (K2).
- **Kolom:** `card_id`, `module_type`, `party_id`, `location_id`, `coa_id`, `tx_date`, `balance` (bertanda; untuk AP = nominal penuh `amount × in_out`, untuk AR = **sisa** retur langsung setelah pelunasan yang menunjuk ke retur), dan `kind` (`varchar(10)`: `'counted'` atau `'ignored'`).
- **Indeks:** `idx_dash_unalloc_mod_loc (module_type, location_id)`.
- **Tipe dan kolom `kind`:**
  - AP (`module_type = 0`): semua tipe pelunasan (7, 8, 9, 10, 11, 13, 14), selalu berstatus `kind = 'counted'`.
  - AR (`module_type = 1`): retur langsung (tipe 2) berstatus `kind = 'counted'`. Pembayaran pelanggan AR tipe 1 tanpa alokasi disimpan dengan `kind = 'ignored'` (tidak pernah dijumlahkan ke saldo piutang agar selalu sama dengan laporan AR Aging ERP; dipantau khusus oleh data check `AR_PAYMENT_UNALLOC`).
- **Aturan pembaca:** semua query yang membaca tabel ini untuk perhitungan angka wajib menyaring `AND kind = 'counted'`.

#### 5.3.4 `dash_snap_ap_ar_hist_dates`, `…_hist_open`, `…_hist_unallocated`: riwayat akhir bulan

- **Tujuan:** potret utang/piutang pada **akhir setiap bulan yang sudah selesai** (default 13 bulan terakhir, diatur `DASH_AP_AR_HIST_MONTHS`). Dipakai untuk "Bulan lalu", pembanding periode, dan tanggal lampau yang tepat jatuh di akhir bulan.
- **Kolom:** sama dengan tabel hari ini (termasuk kolom `kind`), ditambah `as_of_date` di depan kunci utama (`as_of_date, card_id`). Hanya baris dengan `kind = 'counted'` yang dijumlahkan ke riwayat piutang/utang. `…_hist_dates` mencatat tiap akhir bulan yang **lengkap** (`as_of_date`, `built_at`, `row_count`, `duration_ms`, `is_final`, `formula_version`).
- **Aturan:** satu bulan dibangun per siklus refresh. Dua bulan terbaru ("provisional") dibangun ulang bila umurnya ≥ 24 jam, sampai periode ERP-nya Closed atau umurnya lewat dua bulan ("final", `is_final = 1`) ✅ (`ap-ar-hist-plan.ts`). Bulan yang dibangun dengan versi rumus lebih lama dari `AP_AR_FORMULA_VERSION` (sekarang 2) dibangun ulang, juga yang berstatus final; satu bulan per siklus, terbaru dulu; baris lama tetap terbaca sampai diganti. Bulan yang lebih lama dari jumlah bulan yang diminta dihapus.
- **Penulisan:** satu bulan ditulis dalam **satu transaksi** bersama penandanya di `…_hist_dates`, jadi pembaca tidak pernah melihat bulan setengah jadi.
- **Urutan baca:** snapshot hari ini → riwayat akhir bulan (hanya bila `asOf` tepat akhir bulan yang ada di `…_hist_dates`) → query langsung ke ERP (lambat; untuk tanggal lampau lain).

#### 5.3.5 `dash_snap_gl_periods` dan `dash_snap_gl_monthly`: mutasi GL periode Closed

- **Tujuan:** untuk setiap periode berstatus **Closed**, jumlah debit dan kredit per akun per entitas. Periode tertutup tidak berubah lagi, jadi tidak perlu dihitung dari jutaan baris jurnal pada setiap permintaan.
- **`dash_snap_gl_monthly`** (kunci `period_id, coa_id, segment_id`): `debet`, `credit`. `segment_id` = nilai segmen entitas (`segment1_id`); **`0` berarti jurnal tanpa segmen** ("tanpa entitas").
- **`dash_snap_gl_periods`** (kunci `period_id`): `built_at`, `row_count`, `duration_ms`, `period_key`, `stats_key` (sidik jari, bagian 5.5), `checked_at`.
- **Pembaca:** `gl.repo.ts` memakai snapshot untuk periode yang ada di `dash_snap_gl_periods`, dan query ERP langsung untuk sisanya (periode Open/Pre Closed, atau Closed yang belum dibangun). Hasil periode Closed juga disimpan di memori server (LRU) dengan kunci yang memuat versi bangun, supaya hasil lama tidak terpakai setelah periode dibangun ulang.
- **Hanya kolom segmen `segment1_id`** yang disalin (`SNAPSHOT_SEGMENT_COLUMN`); segmen lain selalu dibaca dari ERP.

#### 5.3.6 `dash_snap_cash_periods` dan `dash_snap_cash_lines`: baris jurnal kas periode Closed

- **Tujuan:** semua baris dari jurnal posted yang **menyentuh minimal satu akun kas** (keranjang Kas, Bank, Deposito), untuk periode Closed. Cash Flow dan Runway membutuhkan **baris tiap jurnal** (bukan jumlah), karena alokasi proporsional kas dan filter entitas bergantung pada isi tiap jurnal (D44).
- **`dash_snap_cash_lines`**: `period_id`, `gl_id`, `journal_type`, `coa_id`, `segment_id` (boleh NULL), `is_cash` (1 bila baris itu akun kas), `debet`, `credit`. Tanpa kunci utama (baris diganti per periode). Indeks `idx_dash_cash_key (period_id, is_cash, segment_id, gl_id)` dan `idx_dash_cash_period_gl (period_id, gl_id)`.
- **`dash_snap_cash_periods`**: seperti `dash_snap_gl_periods`, ditambah `cash_hash` = sidik jari **daftar akun kas** saat dibangun.
- **Dipakai hanya bila** daftar akun kas sekarang (hash) sama dengan `cash_hash` dan kolom segmen entitas adalah `segment1_id`; jika tidak, query langsung ke ERP. Mengubah Account Mapping (keranjang kas) otomatis membuat periode dibangun ulang pada siklus berikutnya.
- **Batas:** snapshot ini hanya dibangun bila jumlah akun kas ≤ 1000 (`CASH_LINES_MAX_ACCOUNTS`).

### 5.4 Siapa yang membangun dan kapan

```text
 Server menyala  ──► scheduler dimulai (src/server-entry.ts; cadangan: middleware tiap request)
                      │
                      │  pertama kali: menunggu sampai snapshot berumur ≥ DASH_REFRESH_MINUTES
                      ▼
          tiap DASH_REFRESH_MINUTES (default 10 menit)  ──►  runRefreshCycle('scheduler', force=false)
                                                              ▲
 Pengguna menekan "Perbarui sekarang" ────────────────────────┘  runRefreshCycle('manual', force=true)
```

Satu **siklus refresh** (`src/server/dash/refresh-cycle.ts`) menjalankan langkah berikut berurutan; kegagalan dicatat di log dan tidak mematikan server. Riwayat akhir bulan yang berversi rumus lebih lama dari `AP_AR_FORMULA_VERSION` (sekarang 2) dibangun ulang otomatis satu bulan per siklus, dimulai dari yang terbaru:

| #   | Langkah                              | Hasil                                                                                                                     | Kapan benar-benar bekerja                                                                                                |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0   | Cek migrasi                          | Bila ada migrasi `dash_*` yang belum diterapkan, siklus **dilewati** dan peringatan dicatat                               | Setiap siklus                                                                                                            |
| 1   | **AP/AR snapshot**                   | Isi `dash_snap_ap_ar_open` dan `…_unallocated`                                                                            | Bila sidik jari ERP berubah, **atau** snapshot untuk hari yang lalu, **atau** umurnya ≥ 1 jam, **atau** manual (`force`) |
| 2   | Warm invoice lists                   | Memuat snapshot baru ke memori server agar permintaan pertama tidak menunggu                                              | Setiap siklus                                                                                                            |
| 3   | **GL snapshot**                      | Bangun/bangun ulang/hapus periode di `dash_snap_gl_*`                                                                     | Hanya bila ada periode baru, berubah, atau dibuka ulang                                                                  |
| 4   | **Cash lines snapshot**              | Sama untuk `dash_snap_cash_*` (kegagalan di sini tidak menghentikan langkah berikutnya; query langsung dipakai sementara) | Idem                                                                                                                     |
| 5   | **AP/AR history**                    | Satu bulan baru per siklus                                                                                                | Bila ada bulan hilang/provisional yang basi                                                                              |
| 6   | (manual saja) Kosongkan cache metrik | Pengguna yang menekan tombol langsung melihat angka baru                                                                  | Hanya manual                                                                                                             |

Perlindungan agar tidak bentrok:

- **Satu siklus per proses server** (penanda `running`) dan **kunci advisory MySQL** per langkah (`GET_LOCK`: `dash_refresh_ap_ar`, `dash_refresh_gl`, `dash_refresh_cash`, `dash_refresh_ap_ar_hist`) untuk beberapa proses server.
- **Pool koneksi terpisah** (`DASH_POOL_SIZE`, default 2) untuk pembangunan snapshot, supaya query berat refresh tidak berebut koneksi dengan permintaan pengguna (D46). Sesi refresh mematikan batas waktu per-query (`max_execution_time`, `max_statement_time`).
- **Cooldown manual 2 menit** dihitung dari `refreshed_at` (`MANUAL_REFRESH_COOLDOWN_MS`), supaya tombol yang ditekan berulang tidak membangun ulang berulang (U8 di `decisions.md`).
- **Penulisan atomik:** tabel AP/AR hari ini lewat tabel bayangan dan `RENAME`; periode GL/kas dan bulan riwayat dalam satu transaksi dengan penandanya. Pembaca selalu melihat versi lama atau versi baru yang lengkap.
- **Kegagalan:** snapshot lama tetap dipakai; `dash_snap_meta.status = 'failed'` dan pesan error tersimpan (dipotong 1000 karakter). Pesan mentah tidak dikirim ke browser.

### 5.5 Sidik jari (fingerprint): bagaimana dashboard tahu snapshot sudah usang

Snapshot yang dianggap benar selamanya akan salah bila data ERP berubah. Karena itu setiap snapshot membawa **sidik jari**, yaitu ringkasan murah dari keadaan ERP saat dibangun. Pada siklus berikutnya sidik jari dibandingkan; bila beda, snapshot dibangun ulang.

| Snapshot               | Sidik jari                                                                                                                                                   | Mendeteksi                                                                                                      | Tidak mendeteksi                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AP/AR hari ini         | `COUNT(*)` dan `MAX(id)` dari `ap_ar_card` dan `ap_ar_card_detail`                                                                                           | Kartu atau alokasi baru atau dihapus                                                                            | Perubahan nilai pada kartu lama. Karena itu dibangun ulang paksa bila umurnya ≥ **1 jam**, dan oleh tombol "Perbarui sekarang"                                                                                |
| GL dan kas per periode | `period_key` = `tabel GL \| tanggal mulai \| tanggal akhir \| tipe`; `stats_key` = `jumlah jurnal : id jurnal tertinggi : jumlah posted : jumlah dibatalkan` | Jurnal ditambah, dihapus, diposting, dibatalkan; periode dibuka lalu ditutup ulang dengan tanggal/tabel berbeda | Perubahan **angka di dalam** jurnal lama yang tidak mengubah hitungan. Dua periode Closed terbaru dibangun ulang penuh tiap 24 jam; periode lebih tua hanya lewat `npm run dash:refresh-gl -- --rebuild <id>` |

Aturan keputusan per periode Closed yang sudah ada di snapshot (`verifyDecision`, `period-fingerprint.ts`) ✅:

1. Belum punya sidik jari (dibangun sebelum fase 1A), atau `period_key` berubah → **bangun ulang**.
2. Termasuk **2 periode Closed terbaru** dan sudah berumur > 24 jam → **bangun ulang penuh**.
3. Periode terbaru, atau terakhir dibandingkan ≥ 6 jam lalu (periode lebih tua) → **bandingkan hitungan jurnal** (`check-stats`): sama → simpan (hanya `checked_at` maju); beda → bangun ulang.
4. Selain itu → simpan apa adanya.
5. Periode yang sudah tidak Closed (dibuka ulang) → baris snapshot **dihapus**.
6. (Khusus kas) `cash_hash` berbeda dari hash akun kas sekarang → bangun ulang apa pun hasil sidik jari.

Sidik jari diambil **sebelum** baris dibaca. Jurnal yang berubah ketika periode sedang dibangun terdeteksi pada siklus berikutnya, bukan terlewat. Hitungan jurnal yang dibandingkan oleh langkah GL dan langkah kas dipakai bersama selama 60 detik (satu mesin, `closed-period-refresh.ts`, D49).

Setelah ada periode yang dibangun ulang atau dihapus, cache turunannya dikosongkan (`invalidate.ts`: daftar periode, baris kas, mutasi periode Closed, semua cache metrik).

### 5.6 Query pembangun snapshot (SQL asli dari kode)

> Parameter ditulis sebagai `?` atau nama kolom. Nama tabel GL (`gl`/`gl_2020`, `gl_detail`/`gl_detail_2020`) berasal dari kolom `periode.table_name` dan divalidasi (`gl-tables.ts`) sebelum disisipkan. ✅ dicek ke kode. Query pembangun ini **belum dijalankan** oleh dokumen ini; yang dicek ke database (🔵) hanya struktur dan isi tabel hasilnya (bab 12.3).

#### B1. Rebuild AP/AR: pelunasan per tagihan (`loadSettlementSums`)

Dua pemindaian sederhana yang digabung di Node (bukan satu join besar), karena join dengan `GROUP BY` memakan 80–95 detik pada 2 juta kartu, sedangkan dua pemindaian sekitar 11 detik (`docs/performance-measurement.md` §14.3, D50). Pemindaian ini dijalankan sekali per sisi melalui `loadSideRows` dan dipakai bersama oleh B2 (tagihan terbuka) dan B3 (retur langsung AR).

```sql
-- (1) kartu pelunasan sisi ini, tanggal < asOf + 1
SELECT p.ap_ar_card_id FROM ap_ar_card p FORCE INDEX (PRIMARY)
WHERE p.module_type = :modul AND p.transaction_type IN (:tipe_pelunasan)
  AND p.in_out IN (-1, 1) AND p.transaction_date < ?;

-- (2) semua baris detail; yang kartunya ada di (1) dijumlahkan per invoice_id di Node
SELECT d.invoice_id, d.ap_ar_card_id, d.amount FROM ap_ar_card_detail d;
```

Penjelasan: langkah (1) mengumpulkan id kartu pembayaran/retur/penyesuaian yang berlaku sampai tanggal acuan. Langkah (2) membaca semua alokasi; hanya alokasi dari kartu di (1) yang dijumlahkan per tagihan. Hasilnya = "berapa yang sudah dilunasi untuk tiap tagihan".

#### B2. Rebuild AP/AR: tagihan terbuka (`loadOpenInvoices`)

```sql
-- (3) semua tagihan sisi ini (di-stream, dihitung di Node: sisa = nominal×arah + total pelunasan)
SELECT i.ap_ar_card_id, i.amount * i.in_out FROM ap_ar_card i FORCE INDEX (PRIMARY)
WHERE i.module_type = :modul AND i.transaction_type IN (:tipe_tagihan)
  AND i.in_out IN (-1, 1) AND i.transaction_date < ?;

-- (4) kolom deskriptif hanya untuk tagihan yang sisanya ≠ 0, per kelompok id
SELECT ap_ar_card_id, owner_id, location_id, coa_id, DATE(transaction_date), due_date, transaction_type,
       COALESCE(NULLIF(invoice_number, ''), transaction_number, '')
FROM ap_ar_card WHERE ap_ar_card_id IN (?);
```

Tipe: `:tipe_tagihan` AP = 0,1,2,3,4,5,6,12; AR = 0,3,4,5. `:tipe_pelunasan` AP = 7,8,9,10,11,13,14; AR = 1,2. Tagihan yang sisanya nol dibuang (`openBalance`). Tanggal kosong atau `0000-…` ditulis `1900-01-01`.

#### B3. Rebuild AP/AR: pembayaran belum dialokasikan (`loadUnallocated`)

```sql
SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.coa_id, DATE(p.transaction_date), p.amount * p.in_out
FROM ap_ar_card p
WHERE p.module_type = :modul AND p.transaction_type IN (:tipe_tanpa_alokasi)
  AND p.in_out IN (-1, 1) AND p.transaction_date < ?
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id);
```

`:tipe_tanpa_alokasi`: AP = 7,8,9,10,11,13,14; AR = 2. Untuk AR, SQL sama persis, tetapi sisa dihitung di Node: `openBalance(-nominal, jumlah pelunasan yang menunjuk ke retur)`; retur yang sisanya 0 dibuang.

#### B4. Sidik jari AP/AR dan penulisan

```sql
SELECT COUNT(*), MAX(ap_ar_card_id) FROM ap_ar_card;
SELECT COUNT(*), MAX(ap_ar_card_detail_id) FROM ap_ar_card_detail;
```

Penulisan: `CREATE TABLE dash_snap_ap_ar_open_new LIKE dash_snap_ap_ar_open` → `INSERT` per 1000 baris → `RENAME TABLE dash_snap_ap_ar_open TO …_old, …_new TO dash_snap_ap_ar_open` → hapus `…_old`. Hal yang sama untuk `…_unallocated`. Lalu satu baris `dash_snap_meta` diperbarui (`ON DUPLICATE KEY UPDATE`).

#### B5. Snapshot GL per periode (`gl-snapshot.ts`)

```sql
-- dijalankan dalam satu transaksi per periode
DELETE FROM dash_snap_gl_monthly WHERE period_id = ?;

INSERT INTO dash_snap_gl_monthly (period_id, coa_id, segment_id, debet, credit)
SELECT STRAIGHT_JOIN g.period_id, d.coa_id, COALESCE(d.segment1_id, 0),
       COALESCE(SUM(d.debet), 0), COALESCE(SUM(d.credit), 0)
FROM gl g JOIN gl_detail d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1 [AND g.canceled_date IS NULL] AND g.period_id = ?
GROUP BY g.period_id, d.coa_id, COALESCE(d.segment1_id, 0);

INSERT INTO dash_snap_gl_periods (period_id, built_at, row_count, duration_ms, period_key, stats_key, checked_at)
VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms),
                        period_key = VALUES(period_key), stats_key = VALUES(stats_key), checked_at = VALUES(checked_at);
```

Penjelasan: untuk satu periode, jumlahkan debit dan kredit semua jurnal posted per akun dan per segmen entitas. `STRAIGHT_JOIN` memaksa mulai dari `gl` (indeks periode) lalu ke `gl_detail`. `COALESCE` mengubah nilai kosong menjadi 0 karena kolom snapshot tidak boleh NULL (MySQL 5.7 dalam mode ketat menolak NULL). Bagian `[AND g.canceled_date IS NULL]` dipasang hanya bila tabel `gl` punya kolom itu (D31).

#### B6. Sidik jari periode (`gl-period-stats.repo.ts`)

```sql
SELECT COUNT(*) AS journals,
       COALESCE(MAX(g.gl_id), 0) AS maxGlId,
       COALESCE(SUM(g.posted_status = 1), 0) AS posted,
       COALESCE(SUM(g.canceled_date IS NOT NULL), 0) AS canceled   -- 0 bila kolom tidak ada
FROM gl g
WHERE g.period_id = ?;
```

Versi banyak periode (`glPeriodStatsOfTable`, dipakai pemeriksaan periode lama):

```sql
SELECT g.period_id AS periodId, COUNT(*) AS journals,
       COALESCE(MAX(g.gl_id), 0) AS maxGlId,
       COALESCE(SUM(g.posted_status = 1), 0) AS posted,
       COALESCE(SUM(g.canceled_date IS NOT NULL), 0) AS canceled   -- 0 bila kolom tidak ada
FROM gl g
WHERE g.period_id IN (:id_periode)      -- per potongan 1.000 periode
GROUP BY g.period_id;
```

Pemeriksaan periode lama memakai versi ini: satu query per tabel GL untuk semua periode yang jatuh tempo diperiksa, bukan satu query per periode. Periode tanpa jurnal tidak muncul di hasil dan dihitung nol. Pembangunan periode tetap memakai versi satu periode (hitungan harus segar). Cache 60 detik per periode tidak berubah.

Hanya membaca kepala jurnal (satu rentang indeks `period_id`), bukan baris detail.

#### B7. Snapshot baris kas per periode (`cash-lines-build.ts`)

```sql
DELETE FROM dash_snap_cash_lines WHERE period_id = ?;

INSERT INTO dash_snap_cash_lines (period_id, gl_id, journal_type, coa_id, segment_id, is_cash, debet, credit)
SELECT g.period_id, d.gl_id, COALESCE(g.journal_type, 0), d.coa_id, d.segment1_id,
       MAX(CASE WHEN d.coa_id IN (:akun_kas) THEN 1 ELSE 0 END),
       COALESCE(SUM(d.debet), 0), COALESCE(SUM(d.credit), 0)
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
JOIN (
  SELECT DISTINCT STRAIGHT_JOIN d2.gl_id
  FROM gl g2 JOIN gl_detail d2 ON d2.gl_id = g2.gl_id
  WHERE g2.posted_status = 1 [AND g2.canceled_date IS NULL] AND g2.period_id = ? AND d2.coa_id IN (:akun_kas)
) k ON k.gl_id = g.gl_id
WHERE g.posted_status = 1 [AND g.canceled_date IS NULL] AND g.period_id = ?
GROUP BY g.period_id, d.gl_id, g.journal_type, d.coa_id, d.segment1_id;

INSERT INTO dash_snap_cash_periods (period_id, built_at, row_count, duration_ms, period_key, stats_key, checked_at, cash_hash)
VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, UTC_TIMESTAMP(), ?)
ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms),
                        period_key = VALUES(period_key), stats_key = VALUES(stats_key), checked_at = VALUES(checked_at),
                        cash_hash = VALUES(cash_hash);
```

Penjelasan: subquery `k` mencari jurnal posted periode ini yang punya **setidaknya satu baris akun kas**. Query luar lalu mengambil **semua baris** jurnal-jurnal itu (termasuk sisi lawannya: pendapatan, biaya, piutang, dst.) dan menjumlahkannya per jurnal/akun/segmen. Kolom `is_cash` menandai baris yang akunnya kas.

#### B8. Riwayat akhir bulan (`hist-ap-ar.ts`)

Memakai B1–B3 untuk `asOf` = akhir bulan, lalu dalam **satu transaksi**: hapus baris bulan itu dari `…_hist_open` dan `…_hist_unallocated`, `INSERT` per 1000 baris dengan kolom `as_of_date` di depan, dan `INSERT … ON DUPLICATE KEY UPDATE` satu baris di `dash_snap_ap_ar_hist_dates` (`is_final` 1/0).

### 5.7 Query pembacaan snapshot

| Kode | Dari                            | SQL                                                                                                                                                                                                                                                                                                                         | Dipakai                                                                                                                            |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1   | `dash_snap_ap_ar_open` (daftar) | `SELECT card_id AS invoiceId, party_id AS partyId, location_id AS locationId, coa_id AS coaId, tx_date AS txDate, due_date AS dueDate, item_type AS itemType, invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance FROM dash_snap_ap_ar_open FORCE INDEX (PRIMARY) WHERE module_type = ?` | Daftar tagihan (tabel tagihan, drill-down); seluruh satu sisi dimuat sekali per versi snapshot lalu disaring per entitas di memori |
| S2   | `dash_snap_ap_ar_unallocated`   | `SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId, tx_date AS txDate, balance AS balance FROM dash_snap_ap_ar_unallocated WHERE module_type = ?`                                                                                                                                   | Idem                                                                                                                               |
| S3   | Riwayat                         | Seperti S1/S2 pada `dash_snap_ap_ar_hist_open` / `…_unallocated` dengan `WHERE as_of_date = ? AND module_type = ?`                                                                                                                                                                                                          | "Bulan lalu", pembanding                                                                                                           |
| S4   | Aging dan jatuh tempo           | Dijumlahkan langsung di SQL (`snapshot-aggregate.ts`, bab 8.7)                                                                                                                                                                                                                                                              | Payables, Receivables, Payment Plan                                                                                                |
| S5   | `dash_snap_gl_monthly`          | Pembacaan mutasi (Q12, bab 7)                                                                                                                                                                                                                                                                                               | Revenue, P&L, dst.                                                                                                                 |
| S6   | `dash_snap_cash_lines`          | Pembacaan baris kas (bab 8.4)                                                                                                                                                                                                                                                                                               | Cash Flow, Runway                                                                                                                  |

### 5.8 Cara menjaga tabel `dash_*`

| Tugas                                   | Perintah                                                                   | Catatan                           |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| Buat file migrasi baru dari `schema.ts` | `npm run db:dash:generate`                                                 | Tidak menyentuh database          |
| Periksa konsistensi migrasi             | `npm run db:dash:check`                                                    |                                   |
| Lihat migrasi yang belum diterapkan     | `npm run db:dash:status`                                                   | Menyentuh DB, **minta izin dulu** |
| Terapkan migrasi                        | `npm run db:dash:migrate` atau `AUTO_MIGRATE=1` saat server mulai          | Idem                              |
| Bangun snapshot AP/AR sekarang          | `npm run dash:refresh`                                                     | Idem                              |
| Bangun snapshot GL periode Closed       | `npm run dash:refresh-gl` (`-- --rebuild <id>` untuk memaksa satu periode) | Idem                              |
| Bangun snapshot baris kas               | `npm run dash:refresh-cash`                                                | Idem                              |
| Bangun riwayat akhir bulan              | `npm run dash:refresh-hist` (`-- --max N` membatasi jumlah bulan)          | Idem                              |

**Aturan penting untuk developer:** tabel `dash_*` baru wajib (a) ditambahkan di `schema.ts` dan `tables.ts`, (b) punya migrasi di `drizzle-dash/`, (c) hanya ditulis lewat `dashTable()`, (d) ditulis dalam dokumen ini (bab 5.2, 5.3, 5.6) beserta riwayat dan pertanyaan konfirmasinya. File baru di `src/server/dash/` tidak boleh mengandung frasa penulisan data (bahkan di komentar) yang dibaca `guard.test.ts` sebagai penulisan ke tabel non-`dash_`.

### 5.9 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                                                                                           | Default sementara          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| KF-01 | Apakah "Data as of …" yang bisa tertinggal sampai 10 menit (interval refresh) untuk utang/piutang dapat diterima finance? Perubahan pada tagihan lama baru terlihat paling lama 1 jam bila tidak ada tagihan/pembayaran baru, atau segera lewat "Perbarui sekarang". | Dapat diterima ⚠️          |
| KF-02 | Periode Closed yang diedit **di dalam** jurnal lama tanpa mengubah jumlah jurnal hanya terdeteksi untuk dua periode terbaru (24 jam) atau lewat bangun ulang manual. Apakah kejadian ini mungkin di ERP klien, dan bagaimana finance ingin menanganinya?             | Diterima dengan risiko ⚠️  |
| KF-03 | Bila admin ERP membuka ulang periode lama, apakah finance diberi tahu agar angka dicek? (Dashboard hanya membangun ulang diam-diam.)                                                                                                                                 | Tidak ada pemberitahuan ⚠️ |

---

## 6. Aturan perhitungan umum

Aturan di bab ini berlaku untuk **semua** halaman. Sub-bab halaman di bab 8 hanya menyebut pengecualian.

### 6.1 Filter global dan tanggal acuan

Filter disimpan **di alamat URL** (jadi bisa di-bookmark dan dibagikan). Skema: `src/lib/filters/search-schema.ts` ✅.

| Parameter URL | Nilai                                                                  | Arti                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`      | `all` atau daftar `location_id` dipisah koma                           | Entitas yang dijumlahkan. Bila semua entitas dipilih, otomatis menjadi `all`; id yang tidak dikenal diabaikan; bila semuanya tidak dikenal menjadi `all` |
| `preset`      | `this-month` (bawaan), `last-month`, `this-quarter`, `ytd`, `last-12m` | Pilihan periode cepat                                                                                                                                    |
| `from`, `to`  | `YYYY-MM`                                                              | Rentang bulan bebas; bila keduanya ada, **menggantikan** `preset`. Maksimal **60 bulan**                                                                 |
| `p13`         | `true`/`false`                                                         | Sertakan Periode 13 (hanya berlaku untuk YTD, 12 bulan, atau rentang bebas)                                                                              |
| `horizon`     | `7`, `14`, `30`                                                        | Khusus Payment Plan: berapa hari ke depan                                                                                                                |
| `inflow`      | `true`/`false`                                                         | Khusus Payment Plan: sertakan proyeksi penerimaan                                                                                                        |
| `drill`       | JSON                                                                   | Status panel drill-down (metrik dan langkah-langkahnya, maksimal 8 langkah)                                                                              |

Filter diubah menjadi `ResolvedFilter` oleh `resolveFilter` (`src/server/context.ts`): daftar `location_id`, daftar nilai segmen entitas, tanggal awal (`d1`), **tanggal acuan (`asOf`)**, daftar `period_id`, periode pembanding, dan "hari ini".

**"Hari ini"** = `APP_TODAY` bila diisi (untuk uji/rekonsiliasi data lama), selain itu tanggal hari ini menurut `APP_TIMEZONE` (bawaan `Asia/Jakarta`).

**Tanggal acuan (`asOf`)** dan periode pembanding menurut pilihan periode ✅ (`src/lib/finance/period/periods.ts`):

| Pilihan       | Bulan yang dihitung                 | `asOf`                                   | Pembanding                                                       |
| ------------- | ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Bulan ini     | Bulan berjalan                      | Hari ini                                 | **Seluruh** bulan lalu                                           |
| Bulan lalu    | Bulan lalu                          | Akhir bulan lalu                         | **Seluruh** bulan sebelum itu                                    |
| Kuartal ini   | Awal kuartal sampai bulan berjalan  | Hari ini                                 | **Seluruh** kuartal lalu (3 bulan penuh)                         |
| YTD           | Januari sampai bulan berjalan       | Hari ini                                 | Bulan yang sama (Januari sampai bulan itu, **penuh**) tahun lalu |
| 12 bulan      | 12 bulan berakhir di bulan berjalan | Hari ini                                 | 12 bulan sebelumnya (penuh)                                      |
| Rentang bebas | Bulan awal sampai bulan akhir       | Akhir bulan terakhir (maksimal hari ini) | Rentang sepanjang sama yang berakhir tepat sebelum bulan awal    |

> ⚠️ **Perhatikan:** untuk periode berjalan (mis. "Bulan ini" pada tanggal 5), angka berjalan baru memuat 5 hari, sedangkan pembandingnya satu bulan **penuh**. Perubahan persen karena itu tampak turun di awal bulan. Lihat KF-04.

**Periode 13** (penyesuaian akhir tahun) ikut dihitung bila toggle aktif **dan** pilihan periodenya YTD, 12 bulan, atau rentang bebas, **dan** tanggal akhir periode 13 jatuh di dalam jendela waktu.

**Bulan tanpa periode:** bila sebuah bulan dalam rentang tidak punya baris `periode` reguler, bulan itu tercatat di `missingMonths` dan banner peringatan tampil. Bila rentang memuat periode **Open/Pre Closed**, banner "angka bisa berubah" tampil.

### 6.2 Jurnal yang dihitung

```text
gl.posted_status = 1                    -- sudah diposting
AND gl.canceled_date IS NULL            -- hanya bila tabel gl punya kolom ini (D31)
```

- Jurnal **draft** (`posted_status = 0`) tidak dihitung. Dashboard tidak menghitung dokumen sumber yang belum dijurnal (kas masuk, pettycash, bank payment yang belum diposting).
- Ada tidaknya kolom `canceled_date` dicek lewat `information_schema` dan di-cache 1 jam (`src/server/db/gl-columns.ts`; query Q24 di bab 7).
- **Jurnal pembalik** (reversal) ikut dihitung bersama jurnal aslinya sehingga saling meniadakan. Jangan membuang salah satunya saja.
- Tabel jurnal per periode berasal dari `periode.table_name` (`gl` atau arsip `gl_20xx`). Nama divalidasi dengan pola `^gl(_20\d{2})?$` sebelum masuk ke SQL (`src/server/db/gl-tables.ts`); nama kolom segmen divalidasi dengan pola `^segment([1-9]|1[0-5])_id$`.

### 6.3 Periode vs tanggal transaksi

| Kebutuhan                                                       | Kunci waktu     | Alasan                                                                                                |
| --------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Angka **bulanan** (Revenue, P&L, Cash Flow, Budget, Fixed Cost) | `gl.period_id`  | Sama dengan laporan ERP; jurnal bertanggal mundur dan Periode 13 masuk ke periode pencatatannya (D18) |
| Angka **per tanggal** (saldo kas, Payment Plan, drill harian)   | `gl.trans_date` | Butuh ketelitian hari                                                                                 |

### 6.4 Entitas dan segmen

```text
gl_detail.segment1_id → segment_detail.segment_detail_id → segment_detail.location_id → pos_location
```

- Kolom segmen yang dipakai = kolom `segment` dengan `count = 1`. **Harus tepat satu**; bila tidak, aplikasi berhenti dengan galat (`entities.repo.ts`).
- Satu entitas bisa punya lebih dari satu nilai segmen; filter entitas diubah menjadi daftar nilai segmen.
- Konsolidasi = penjumlahan biasa, **tanpa eliminasi antar-entitas** (D2).
- Baris jurnal tanpa segmen: di snapshot GL disimpan sebagai `segment_id = 0`. Pada pembacaan "per lokasi" mereka menjadi `locationId = NULL` dan hanya muncul di total (dan di baris "Tanpa entitas" bila relevan, bab 8.2).
- ⚠️ Segmen Lokasi bersifat **NBAL** (_non-balancing_): ERP tidak memaksa jurnal seimbang per lokasi. Aman untuk laba rugi per entitas, tetapi saldo kas/utang **per entitas** bisa terlihat janggal (mis. tagihan satu entitas dibayar dari rekening entitas lain). Lihat O3 dan KF-05.

### 6.5 Tanda angka (+/−)

Tanda ditentukan oleh **sisi alami kelompok akun** (`account_group`), bukan kolom `saldo_normal` akun (D17, G17) ✅ (`src/lib/finance/coa/sign.ts`):

| Sisi   | Kelompok akun                                                                    | Rumus            |
| ------ | -------------------------------------------------------------------------------- | ---------------- |
| Debit  | Liquid Assets, Fixed Assets, Other Assets, Cost Of Sales, Expense, Other Expense | `debet − credit` |
| Kredit | Current Liabilities, Long Term Liabilities, Equity, Revenue, Other Revenue       | `credit − debet` |

Dengan aturan ini akun lawan (contra), seperti Akumulasi Penyusutan, otomatis bernilai negatif dan mengurangi total kelompoknya, walau kolom `saldo_normal`-nya tidak konsisten.

### 6.6 Keranjang akun (Account Mapping)

Kode akun **tidak ditulis mati** di program (S1), karena nomor akun berbeda di tiap klien. Admin memilih akun lewat **Settings › Account Mapping**, tersimpan di `system_main` (`name = 'DASHBOARD_ACCOUNT_MAPPING'`).

| Keranjang            | Kunci       | Dipakai di                                                                 |
| -------------------- | ----------- | -------------------------------------------------------------------------- |
| Kas                  | `cash`      | Cash Position (angka utama), Cash Flow, Runway, Payment Plan               |
| Bank                 | `bank`      | Idem                                                                       |
| Deposito             | `deposit`   | Cash Position (baris terpisah), Cash Flow dan Runway (dianggap setara kas) |
| Dana dalam pencairan | `inTransit` | Kartu terpisah; sumber penerimaan Payment Plan (toggle)                    |
| Biaya Tetap          | `fixedCost` | Fixed Cost, tab Fixed Cost di donut                                        |

**Cara akun ditentukan (`resolver`):** untuk setiap `coa_id` yang disimpan: bila HEADER, ambil semua akun POSTABLE di bawahnya (termasuk akun baru yang nanti ditambahkan); bila POSTABLE, akun itu sendiri; lalu buang duplikat. Pilihan disimpan per `coa_id` (bukan kode), sebab kode bisa diganti admin tetapi id tetap.

**Validasi sebelum simpan:** satu akun tidak boleh berada di dua keranjang dari kelompok Kas/Bank/Deposito/Dana dalam pencairan; keranjang Kas dan Bank sama-sama kosong memunculkan peringatan (Cash Position = 0); akun yang sudah dihapus dari CoA ditandai dan diabaikan.

**Default klien baru:** semua akun dengan `sub_account_group = 'Cash'` tercentang di keranjang Kas; keranjang lain kosong, dan banner "Selesaikan pengaturan akun" tampil sampai disimpan (S7). Isi default klien saat ini menurut `data-model.md` §5.1 (folder 111, 1121, 1122, 1132 + 1138, dan folder Fixed Cost) **harus dicek langsung di Settings** karena bisa sudah diubah (KF-06).

### 6.7 Pohon CoA dan jumlah HEADER

- Induk = `acc_ref_id` (`0` = akar). **Kode akun tidak dijadikan patokan struktur.**
- Anak diurutkan menurut `code`. Akun yang induknya tidak ada masuk folder virtual "Akun tanpa induk". Siklus (A→B→A) diputus dan ditandai.
- Saldo HEADER = jumlah saldo akun POSTABLE di bawahnya. Pohon dan jumlah HEADER dihitung **di JavaScript** (tanpa CTE rekursif; MySQL 5.7), dari daftar akun yang di-cache 10 menit (`coa:tree`) (D23).

### 6.8 Uang, ID, pembulatan

- Semua uang berupa **teks desimal** dan dihitung dengan `decimal.js` (`src/lib/core/money.ts`). Dilarang `+ − × ÷`, `Number()`, `parseFloat()` pada uang. Pembulatan 2 desimal hanya di akhir/di tampilan.
- Semua ID berupa **teks**: ID ERP seperti `504404509311573860` melebihi batas aman angka JavaScript (±9×10¹⁵).
- Persentase perubahan = `(angka − pembanding) ÷ |pembanding| × 100`; pembanding 0 → tidak ditampilkan.
- Kartu menampilkan **angka singkat** dengan angka penuh di tooltip; tabel menampilkan angka penuh, rata kanan. Angka negatif di mana pun (kartu, sumbu grafik, tabel) ditulis dalam kurung, mis. (29,19 M), bukan dengan tanda minus. Singkatan mengikuti bahasa (Indonesia: Rb/Jt/M/T; Inggris: K/M/B/T). ⚠️ "M" berarti **Miliar** di Indonesia, tetapi **Million** di Inggris (U3).

### 6.9 Aturan penulisan SQL

Berlaku untuk developer, tetapi berdampak ke alasan query tampak "berbelit":

- **Kompatibel MySQL 5.7.44:** tanpa CTE (`WITH`), window function (`OVER`, `ROW_NUMBER`, `LAG`), `LATERAL`, `REGEXP_REPLACE`. Database lokal (MariaDB 10.4) menerima semuanya, jadi lolos di lokal **tidak membuktikan** lolos di klien. `sql-guard.test.ts` memindai semua file repo.
- `GROUP BY` lengkap (`ONLY_FULL_GROUP_BY`); upsert dengan `ON DUPLICATE KEY UPDATE col = VALUES(col)`.
- Semua query **berparameter**. Daftar `IN (...)` dipecah per **1.000 id** (`IN_LIST_LIMIT`) dan sampai **3 potongan berjalan bersamaan** (`SLICE_CONCURRENCY`), karena kolam koneksi kecil dan dipakai bersama.
- Agregasi (jumlah, kelompok) selalu **di SQL**, bukan di JavaScript (D12).
- Banyak query memakai `STRAIGHT_JOIN` dari `gl` supaya database mulai dari indeks periode/tanggal, bukan dari seluruh riwayat akun (puluhan kali lebih cepat pada 13 juta baris).
- Alias kolom hasil memakai camelCase lewat `AS`.
- Hanya `SELECT`, kecuali upsert `system_main` dan penulisan `dash_*`.

### 6.10 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                                        | Default sementara                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| KF-04 | Pembanding periode berjalan (bulan ini, kuartal ini, YTD, 12 bulan) memakai periode lalu **penuh**, sedangkan angka berjalan baru sampai hari ini. Apakah pembanding sebaiknya dipotong sampai tanggal yang sama? | Pembanding penuh ⚠️                                                   |
| KF-05 | Segmen Lokasi bersifat NBAL. Apakah saldo kas dan utang **per entitas** dari data asli masuk akal bagi finance, atau ada pencatatan lintas rekening antar entitas?                                                | Diabaikan di prototype (O3) ⚠️                                        |
| KF-06 | Isi keranjang Kas, Bank, Deposito, Dana dalam pencairan, dan Biaya Tetap yang tersimpan di Settings sudah benar?                                                                                                  | Sesuai pilihan admin; default klien baru = akun bersub-grup `Cash` ⚠️ |
| KF-07 | Konsolidasi tanpa eliminasi antar-entitas: apakah ada penjualan, pinjaman, atau akun "pihak berelasi" (mis. 1133, 1135, 2102, 2112) antar entitas yang membuat angka gabungan menggelembung?                      | Tidak ada eliminasi (D2) ⚠️                                           |

---

## 7. Katalog query bersama

Bab ini memuat query yang dipakai **banyak halaman**. Query yang khusus satu halaman ada di sub-bab halamannya (bab 8), dengan nomor **Q** yang sama dengan dokumen lama supaya rujukan lama tetap terbaca:

| Q       | Isi                                                          | Lokasi |
| ------- | ------------------------------------------------------------ | ------ |
| Q1–Q5   | Data induk: akun, periode, kolom segmen, entitas, pengaturan | 7.1    |
| Q6      | Daftar entitas dari filter (tanpa SQL)                       | 7.1    |
| Q7–Q9   | Saldo awal dan mutasi per tanggal                            | 7.2    |
| Q10     | Dana belum cair (`bank_payment`)                             | 8.3    |
| Q11–Q13 | Mutasi per periode (ERP langsung dan snapshot)               | 7.3    |
| Q14–Q18 | Tagihan terbuka, pembayaran belum dialokasikan, nama vendor  | 8.7    |
| Q19     | Status Pengakuan Biaya                                       | 8.9    |
| Q20–Q21 | Baris jurnal kas dan setup arus kas                          | 8.4    |
| Q22     | Giro/cek beredar                                             | 8.3    |
| Q23     | Tidak dipakai                                                | —      |
| Q24     | Cek kolom `canceled_date`                                    | 7.1    |

Semua SQL di bab ini ✅ disalin dari `src/server/repo/**`. Bagian dalam kurung siku `[...]` dipasang bersyarat. `:nama` adalah parameter.

### 7.1 Data induk (Q1–Q6, Q24)

Hasilnya di-cache **10 menit** di memori server (`getCachedPeriods`, `getCachedEntities`, `getCachedCoaTree`).

**Q1: Daftar akun** (`coa.repo.ts`)

```sql
SELECT coa_id AS coaId, acc_ref_id AS parentId, code, name, status, level,
       account_group AS accountGroup, sub_account_group AS subAccountGroup, saldo_normal AS saldoNormal
FROM coa
ORDER BY code, coa_id
```

Mengambil seluruh akun (ratusan baris) untuk membentuk pohon di JavaScript (6.7).

**Q2: Daftar periode** (`periods.repo.ts`)

```sql
SELECT periode_id AS periodeId, name AS name, start_date AS startDate, end_date AS endDate,
       status AS status, type AS type, table_name AS tableName
FROM periode
ORDER BY start_date, type
```

Dipakai mengubah filter ("Bulan ini") menjadi daftar `period_id`, mengetahui status Open/Pre Closed/Closed, dan tabel GL tiap periode. Bila `table_name` kosong dianggap `gl`.

**Q3: Kolom segmen entitas** (`entities.repo.ts`)

```sql
SELECT segment_id AS segmentId, column_name AS columnName
FROM segment
WHERE `count` = 1
```

Harus menghasilkan tepat satu baris; nama kolomnya divalidasi (`segmentN_id`).

**Q4: Daftar entitas** (`entities.repo.ts`)

```sql
SELECT pl.location_id AS locationId, pl.code AS code, pl.name AS name, pl.is_active AS isActive,
       sd.segment_detail_id AS segmentDetailId
FROM pos_location pl
LEFT JOIN segment_detail sd ON sd.location_id = pl.location_id AND sd.segment_id = :segmentId
ORDER BY pl.name, pl.location_id
```

Satu entitas dengan beberapa nilai segmen digabung menjadi satu entri dengan daftar `segmentDetailIds`.

**Q5: Pengaturan Account Mapping** (`settings.repo.ts`)

```sql
SELECT sysmain_id AS sysmainId, valueprop AS valueprop
FROM system_main
WHERE name = 'DASHBOARD_ACCOUNT_MAPPING'
LIMIT 1
```

Pembaca. Penulisan satu-satunya ke ERP (hanya dari Settings, memakai `ON DUPLICATE KEY UPDATE`):

```sql
INSERT INTO system_main (sysmain_id, name, valueprop, valtype, distype, groupprop, note, company_id, active)
VALUES (:id, 'DASHBOARD_ACCOUNT_MAPPING', :json, 'STRING', '', 'Application', 'Finance Dashboard account mapping', 0, 1)
ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop)
```

`sysmain_id` baru dibuat dengan pola ERP bila baris belum ada (`ERP_APP_ID_INDEX`). `valueprop` divalidasi ulang saat dibaca; JSON rusak → default + peringatan.

**Q6: Entitas dari filter.** Tanpa SQL: `parseEntityToken` mengubah parameter `entity` menjadi daftar `location_id` dan `resolveFilter` mengubahnya menjadi daftar nilai segmen (7.1 Q4).

**Q24: Apakah tabel `gl` punya kolom `canceled_date`?** (`gl-columns.ts`, di-cache 1 jam)

```sql
SELECT COUNT(*) AS n
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = :tabel_gl AND column_name = 'canceled_date'
```

Bila `n > 0`, semua query GL menambah `AND g.canceled_date IS NULL`.

### 7.2 Saldo akun pada suatu tanggal (Q7–Q9)

Dipakai Cash Position, Current Ratio (dan rekonsiliasi). Dashboard **tidak menjumlahkan seluruh sejarah**. Ia memakai saldo awal yang sudah tersimpan di ERP sebagai titik mulai, lalu menambah transaksi sesudahnya, seperti buku tabungan: lihat saldo di awal halaman terakhir lalu tambahkan transaksi berikutnya (`src/lib/finance/period/balance.ts`, `balance.service.ts`) ✅.

**Langkah (di JavaScript, tanpa SQL untuk langkah 1–2):**

1. **C** = periode reguler berstatus **Closed** terakhir yang **berakhir sebelum** `asOf` (`endDate < asOf`).
2. **P\*** = periode reguler tepat sesudah C. (Bila tidak ada periode Closed sebelum `asOf`, P\* = periode reguler paling awal.)
3. Hitung baris saldo awal P\* (**Q7**). Bila ada → **cara utama**: saldo = saldo awal P\* + mutasi posted dengan `trans_date` dari **hari setelah C berakhir** sampai `asOf` (**Q8** dan **Q9**). Bila tidak ada → **cara cadangan** (neraca saldo, D29): jumlah semua mutasi posted dari `1900-01-01` sampai `asOf` (**Q9** saja).
4. Mutasi dikalikan tanda sisi kelompok akun (6.5); saldo awal sudah bertanda.

**Q7: Hitung baris saldo awal** (`gl-opening.repo.ts`)

```sql
SELECT COUNT(*) AS n
FROM coa_opening_balance_location
WHERE periode_id = :P*
```

**Q8: Saldo awal per akun** (`gl-opening.repo.ts`)

```sql
SELECT o.coa_id AS coaId [, o.segment1_id AS segmentDetailId], SUM(o.opening_balance) AS opening
FROM coa_opening_balance_location o
WHERE o.periode_id = :P*
  AND o.coa_id IN (:akun)              -- dipecah per 1.000
  [AND o.segment1_id IN (:segmen)]     -- bila entitas difilter
GROUP BY o.coa_id [, o.segment1_id]
```

Kolom `segment1_id` di sini **harus** menjadi kolom segmen entitas; bila bukan, program berhenti dengan galat (perlu keputusan user).

**Q9: Mutasi per tanggal** (`gl-by-date.repo.ts`; satu query per tabel GL)

```sql
SELECT [STRAIGHT_JOIN] d.coa_id AS coaId
       [, DATE(g.trans_date) AS transDate]
       [, d.segment1_id AS segmentDetailId]
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  [AND g.canceled_date IS NULL]
  AND g.trans_date >= :dari
  AND g.trans_date <= :sampai
  [AND d.coa_id IN (:akun)]
  [AND d.segment1_id IN (:segmen)]
GROUP BY d.coa_id [, DATE(g.trans_date)] [, d.segment1_id]
```

`STRAIGHT_JOIN` dipasang bila rentangnya ≤ 400 hari (mulai dari indeks `trans_date`); untuk rentang lebih panjang (cara cadangan) optimizer yang memilih. Tabel GL yang dibaca = semua tabel yang periodenya beririsan dengan rentang (`tablesBetween`).

**Hasil dihitung dan di-cache 1 menit** (`balancesAt`, `balancesBySegmentAt`).

**Contoh angka.** Hari ini (`asOf`) = 15 Oktober 2025. Status periode: Januari–Agustus 2025 Closed, September Pre Closed, Oktober Open. Akun: **Bank Operasional** (Harta, debit menambah).

1. **C** = Agustus (periode Closed terakhir yang berakhir sebelum 15 Okt; September belum Closed).
2. **P\*** = September. Saldo awal September untuk Bank Operasional di `coa_opening_balance_location` = **Rp1.000 jt**, yang sama dengan saldo akhir Agustus, jadi seluruh transaksi Januari–Agustus sudah terwakili.
3. Mutasi 1 September – 15 Oktober:

| Tanggal | Keterangan           | Debet  | Kredit | Dihitung?                                   |
| ------- | -------------------- | ------ | ------ | ------------------------------------------- |
| 5 Sep   | Pelanggan membayar   | 500 jt |        | Ya                                          |
| 12 Sep  | Bayar supplier       |        | 300 jt | Ya                                          |
| 30 Sep  | Bayar gaji           |        | 200 jt | Ya                                          |
| 3 Okt   | Setoran penjualan    | 400 jt |        | Ya                                          |
| 10 Okt  | Bayar sewa           |        | 150 jt | Ya                                          |
| 14 Okt  | Bayar vendor (draft) |        | 100 jt | **Tidak**: belum posted                     |
| 16 Okt  | Pelanggan membayar   | 250 jt |        | **Tidak**: setelah `asOf`                   |
| 20 Agu  | Bayar listrik        |        | 80 jt  | **Tidak**: sudah masuk saldo awal September |

```text
Saldo 15 Okt = saldo awal September + debet − kredit
             = 1.000 jt + (500 + 400) jt − (300 + 200 + 150) jt = 1.250 jt
```

- **Variasi 1**: bila September sudah Closed, C = September, P\* = Oktober; hanya mutasi 1–15 Oktober ditambahkan; hasil tetap 1.250 jt.
- **Variasi 2** ("Bulan lalu", `asOf` = 31 Agustus): Agustus berakhir **tepat** di 31 Agustus, bukan _sebelum_ tanggal itu, jadi bukan C. C = Juli, P\* = Agustus, mutasi 1–31 Agustus. Ini mengikuti Buku Besar ERP.
- **Cara cadangan**: bila P\* tidak punya saldo awal, semua jurnal posted sejak awal dijumlah (mis. Rp50 M debet − Rp48,75 M kredit = Rp1,25 M). Hasil seharusnya sama, hanya lebih lambat.

### 7.3 Mutasi per periode (Q11–Q13)

Dipakai Revenue, P&L, Budget, Fixed Cost, Composition, dan drill-down. Fungsi: `movementsByPeriods` (`src/server/repo/gl/gl.repo.ts`) ✅.

**Alur keputusan untuk tiap periode:**

```text
status ≠ Closed (Open/Pre Closed) ─► query ERP langsung (Q11), tidak pernah di-cache
status = Closed:
   ├─ ada di cache memori (kunci memuat versi bangun) ─► pakai cache
   ├─ ada di dash_snap_gl_periods (Q13)                ─► baca snapshot (Q12)
   └─ selain itu                                        ─► query ERP langsung (Q11)
hasil Closed disimpan ke cache memori (LRU)
```

**Q11: Mutasi per periode, ERP langsung**

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       [, g.period_id AS periodId]
       [, sd.location_id AS locationId]
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
[JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (:kelompok)]
[LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.segment1_id]
WHERE g.posted_status = 1
  [AND g.canceled_date IS NULL]
  AND g.period_id IN (:periode)
  [AND d.coa_id IN (:akun)]
  [AND d.segment1_id IN (:segmen)]
GROUP BY d.coa_id [, g.period_id] [, sd.location_id]
```

Penjelasan bagian per bagian:

- `FROM gl g JOIN gl_detail d`: gabungkan kepala jurnal dengan barisnya.
- `JOIN coa c … account_group IN (…)`: bila hanya kelompok tertentu diminta (mis. hanya akun laba rugi atau hanya Revenue), saring di database.
- `LEFT JOIN segment_detail … location_id`: ubah nilai segmen menjadi lokasi (entitas) bila hasil diminta per entitas. Baris tanpa segmen tetap ikut dengan `locationId` kosong.
- `WHERE g.posted_status = 1 …`: hanya jurnal posted pada periode yang diminta, dan hanya segmen entitas terpilih.
- `GROUP BY`: satu baris per akun (dan per periode, per lokasi bila diminta).
- `STRAIGHT_JOIN`: mulai dari `gl` (indeks periode) lalu `gl_detail`; tanpa itu optimizer mulai dari `coa` dan memindai seluruh riwayat akun (berpuluh menit pada 13 juta baris).

**Q12: Mutasi periode Closed dari snapshot**

```sql
SELECT s.coa_id AS coaId, s.period_id AS periodId
       [, sd.location_id AS locationId]
       , SUM(s.debet) AS debet, SUM(s.credit) AS credit
FROM dash_snap_gl_monthly s
[JOIN coa c ON c.coa_id = s.coa_id AND c.account_group IN (:kelompok)]
[LEFT JOIN segment_detail sd ON sd.segment_detail_id = s.segment_id]
WHERE s.period_id IN (:periode)
  [AND s.coa_id IN (:akun)]
  [AND s.segment_id IN (:segmen)]
GROUP BY s.coa_id, s.period_id [, sd.location_id]
```

Hasil sama dengan Q11 untuk periode Closed, tetapi jauh lebih kecil karena sudah dijumlahkan per akun dan segmen.

**Q13: Periode yang ada di snapshot GL** (di-cache 30 detik)

```sql
SELECT CAST(period_id AS CHAR) AS id,
       DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
       row_count AS rowCount
FROM dash_snap_gl_periods
```

Hasilnya menjadi "versi bangun" (`builtAt#rowCount`) pada kunci cache; periode yang dibangun ulang otomatis tidak memakai cache lama. Snapshot hanya dipakai bila kolom segmen entitas adalah `segment1_id`. Bila tabel `dash_*` belum ada, daftar kosong dan Q11 dipakai.

**Rumus di JavaScript.** Hasil Q11/Q12 digabung per kunci (akun, periode, lokasi) dengan penjumlahan desimal, lalu dikalikan tanda (6.5). Pembulatan 2 desimal hanya di akhir.

### 7.4 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                  | Default sementara                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| KF-08 | Jurnal yang belum diposting (draft) memang tidak boleh masuk angka dashboard, walau sudah diinput? Dampaknya saldo kas dan laba bisa lebih kecil dari kondisi riil sampai jurnal diposting. | Tidak dihitung ✅ sesuai laporan ERP ⚠️                                    |
| KF-09 | Apakah angka dashboard sama dengan **Neraca / Buku Besar / Laba Rugi** ERP pada tanggal dan entitas yang sama (termasuk saat ada periode Open)?                                             | Dirancang sama dengan laporan ERP (D17, D26), belum dicek di data klien ⚠️ |

---

## 8. Penjelasan per halaman

Urutan sub-bab: 8.0 elemen bersama · 8.1 Summary · 8.2 Revenue · 8.3 Cash Position · 8.4 Cash Flow (termasuk Runway dan Expense Paid) · 8.5 Profit & Loss (termasuk Fixed Cost) · 8.6 Budget · 8.7 Payables · 8.8 Receivables · 8.9 Payment Plan · 8.10 Settings · 8.11 Data perlu dicek · 8.12 Drill-down.

Setiap sub-bab memakai urutan di bab 0.3. Aturan umum (jurnal posted, periode, entitas, tanda angka) ada di bab 6 dan tidak diulang.

### 8.0 Elemen bersama semua halaman

#### 8.0.1 Login dan sesi ✅

- Login memakai akun ERP dari tabel `sysuser` (`login_id` dan `password`). Hanya fungsi `findLoginCandidate` yang membaca kolom `password` (aturan G27); passwordnya dibandingkan dengan `timingSafeEqual` dan **tidak pernah** dikirim ke browser, dicatat di log, atau di-cache.
- ⚠️ Password di `sysuser` tersimpan **plain text** (tabel lama ERP). Ini risiko di sisi ERP (O8), bukan di dashboard.
- Kode status yang boleh login: `user_status` ∈ {0, 1, 2} (`LOGIN_ALLOWED_STATUSES`). Dashboard memeriksa ulang status tiap permintaan (di-cache 1 menit), jadi akun yang dinonaktifkan kehilangan akses dalam sekitar semenit.
- Pembatas percobaan login: **5 kali per menit** per kunci (`loginLimiter`).
- Sesi: cookie terenkripsi `nr_session` (`httpOnly`, `SameSite=Lax`, `secure` di produksi), berlaku **8 jam**.
- **Semua akun yang aktif punya akses penuh**; tidak ada peran (U6, S9). Tidak ada pembatasan siapa boleh mengubah Account Mapping atau menekan "Perbarui sekarang".

```sql
-- hanya fungsi login yang membaca password
SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus, password AS password
FROM sysuser WHERE login_id = :login LIMIT 2          -- 2 baris = ambigu = ditolak
-- pemeriksaan ulang tiap permintaan
SELECT user_id AS userId, full_name AS fullName, user_status AS userStatus
FROM sysuser WHERE user_id = :id LIMIT 1
```

**Perlu dikonfirmasi:** KF-10, nilai `user_status` mana yang berarti aktif di ERP klien (program mengizinkan 0, 1, dan 2)? 🔵 Di database demo ada tiga nilai: `0` = 655 akun, `1` = 144 akun, `2` = 560 akun (pengecekan 2026-11-05, hanya `user_status` dan jumlah).

#### 8.0.2 Kerangka halaman ✅

- **Sidebar:** Summary, Revenue, Cash Position, Cash Flow, Profit & Loss, Payables, Receivables, Payment Plan, Budget, lalu Settings › Account Mapping. Di bawahnya kartu **"Data as of …"** (bab 5.3.1 dan 10.4) dengan tombol **"Perbarui sekarang"**.
- **Bilah atas:** pilihan entitas (multi-pilih dengan pencarian), pilihan periode (preset atau rentang bulan, toggle Periode 13), bahasa (English bawaan / Indonesia), tema (terang/gelap).
- **Judul halaman metrik** (`MetricPageHeader`): judul cetak dan banner peringatan: **periode Open/Pre Closed** ("angka bisa berubah") dan **bulan tanpa periode**.
- **Cetak dan ekspor:** cetak/PDF lewat CSS cetak (tata letak A4 tetap tabel); ekspor CSV dengan dialog pilihan format (koma + titik desimal, atau titik koma + koma desimal; selalu UTF-8 BOM) (U4, U5).
- **Pemuatan:** halaman memuat data di server (SSR) lalu mengisi cache klien; Summary memuat bertahap (8.1).

#### 8.0.3 Bahasa dan istilah di layar

Semua teks layar lewat i18n (`src/i18n/locales/en.json`, `id.json`; kunci harus identik, dijaga `keys.test.ts`). Label keuangan memakai istilah finance, bukan nama tabel. Server mengirim label sebagai **kunci netral** yang diterjemahkan di browser.

---

### 8.1 Halaman Summary

Rute `/summary` (alamat `/` hanya mengarahkan ke sini) · orkestrator `src/server/services/summary.service.ts` · server function `src/functions/summary.fn.ts` · komponen `src/components/summary/`.

Summary tidak punya query sendiri. Ia **merangkai metrik halaman lain** (Cash Position, Revenue, P&L, Payables, Cash Flow, Runway, Fixed Cost, Payment Plan). Karena itu rumus dan query tiap kartu ada di sub-bab halaman asalnya; bagian ini menjelaskan **isi, susunan, dan aturan khusus Summary**.

#### 8.1.1 Peta isi halaman

| Komponen                                                       | Sumber (service)                                                | Penjelasan rumus |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| Kartu **Cash Position** (hijau)                                | `cash-position.service.ts`                                      | 8.3              |
| Kartu **Revenue**                                              | `revenue.service.ts`                                            | 8.2              |
| Kartu **Net Profit**                                           | `pnl.service.ts`                                                | 8.5              |
| Kartu **Payables**                                             | `ap-aging.service.ts`                                           | 8.7              |
| Grafik **Cash Flow** (batang bulanan)                          | `cash-flow.service.ts`                                          | 8.4              |
| Donut **Composition** (tab Revenue, Expense, Fixed Cost)       | `revenue.service.ts`, `pnl.service.ts`, `fixed-cost.service.ts` | 8.1.4            |
| Donut **Revenue by Entity**                                    | `revenue.service.ts`                                            | 8.1.5            |
| **Tabel tagihan** (dua tab)                                    | `payment-plan.service.ts`                                       | 8.1.6            |
| Kartu mini **Runway, Gross margin, Net margin, Current ratio** | `runway.service.ts`, `pnl.service.ts`                           | 8.4.6            |

#### 8.1.2 Pemuatan bertahap

Halaman dimuat dalam **tiga bagian** supaya empat kartu atas tidak menunggu bagian yang lambat (D45):

1. **Head** (`getSummaryHeadFn`): empat kartu atas (Cash Position, Revenue, Net Profit, Payables). Loader rute hanya menunggu bagian ini.
2. **Charts** (`getSummaryChartsFn`): grafik Cash Flow, donut Composition dan Revenue by Entity.
3. **Mini** (`getSummaryMiniFn`): Runway, Gross margin, Net margin, Current ratio.

Bagian 2 dan 3 di-prefetch paralel di latar belakang dan tampil dengan skeleton bila belum siap. Tabel tagihan memuat datanya sendiri (`getPaymentBillsFn`). Karena metrik saling memakai hasil satu sama lain (`memoMetric`), tiap metrik dihitung sekali walau diminta beberapa bagian. Fungsi `computeSummary` (satu hasil lengkap) masih ada di kode tetapi **halaman tidak memakainya**.

**Tidak tampil di Summary walau dihitung:** pembanding Cash Position (kartu tidak menampilkannya), rekonsiliasi GL terhadap AP.

#### 8.1.3 Kartu atas

- **Cash Position:** angka besar = Kas + Bank; di bawahnya Kas, Bank, lalu (dipisah garis) Deposito dan Dana dalam pencairan, dan giro/cek beredar bila ada. Deposito dan Dana dalam pencairan **tidak** masuk angka besar. (8.3)
- **Revenue:** total Revenue periode terpilih + persentase perubahan dan teks pembanding. (8.2)
- **Net Profit:** `Laba Usaha + Other Revenue − Other Expense`, dengan **net margin** sebagai teks kecil. (8.5)
- **Payables:** angka besar = **total neto** (A + B). Di bawahnya "Overdue IDR …" = **tagihan positif** yang lewat jatuh tempo (`overdueBills`, D37), **tanpa persentase perubahan** (overdue bukan angka periode sebelumnya sehingga tidak dibandingkan dengan total utang). (8.7)

#### 8.1.4 Donut Composition

Tiga tab; irisan: **4 terbesar + "Lainnya"**; klik irisan membuka halaman terkait dengan filter yang sama (tab Revenue → halaman Revenue; tab Expense dan Fixed Cost → halaman Profit & Loss).

- **Tab Revenue:** Revenue per folder akun (data sama dengan kartu Revenue; 8.2.5).
- **Tab Expense** (D42): **HPP (grup Cost Of Sales) + Beban Operasional (grup Expense)** per folder akun teratas dari masing-masing grup, `debet − kredit`. Diambil dari baris `cogs` dan `opex` P&L yang sama (tanpa query baru), jadi **Revenue − angka tengah ("Beban usaha") = Operating Profit**. **Other Expense tidak ikut** (isinya bergantung CoA klien; ditunda sebagai O19). Bila folder HPP dan folder Beban Operasional berbagi nama, nama grup ditambahkan dalam kurung di legenda.
- **Tab Fixed Cost:** hanya akun keranjang **Biaya Tetap** per folder; angka tengah "Total biaya tetap". Tab **disembunyikan** bila keranjang kosong. Angkanya tidak harus sama dengan tab Expense.
- **Irisan negatif** (semua donut komposisi, termasuk donut Revenue di halaman Revenue): folder bersaldo negatif (mis. retur melebihi pembelian) **tidak digambar** dan disebut dalam catatan kecil di bawah legenda; folder nol tidak digambar dan tidak dicatat. Angka tengah tetap **neto**, jadi bisa lebih kecil dari jumlah irisan yang terlihat. Persentase dihitung dari irisan yang digambar (sebelumnya donut memakai nilai mutlak).

#### 8.1.5 Donut Revenue by Entity (D40)

- **Data:** sama dengan kartu Revenue (R1 per lokasi). **Tidak ada query baru.**
- **Yang digambar:** hanya entitas dengan Revenue **> 0**; entitas nol/negatif tidak digambar (catatan kecil menyebut jumlahnya) tetapi tetap tampil di tabel halaman Revenue. Karena itu angka tengah donut bisa berbeda dari kartu Revenue.
- **Tanpa entitas** (`entityUnassigned`): bila positif, digabung ke segmen "Lainnya".
- **Persentase:** dari jumlah yang digambar, dibulatkan dengan metode sisa terbesar (total 100); nilai yang membulat ke 0 ditulis "<1%".
- **Segmen:** maksimal 10 entitas terbesar; sisanya dan "Tanpa entitas" digabung menjadi "Lainnya" (selalu paling akhir). Legenda memuat 5 segmen terbesar, sisanya satu baris "+N lainnya".
- **Interaksi:** arahkan kursor untuk nominal penuh; klik segmen atau "Details ›" membuka halaman Revenue.
- **Kapan kartu disembunyikan:** bila filter memilih **kurang dari 2 entitas**, atau **kurang dari 2 entitas** punya Revenue > 0 (`showEntityCard = entityCount ≥ 2 AND entitas bernilai > 0 ≥ 2`). Saat disembunyikan, tata letak kembali: Cash Flow 2/3 + Composition 1/3. Saat tampil: Cash Flow selebar penuh; Composition dan Revenue by Entity berdampingan 50/50.

#### 8.1.6 Tabel tagihan (dua tab)

- **Data:** tagihan AP bagian A dengan sisa > 0 dikurangi kolam kredit vendor (D53). **Tanggal acuan = hari ini** (bukan filter periode); filter entitas tetap berlaku. Dihitung oleh `computePaymentPlan` (horizon 7 hari, tanpa proyeksi penerimaan) sehingga angka dan status mengikuti 8.9.
  - **Jatuh tempo ≤ 7 hari:** jatuh tempo dari hari ini sampai hari ini + 6 hari.
  - **Lewat jatuh tempo:** jatuh tempo (atau tanggal transaksi bila kosong) sebelum hari ini, seberapa pun lamanya.
- **Baris kredit negatif:** bila vendor dan entitas memiliki kredit terbuka (retur, memo, kelebihan bayar), tagihan bruto tetap ditampilkan utuh, dan potongan kredit tampil sebagai **baris tersendiri bertanda negatif** dalam kurung (label "Kredit vendor" di bawah nama vendor dan di ekspor CSV, nomor tagihan kosong / "—", jatuh tempo dan status mengikuti tagihan yang dikurangi).
- **Kolom:** Vendor (id, kode, nama), Nomor tagihan, Jatuh tempo, Sisa, **Status rencana bayar** (kolom disembunyikan bila tidak ada dokumen Pengakuan Biaya aktif, 8.9), dan keterangan kecil **entitas pemilik** (hanya bila lebih dari 1 entitas dalam filter; lokasi kosong/tak dikenal → "Tanpa entitas").
- **Cara pakai:** dua tab dengan jumlah tagihan masing-masing (hitungan tab `(N)` **hanya menghitung tagihan**, tidak menghitung baris kredit, sedangkan total nominal tab menjumlahkan seluruh baris termasuk pengurangan kredit; pindah tab kembali ke halaman 1); tabel dapat diurutkan (vendor, jatuh tempo, sisa, status) dan dibagi per halaman; tombol **ekspor CSV** memuat **seluruh** baris tab yang sedang dipilih, dengan urutan yang tampil (kolom status dan entitas ikut hanya bila tampil); klik baris membuka Payment Plan.
- **Mengapa total tabel tidak sama dengan kartu Payables:** hanya tagihan yang jatuh tempo dalam 7 hari atau sudah lewat tempo (setelah dikurangi kredit vendor pasangan). Tagihan yang jatuh temponya lebih jauh tidak tampil.
- **Kecepatan** (puluhan ribu tagihan): urutan tiap tab dan jumlah per tab dibuat sekali per hasil rencana (`createViewCache`), pembanding teks memakai satu `Intl.Collator`, dan nama vendor diingat 10 menit.

#### 8.1.7 Kartu mini

| Kartu         | Rumus                                                                     | Catatan             |
| ------------- | ------------------------------------------------------------------------- | ------------------- |
| Runway        | Cash Position ÷ \|burn rata-rata\| (bulan); burn ≥ 0 → "arus kas positif" | 8.4.6               |
| Gross margin  | Laba Kotor ÷ Revenue                                                      | P&L yang sama (8.5) |
| Net margin    | Net Profit ÷ Revenue                                                      | idem                |
| Current ratio | Σ Liquid Assets ÷ \|Σ Current Liabilities\| pada `asOf`                   | 8.4.6               |

#### 8.1.8 Catatan teknis

- Margin (Gross, Operating, Net) dikirim server sebagai **rasio desimal** (mis. `0.4`) dan diformat di klien (`formatPercent`) (D33). Sebelumnya teks "40.0%" membuat Summary tampil "NaN%".
- Teks "terposting sampai" sempat dibuat lalu dibatalkan (D34), jadi tidak ada di halaman.
- Hasil kartu dan drill-down-nya dapat dihitung pada saat berbeda, sehingga bisa berselisih sebesar masa basi cache (bab 9).
- Untuk tanggal acuan lampau yang bukan akhir bulan, AP memakai query langsung ke ERP yang lambat (8.7.3).

#### 8.1.9 Perlu dikonfirmasi

Lima hal terpenting untuk Summary (selebihnya ada di sub-bab asal kartu):

| Kode  | Pertanyaan                                                                                                                                                                         | Default sementara   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| KF-54 | Cash Position (Kas + Bank, **tanpa Deposito**) dan isi keranjangnya benar? (KF-06, KF-19)                                                                                          | Ya ⚠️               |
| KF-55 | Total Payables dan angka Cash Position sama dengan laporan ERP pada tanggal yang sama? (KF-09, KF-38)                                                                              | Belum dicocokkan ⚠️ |
| KF-56 | Definisi **Overdue** di kartu (tagihan positif) dan isi tabel tagihan (tagihan lama perlu ditandai di tab "Lewat jatuh tempo"?) (KF-39, KF-49)                                     | Seperti 8.1.6 ⚠️    |
| KF-57 | Isi tab **Expense** (HPP + Beban Operasional; Other Expense ditunda) sesuai harapan? (KF-32)                                                                                       | Ya ⚠️               |
| KF-58 | Pembanding periode berjalan vs periode lalu **penuh** (KF-04). Kartu Cash Position mengikuti filter periode (saldo akhir periode terpilih), bukan selalu hari ini: sesuai harapan? | Pembanding penuh ⚠️ |

---

### 8.2 Halaman Revenue (Pendapatan)

> **Revenue di halaman ini adalah pendapatan menurut pembukuan (buku besar), bukan uang yang sudah diterima.** Penjualan kredit yang belum dibayar pelanggan tetap masuk.

Rute `/revenue` · file: `src/routes/_authed/revenue.tsx` · service `src/server/services/pnl/revenue.service.ts` · logika murni `src/lib/finance/pnl/revenue.ts` dan `revenue-entity.ts` · komponen `src/components/revenue/`.

#### 8.2.1 Yang ditampilkan

| Bagian        | Judul layar (ID / EN)            | Isi                                                              |
| ------------- | -------------------------------- | ---------------------------------------------------------------- |
| Kartu 1       | Pendapatan / Revenue             | Total Revenue periode + persentase perubahan dan teks pembanding |
| Kartu 2       | Kategori Terbesar / Top Category | Folder pendapatan terbesar. Klik membuka drill-down folder       |
| Kartu 3       | Entitas Terbesar / Top Location  | Entitas dengan Revenue terbesar. Tidak bisa diklik               |
| Grafik batang | Tren Pendapatan Bulanan          | Revenue per bulan kalender                                       |
| Donut         | Komposisi Pendapatan             | Folder pendapatan (4 terbesar + "Lainnya")                       |
| Tabel 1       | Rincian Folder Pendapatan        | Folder dan total; klik baris membuka drill-down; ekspor CSV      |
| Tabel 2       | Pendapatan per Entitas           | Entitas, total, porsi; baris "Tanpa entitas"; ekspor CSV         |

Semua angka halaman berasal dari **satu hasil server** (`getRevenueFn` → `computeRevenue`), kecuali drill-down yang membaca lagi saat diklik. Hasil di-cache per kombinasi filter (bab 9).

#### 8.2.2 Data yang diambil

| Data                      | Tabel                                                                 | Dipakai untuk                                                                         |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Daftar akun               | `coa`                                                                 | Menentukan akun Revenue POSTABLE dan membentuk folder                                 |
| Periode                   | `periode`                                                             | Mengubah filter menjadi `period_id`, memilih tabel GL arsip                           |
| Entitas                   | `pos_location`, `segment`, `segment_detail`                           | Filter lokasi dan pembagian per entitas                                               |
| Mutasi pendapatan         | `gl` + `gl_detail` (atau `dash_snap_gl_monthly` untuk periode Closed) | Debit/kredit per akun, periode, lokasi                                                |
| Mutasi periode pembanding | idem                                                                  | Total pembanding                                                                      |
| Pengaturan keranjang      | `system_main`                                                         | Hanya ikut terbaca di jalur pembanding (bersama P&L); tidak memengaruhi angka Revenue |

#### 8.2.3 Query

Revenue **tidak punya query khusus**: ia memakai pembacaan mutasi bersama (bab 7.3) dengan parameter berbeda.

**R1: Mutasi Revenue periode terpilih = Q11 atau Q12** dengan: akun = semua akun **POSTABLE** grup `Revenue` (`postableAccountIds(tree, ['Revenue'])`), `byPeriod = true`, `byLocation = true`, tanpa saringan `account_group`.

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId, g.period_id AS periodId, sd.location_id AS locationId,
       SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.segment1_id
WHERE g.posted_status = 1 [AND g.canceled_date IS NULL]
  AND g.period_id IN (:periode_terpilih)
  AND d.coa_id IN (:akun_revenue)            -- dipecah per 1.000
  [AND d.segment1_id IN (:segmen_entitas)]   -- hanya bila entitas difilter
GROUP BY d.coa_id, g.period_id, sd.location_id
```

Periode **Closed** yang sudah ada di snapshot dibaca dengan Q12 (`dash_snap_gl_monthly`), sisanya Q11; hasilnya digabung.

**R2: Mutasi periode pembanding.** Pembacaan **bersama dengan halaman P&L, Fixed Cost, dan Budget** (`loadPlMovements`, di-cache sebagai metrik `plMovements`): Q11 dengan akun = semua akun POSTABLE grup laba rugi (Revenue, Cost Of Sales, Expense, Other Revenue, Other Expense) **ditambah** akun keranjang Biaya Tetap, `byPeriod = true`, **tanpa** `byLocation`. Akun Revenue disaring dari hasil ini **di memori** (`onlyAccounts`). Karena itu Q5 (pengaturan keranjang) ikut terbaca di jalur pembanding.

**Alur:** bila tidak ada akun Revenue atau tidak ada periode terpilih, hasil kosong dikembalikan tanpa query (tren tetap berisi bulan dengan 0).

**Drill-down** (klik folder; bab 8.12 menjelaskan mekanismenya):

**R3: Folder → akun** = Q11 dengan akun = semua akun di bawah folder, tanpa `byPeriod`/`byLocation`; hasil per akun dikalikan tanda grup (kredit − debet untuk Revenue), akun bernilai 0 dibuang, urut kode.

**R4: Akun → entitas** = Q11 dengan `byLocation = true` untuk akun itu; per entitas dijumlah; entitas bernilai 0 dibuang. Dilewati bila filter hanya satu entitas (langsung ke R5).

**R5: Baris jurnal** (`journalLines`, 200 baris per halaman, terbaru dulu):

```sql
SELECT STRAIGHT_JOIN g.gl_id AS glId, g.journal_number AS journalNumber, DATE(g.trans_date) AS transDate,
       g.journal_type AS journalType, COALESCE(g.memo, '') AS memo, d.coa_id AS coaId
       [, d.segment1_id AS segmentDetailId],         -- bila lebih dari 1 entitas dalam filter
       SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1 [AND g.canceled_date IS NULL]
  AND g.period_id IN (:periode)
  AND d.coa_id IN (:akun)
  [AND d.segment1_id IN (:segmen)]
GROUP BY g.gl_id, g.journal_number, DATE(g.trans_date), g.journal_type, g.memo, d.coa_id [, d.segment1_id]
ORDER BY g.trans_date DESC, g.gl_id DESC, d.coa_id [, d.segment1_id]
LIMIT 200 OFFSET :offset
```

Satu jurnal yang menyentuh akun yang sama dua kali dijumlah menjadi **satu baris**. Bila periode tersebar di beberapa tabel GL, tiap tabel mengembalikan `offset + 200` baris lalu digabung dan dipotong.

#### 8.2.4 Rumus

```text
Revenue (satu akun)   = Σ (credit − debet)          -- sisi kredit (6.5)
Revenue total         = Σ Revenue semua akun POSTABLE grup "Revenue" pada periode terpilih
Pembanding            = rumus yang sama pada periode pembanding (6.1)
Perubahan %           = (Revenue − Pembanding) ÷ |Pembanding| × 100    (pembanding 0 → tidak tampil)
```

- **Other Revenue tidak termasuk** (jasa giro, pendapatan lain-lain). Itu mengikuti definisi di `data-model` §6.1.
- **Saldo awal tidak dipakai** untuk pendapatan (hanya mutasi periode).
- Warna perubahan: naik = baik (hijau), turun = buruk.
- Pembulatan: total dihitung dari baris mentah lalu `toFixed(2)` sekali; angka per akun dibulatkan 2 desimal sebelum dijumlah menjadi folder, dan per lokasi dibulatkan sebelum "Tanpa entitas" dihitung sebagai selisih. Bila ERP menyimpan lebih dari 2 desimal, jumlah folder bisa berbeda beberapa sen dari total; pada data berdesimal 2 digit tidak ada selisih.

**Kartu Kategori Terbesar / Entitas Terbesar:** nilai terbesar menurut angka (bukan nilai mutlak); bila semua negatif, yang paling dekat dengan nol. "Tanpa entitas" tidak ikut dipilih.

**Grafik tren:** hasil dikelompokkan per periode lalu dijumlah per **bulan kalender** berdasarkan **tanggal mulai periode** (Periode 13 jatuh ke bulan tanggal mulainya, biasanya Desember). Satu batang per bulan dalam filter (bulan tanpa jurnal = 0). Batang negatif digambar setinggi 0 tetapi tooltip menampilkan angka sebenarnya.

**Donut:** sama dengan tabel folder, tanpa query tambahan. Aturan gambar: 4 folder terbesar + "Lainnya"; folder negatif tidak digambar dan disebut dalam catatan kecil di bawah legenda; folder nol tidak digambar dan tidak dicatat; angka tengah tetap **neto**; persentase dibulatkan dengan metode sisa terbesar (total selalu 100).

#### 8.2.5 Cara folder ditentukan

Folder **tidak ditulis mati**; dibentuk dari pohon akun (`groupFolders`):

1. Ambil semua akun POSTABLE grup Revenue.
2. Untuk setiap akun, naik ke induknya **selama seluruh isi induk itu** (semua akun POSTABLE di bawahnya) berstatus grup Revenue. Berhenti di induk tertinggi yang masih "murni Revenue".
3. Bila hasilnya satu induk tunggal, **folder = anak langsung induk itu** (bila induk tidak punya anak, induk itu sendiri menjadi satu-satunya folder).
4. Bila hasilnya beberapa induk berbeda, **setiap induk itu menjadi satu folder**.

Akibatnya: bila di bawah folder "Pendapatan Usaha" ada akun yang bukan Revenue (mis. akun diskon bergrup Expense), folder itu tidak murni dan pembagian folder bisa berubah. Folder berganti nama atau akun dipindah induknya → tampilan ikut berubah tanpa perubahan kode. Akun yatim dikecualikan. Folder dan akun tanpa mutasi tetap tampil 0,00 di tabel dan tidak digambar di donut.

#### 8.2.6 Tabel Pendapatan per Entitas

- Data sama dengan R1, dikelompokkan per **lokasi**: `gl_detail.segment1_id → segment_detail.location_id`. Tidak ada query tambahan.
- **Baris:** semua entitas dalam filter (bukan hanya yang punya pendapatan), dari yang terbesar; urutan sama nilai: nama lalu id.
- **Baris "Tanpa entitas"** = `Total Revenue − Σ semua baris entitas` (pendapatan yang jurnalnya tidak punya lokasi, atau lokasinya di luar daftar). Hanya tampil bila selisih ≠ 0, selalu paling bawah.
- **Porsi:**

```text
basis = Σ (entitas bernilai > 0) + (Tanpa entitas bila > 0)
porsi = nilai ÷ basis        (hanya untuk nilai > 0; selain itu "—")
```

- Bila filter hanya satu entitas: tabel hanya berisi entitas itu. Pendapatan tanpa lokasi **tidak ikut** (jurnal tanpa lokasi dikeluarkan oleh saringan entitas), jadi tidak ada baris "Tanpa entitas".
- Ekspor CSV memuat Entitas, Total, Porsi (persen, 2 desimal).

#### 8.2.7 Contoh angka

Periode = Oktober 2025, semua entitas, tanggal acuan 31 Oktober 2025. September 2025 sebagai pembanding.

| Folder            | Akun                    | Debet | Kredit | Kredit − Debet |
| ----------------- | ----------------------- | ----- | ------ | -------------- |
| Penjualan Makanan | Penjualan Makanan       | 0     | 900 jt | 900 jt         |
| Penjualan Makanan | Retur Penjualan Makanan | 30 jt | 0      | **−30 jt**     |
| Penjualan Minuman | Penjualan Minuman       | 10 jt | 400 jt | 390 jt         |

```text
Folder Penjualan Makanan = 900 − 30 = 870 jt
Folder Penjualan Minuman = 390 jt
Revenue                  = 870 + 390 = 1.260 jt

Per entitas: Cabang A 700 jt, Cabang B 500 jt, jurnal tanpa lokasi (tidak ada barisnya)
Σ entitas      = 1.200 jt
Tanpa entitas  = 1.260 − 1.200 = 60 jt
Porsi A = 700 ÷ (700 + 500 + 60) = 55,6%   B = 39,7%   Tanpa entitas = 4,8%

Pembanding (September, bila Revenue-nya 1.000 jt):
Perubahan = (1.260 − 1.000) ÷ 1.000 = +26,00%   (hijau)
```

Tidak dihitung dalam contoh: jurnal draft; jurnal yang periodenya di luar Oktober walau tanggal transaksinya Oktober; akun Other Revenue (mis. jasa giro). Kartu lain pada contoh: Kategori Terbesar = Penjualan Makanan (870 jt); Entitas Terbesar = Cabang A (700 jt); batang Oktober = 1.260 jt.

#### 8.2.8 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                                                                                               | Default sementara               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| KF-11 | Apakah **semua** pendapatan usaha ada di akun grup _Revenue_? Terutama: apakah akun **retur penjualan** dan **diskon penjualan** ada di grup Revenue (angka neto)? Bila ada di grup Expense/Cost Of Sales, Revenue di sini tampil bruto dan lebih besar dari laporan ERP | Diasumsikan neto ⚠️             |
| KF-12 | Apakah **Other Revenue** (jasa giro, pendapatan lain-lain) memang sengaja tidak ikut Revenue?                                                                                                                                                                            | Tidak ikut (data-model §6.1) ⚠️ |
| KF-13 | Pendapatan **tanpa lokasi** (baris "Tanpa entitas"): apakah ada di data klien, mengapa tidak diberi lokasi, dan bagaimana finance ingin menanganinya?                                                                                                                    | Ditampilkan apa adanya ⚠️       |
| KF-14 | Folder pendapatan yang tampil (dibentuk otomatis dari pohon akun) sesuai pengelompokan finance (mis. per kategori produk)? Ada akun Revenue yang induknya bercampur dengan grup lain (perlu dirapikan di CoA)?                                                           | Otomatis dari pohon ⚠️          |
| KF-15 | Apakah Periode 13 sebaiknya batang terpisah di grafik tren, atau digabung ke Desember seperti sekarang?                                                                                                                                                                  | Digabung ke bulan mulainya ⚠️   |
| KF-16 | Nama kartu "Top Location" di tampilan Inggris sebaiknya "Top Entity"? (hanya istilah)                                                                                                                                                                                    | Top Location ⚠️                 |
| KF-17 | Nomor jurnal, jenis jurnal, dan keterangan di drill-down cukup untuk menelusuri selisih ke ERP?                                                                                                                                                                          | Cukup ⚠️                        |

Pertanyaan KF-04 (pembanding penuh), KF-07 (tanpa eliminasi antar-entitas), dan KF-09 (kecocokan dengan laporan Laba Rugi ERP) juga berlaku untuk halaman ini.

---

### 8.3 Halaman Cash Position

Rute `/cash-position` · service `src/server/services/cash/cash-position.service.ts` · logika murni `src/lib/finance/cash/cash-position.ts` · repo `src/server/repo/cash/bank-payment.repo.ts` · komponen `src/components/cash-position/`.

#### 8.3.1 Yang ditampilkan

- Bila saldo GL "Dana dalam pencairan" berbeda ≥ Rp1 dari register `bank_payment`, tampil peringatan merah ("selisih register").
- **Kartu saldo kas (hijau):** angka besar = **Kas + Bank**. Di bawahnya: Kas, Bank, lalu (dipisah garis) Deposito dan Dana dalam pencairan, lalu baris tambahan **Giro/cek beredar** bila tidak nol. Deposito, Dana dalam pencairan, dan giro **tidak** masuk angka besar.
- **Kartu KPI "Dana dalam pencairan"** (+ jumlah channel) dan **kartu Runway** (+ rata-rata burn; rumus di 8.4).
- **Tabel Kas dan Bank** per folder akun (bisa di-drill), **tabel Dana dalam pencairan** per channel (jumlah transaksi, umur transaksi tertua, tanda merah bila lebih dari `IN_TRANSIT_ALERT_DAYS`, bawaan 3 hari), dan **tabel saldo per entitas** (Kas + Bank).

#### 8.3.2 Data yang diambil

| Data                   | Tabel                                 | Dipakai untuk                                 |
| ---------------------- | ------------------------------------- | --------------------------------------------- |
| Daftar akun, keranjang | `coa`, `system_main`                  | Akun apa yang Kas/Bank/Deposito/Transit       |
| Periode, entitas       | `periode`, `pos_location`, `segment*` | Memilih saldo awal, filter lokasi             |
| Saldo awal             | `coa_opening_balance_location`        | Titik awal saldo                              |
| Mutasi                 | `gl` + `gl_detail`                    | Transaksi setelah saldo awal                  |
| Dana belum cair        | `bank_payment`                        | Register pencairan (rekonsiliasi dan rincian) |
| Giro/cek beredar       | `bank_payment`                        | Baris informasi                               |

#### 8.3.3 Query

1. **Saldo akun pada `asOf`** untuk semua akun keranjang Kas, Bank, Deposito, Transit: **Q7, Q8, Q9** (bab 7.2). Saldo per entitas memakai varian yang dikelompokkan per segmen (`bySegment`) dalam **satu** pembacaan, bukan satu per entitas.
2. **Saldo pembanding** (periode sebelumnya): Q7–Q9 pada `compare.asOf` untuk akun Kas dan Bank. Kartu Summary tidak menampilkannya, tetapi tetap dihitung (flag `includeCompare`).
3. **Q10: Dana belum cair** (register `bank_payment`, `unsettledByChannel`; di-cache 1 menit):

```sql
SELECT bp.coa_id AS coaId, bp.segment1_id AS segmentDetailId,
       DATE(bp.transaction_date) AS txDate, COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2)
  AND (bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= :asOf_plus_1))
  AND bp.coa_id IN (:akun_transit)
  AND bp.transaction_date < :asOf_plus_1
  [AND bp.segment1_id IN (:segmen)]
GROUP BY bp.coa_id, bp.segment1_id, DATE(bp.transaction_date)
```

Penjelasan: transaksi kartu/QRIS/e-wallet (tipe 1 dan 2) di channel (akun transit) yang pada akhir tanggal `asOf` **belum cair**: statusnya masih belum cair, **atau** sudah cair tetapi **tanggal cairnya sesudah** `asOf` (supaya tanggal lampau tetap benar; rumus lama `status = 0` saja membuat register kosong untuk tanggal lampau, D32). Total dan drill-down memakai klausa yang sama (`unsettledAtClause`) sehingga selalu cocok.

4. **Q22: Giro/cek beredar** (`outstandingGiro`; di-cache 1 menit):

```sql
SELECT COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (0, 4, 7)
  AND bp.transaction_date < :asOf_plus_1
  AND (bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= :asOf_plus_1))
  [AND bp.segment1_id IN (:segmen)]
```

Giro (tipe 0), cek tangguh (4), dan e-banking (7) ke vendor yang belum dicairkan bank pada `asOf`. Pembayaran ini sudah mengurangi utang saat dicatat, tetapi saldo bank baru turun saat dicairkan, sehingga ditampilkan sebagai **informasi** di samping Cash Position dan **tidak** mengubah angkanya (D35).

5. **Daftar transaksi belum cair per channel/tanggal** (drill-down; `unsettledTransactions`; 200 baris per halaman):

```sql
SELECT bp.bank_payment_id AS id, COALESCE(bp.number, '') AS number,
       DATE(bp.transaction_date) AS txDate, bp.amount AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2)
  AND (bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= :asOf_plus_1))
  AND bp.coa_id = :channel AND bp.transaction_date < :asOf_plus_1
  [AND bp.transaction_date >= :tgl AND bp.transaction_date < :tgl_plus_1]
  [AND bp.segment1_id IN (:segmen)]
ORDER BY bp.transaction_date, bp.bank_payment_id
LIMIT 200 OFFSET :offset
```

6. **Rata-rata lama cair per channel** (`settlementLag`; dipakai Payment Plan, 8.9): `AVG(DATEDIFF(payment_date, DATE(transaction_date)))` untuk transaksi tipe 1/2 berstatus cair dalam **90 hari terakhir**; bila tidak ada data, 1 hari.

#### 8.3.4 Rumus

```text
Kas        = Σ saldo akun keranjang Kas          (saldo menurut 7.2)
Bank       = Σ saldo akun keranjang Bank
Cash Position = Kas + Bank
Deposito   = Σ saldo akun keranjang Deposito      (baris terpisah)
Dana dalam pencairan (GL) = Σ saldo akun keranjang Dana dalam pencairan
Dana belum cair (register) = Σ amount Q10
Selisih rekonsiliasi = GL − register;  sinkron bila |selisih| < Rp1
Umur transaksi tertua channel = hari ini − tanggal transaksi tertua yang belum cair;
                   ditandai bila > IN_TRANSIT_ALERT_DAYS (bawaan 3)
Saldo per entitas = Σ saldo akun Kas + Bank pada nilai segmen entitas itu
```

- Angka utama "Dana dalam pencairan" tetap berasal dari **GL**, bukan dari register; register dipakai untuk rincian (channel, tanggal, umur) dan untuk pengecekan selisih (D30).
- Folder pada tabel Kas dan Bank dikelompokkan menurut **induk langsung** tiap akun di pohon CoA.
- Bila keranjang Kas **dan** Bank kosong, semua angka 0 (dan Settings menampilkan peringatan).
- Kartu mengikuti filter periode: saldo pada **tanggal acuan**, bukan selalu hari ini.

#### 8.3.5 Contoh angka

Contoh saldo satu akun pada `asOf`: lihat bab 7.2 (Bank Operasional Rp1.250 jt). Contoh Cash Position:

```text
Kas      : 120 jt (akun kas toko A 70 jt + kas toko B 50 jt)
Bank     : 1.250 jt (Bank Operasional) + 400 jt (Bank Gaji) = 1.650 jt
Cash Position = 120 + 1.650 = 1.770 jt
Deposito = 500 jt        → ditampilkan terpisah, tidak masuk 1.770 jt
Dana dalam pencairan (GL) = 80 jt;  register belum cair = 78 jt → selisih 2 jt → peringatan merah
Giro beredar = 60 jt     → informasi; kas yang "bisa dipakai" mungkin lebih rendah
```

#### 8.3.6 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                                                                                                      | Default sementara                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| KF-18 | Isi keranjang Kas, Bank, Deposito, Dana dalam pencairan sudah benar? (KF-06)                                                                                                                                                                                                    | Sesuai Settings ⚠️                             |
| KF-19 | Cash Position memang **tanpa Deposito**? (Di Cash Flow dan Runway, Deposito dianggap setara kas, sehingga pembilang Runway = Kas + Bank sedangkan arus kas sudah termasuk Deposito.) Apakah **Deposito** dan **giro/cek beredar** masuk definisi "kas yang bisa dipakai" (O15)? | Hanya Kas + Bank; giro informasi saja (D35) ⚠️ |
| KF-20 | "Dana dalam pencairan" di kartu = saldo **GL** akun transit, bukan register `bank_payment`. Apakah keduanya sinkron di data klien (selisih pada hari tertentu = satu jurnal manual)?                                                                                            | GL utama; register untuk rincian ⚠️            |
| KF-21 | Dokumen kas yang belum diposting tidak dihitung, jadi saldo bisa lebih kecil dari kas riil. Bisa diterima?                                                                                                                                                                      | Diterima ⚠️                                    |
| KF-22 | Ambang peringatan umur dana belum cair (`IN_TRANSIT_ALERT_DAYS`, 3 hari) sesuai kebiasaan pencairan klien (rutin sekitar 10 hari di satu klien, D38)?                                                                                                                           | 3 hari ⚠️                                      |
| KF-23 | Apakah pembayaran **non-PO** (`bank_payment` tipe 5, 6, 8) juga memakai alur giro belum cair? (O17)                                                                                                                                                                             | Belum dihitung di giro beredar ⚠️              |

Pertanyaan KF-05 (NBAL: saldo kas per entitas bisa janggal) dan KF-09 (kecocokan dengan Neraca/Buku Besar ERP) juga berlaku.

---

### 8.4 Halaman Cash Flow (termasuk Runway dan Expense Paid)

Rute `/cash-flow` · service `src/server/services/cash/cash-flow.service.ts` dan `runway.service.ts`, `src/server/services/ap-ar/expense-paid.service.ts` · logika murni `src/lib/finance/cash/cashflow.ts`, `runway.ts`, `src/lib/finance/ap-ar/expense-paid.ts` · repo `src/server/repo/cash/cashflow.repo.ts`, `src/server/repo/ap-ar/expense-paid.repo.ts` · komponen `src/components/cash-flow/`.

Halaman ini punya **dua tab**: **Cash Flow** (arus kas per laci) dan **Expense Paid** (biaya operasional yang benar-benar dibayar).

#### 8.4.1 Cash Flow: yang ditampilkan

- Label "Sumber klasifikasi": **setup ERP** (`cash_flow_setup` valid) atau **aturan bawaan** (setup kosong/tidak valid).
- Tiga kartu: **Kas awal**, **Arus kas bersih**, **Kas akhir**.
- **Grafik waterfall:** kas awal → Operasional → Investasi → Pendanaan → kas akhir; dan **grafik bulanan** kas masuk vs kas keluar (Cash In, Cash Out, Net).
- **Tabel aktivitas:** tiga laci (OPERATING, INVESTING, FUNDING) dan sub-barisnya (mis. "Penerimaan dari pelanggan"), dapat di-drill; baris **"Belum terklasifikasi"** ditandai ⚠️.
- Panel kecil **rekonsiliasi dengan cara hitung ERP** (selisih per laci), dan cek kas awal + arus kas = kas akhir.

#### 8.4.2 Data yang diambil

| Data                          | Tabel                                                                 | Dipakai untuk                                                                      |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Keranjang kas, bank, deposito | `system_main`, `coa`                                                  | Menentukan "kas dan setara kas"                                                    |
| Baris jurnal kas              | `gl` + `gl_detail` (atau `dash_snap_cash_lines` untuk periode Closed) | Semua baris dari jurnal posted yang menyentuh akun kas, **termasuk sisi lawannya** |
| Klasifikasi arus kas klien    | `cash_flow_setup`, `cash_flow_group`, `coa`                           | Menentukan laci dan sub-baris tiap akun lawan                                      |
| Saldo kas awal dan akhir      | `coa_opening_balance_location`, `gl`, `gl_detail`                     | Kas awal (hari sebelum `d1`) dan kas akhir (`asOf`) lewat Q7–Q9                    |

#### 8.4.3 Query

**Q20: Baris jurnal yang menyentuh akun kas** (`cashflow.repo.ts`, `linesOfCashJournals`; di-cache 1 menit). Satu query per tabel GL, dipecah per 1.000 periode/akun/segmen:

```sql
SELECT d.gl_id AS glId, g.journal_type AS journalType, g.period_id AS periodId,
       d.coa_id AS coaId, d.segment1_id AS segmentDetailId,
       SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM gl g
JOIN gl_detail d ON d.gl_id = g.gl_id
JOIN (
  SELECT DISTINCT STRAIGHT_JOIN d2.gl_id
  FROM gl g2
  JOIN gl_detail d2 ON d2.gl_id = g2.gl_id
  WHERE g2.posted_status = 1 [AND g2.canceled_date IS NULL]
    AND g2.period_id IN (:periode)
    AND d2.coa_id IN (:akun_kas)                  -- keranjang Kas ∪ Bank ∪ Deposito
    [AND d2.segment1_id IN (:segmen)]
) k ON k.gl_id = g.gl_id
WHERE g.posted_status = 1 [AND g.canceled_date IS NULL]
GROUP BY d.gl_id, g.journal_type, g.period_id, d.coa_id, d.segment1_id
```

Penjelasan: subquery `k` mencari **jurnal** (posted, pada periode terpilih) yang punya **minimal satu baris akun kas** (pada entitas terpilih bila difilter). Query luar mengambil **semua baris** jurnal-jurnal itu, termasuk sisi lawannya (pendapatan, biaya, piutang, dst.), dijumlahkan per jurnal, akun, dan segmen. Akun kas **selalu** dibaca untuk daftar terlebar (Kas ∪ Bank ∪ Deposito) supaya Cash Flow, Expense Paid, dan Runway berbagi satu pembacaan.

**Sumber alternatif untuk periode Closed:** `dash_snap_cash_lines` (bab 5.3.6), dipakai bila periodenya ada di `dash_snap_cash_periods` dengan `cash_hash` yang sama dengan daftar akun kas sekarang dan kolom segmen entitas = `segment1_id`:

```sql
-- semua entitas
SELECT s.gl_id AS glId, s.journal_type AS journalType, s.period_id AS periodId, s.coa_id AS coaId,
       s.segment_id AS segmentDetailId, s.debet AS debet, s.credit AS credit
FROM dash_snap_cash_lines s
WHERE s.period_id IN (:periode)

-- entitas difilter: hanya jurnal yang punya baris kas di segmen terpilih, lalu SEMUA barisnya
SELECT (kolom yang sama)
FROM dash_snap_cash_lines s
JOIN (
  SELECT DISTINCT k0.period_id, k0.gl_id
  FROM dash_snap_cash_lines k0
  WHERE k0.period_id IN (:periode) AND k0.is_cash = 1 AND k0.segment_id IN (:segmen)
) k ON k.period_id = s.period_id AND k.gl_id = s.gl_id
WHERE s.period_id IN (:periode)
```

Hasil snapshot dan hasil langsung digabung dan duplikat (jurnal yang cocok di dua potongan) dibuang. Hasilnya sama dengan Q20 untuk periode Closed.

**Q21: Setup arus kas ERP** (`getCashFlowSetup`)

```sql
SELECT s.cash_flow_setup_id AS setupId, s.cash_flow_group_id AS groupId, grp.NAME AS groupName,
       grp.sequence AS groupSequence, s.sub_group AS subGroup, s.sequence_sub_group AS subSequence,
       s.coa_id AS coaId, s.value_displayed AS valueDisplayed,
       c.account_group AS accountGroup, c.sub_account_group AS subAccountGroup
FROM cash_flow_setup s
JOIN cash_flow_group grp ON grp.cash_flow_group_id = s.cash_flow_group_id
LEFT JOIN coa c ON c.coa_id = s.coa_id
ORDER BY grp.sequence, s.sequence_sub_group
```

Akun wakil di `cash_flow_setup.coa_id` dipakai hanya untuk **mengambil pasangan `account_group` + `sub_account_group`** nya; semua akun lawan dengan pasangan yang sama masuk sub-baris itu.

**Saldo kas awal dan akhir:** Q7–Q9 (bab 7.2) untuk akun Kas ∪ Bank ∪ Deposito pada `d1 − 1 hari` (awal) dan `asOf` (akhir).

#### 8.4.4 Rumus (semua ✅ dari `src/lib/finance/cash/cashflow.ts`)

**Langkah 0: jurnal yang dihitung** (`settledJournals`). Jurnal dihitung bila: menyentuh akun kas milik kita (dan segmennya terpilih bila entitas difilter), **bersih kasnya tidak nol**, dan **punya sisi lawan**. Jurnal yang hanya memindahkan antar akun kas/bank/deposito (tanpa sisi lawan) adalah **transfer internal** dan diabaikan.

**Langkah 1: alokasi proporsional ke kas** (`allocateCash`):

```text
netKas  = Σ (debet − credit) baris kas milik kita       (+ uang masuk, − uang keluar)
bobot_i = |debet − credit| baris lawan ke-i
porsi_i = netKas × bobot_i ÷ Σ bobot
          (sisa pembulatan ditambahkan ke baris berbobot terbesar; bila semua bobot 0,
           seluruh netKas ke baris lawan pertama)
```

Contoh jurnal campuran: _Kas 100 + Piutang EDC 50 → Pendapatan 150_. ERP menghitung uang masuk **150** (seluruh baris lawan); dashboard **100** (hanya bagian kasnya). Karena itu angka per sub-baris bisa sedikit berbeda dari layar ERP, tetapi **kas awal + arus kas = kas akhir selalu cocok**.

**Langkah 2: klasifikasi tiap porsi** (`classifyCounterAmount`):

1. Bila `cash_flow_setup` **valid** (minimal satu barisnya punya akun yang dikenal di CoA) → **`classifyBySetup`**: ambil sub-baris setup yang akun wakilnya punya `account_group` dan `sub_account_group` yang **sama** dengan akun lawan. Bila sub-baris punya baris `value_displayed` 0 **dan** 1 → menerima arah apa pun (neto). Bila hanya `1` → menerima porsi **keluar** (< 0). Bila hanya `0` → menerima porsi **masuk** (> 0). Bila lebih dari satu sub-baris cocok, yang urutan setup-nya paling awal menang. Nama laci diturunkan dari nama grup (mengandung "INVEST" → INVESTING; "FUND", "FINANC", atau "PENDANAAN" → FUNDING; selain itu OPERATING).
2. Bila tidak ada sub-baris yang menerima → **"Belum terklasifikasi"** di laci OPERATING (ditandai ⚠️, dapat di-drill ke akun lawannya; D27).
3. Bila `cash_flow_setup` **kosong atau tidak valid** (mis. DB `demo`) → **aturan cadangan** (`classifyByFallback`), dicek berurutan, yang pertama cocok dipakai:

| #   | Kondisi                                                                                    | Laci      | Sub-baris                                         |
| --- | ------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------- |
| 1   | Jenis jurnal 11, 12, 13, 14 (pinjaman dan cicilannya)                                      | FUNDING   | Pinjaman bank/koperasi                            |
| 2   | Jenis jurnal 44, 45, 49, 50, 51 (aset tetap), atau lawan bergrup Fixed Assets/Other Assets | INVESTING | Keluar → Pembelian asset; masuk → Penjualan asset |
| 3   | Lawan bergrup Equity                                                                       | FUNDING   | Masuk → Setoran modal; keluar → Prive/dividen     |
| 4   | Lawan bergrup Long Term Liabilities                                                        | FUNDING   | Pinjaman jangka panjang                           |
| 5   | Lawan bergrup Revenue atau sub-grup Account Receivable                                     | OPERATING | Penerimaan dari pelanggan                         |
| 6   | Lawan sub-grup Account Payable atau Inventory                                              | OPERATING | Pembayaran ke supplier                            |
| 7   | Lawan bergrup Expense/Cost Of Sales, atau sub-grup Account Receivable Other                | OPERATING | Pembayaran biaya operasional                      |
| 8   | Lawan bergrup Other Expense                                                                | OPERATING | Pembayaran bunga dan administrasi                 |
| 9   | Lawan bergrup Other Revenue                                                                | OPERATING | Penerimaan jasa giro dan pendapatan lain-lain     |
| 10  | Lainnya                                                                                    | OPERATING | **Belum terklasifikasi** ⚠️                       |

**Hasil:**

```text
Arus kas laci   = Σ porsi pada laci itu
Arus kas bersih = Σ semua porsi
Kas awal        = Σ saldo akun Kas+Bank+Deposito pada (d1 − 1 hari)
Kas akhir       = Kas awal + Arus kas bersih
Cek identitas   : Kas akhir (hitungan) harus sama persis dengan saldo akun kas pada asOf (Q7–Q9);
                  bila beda → peringatan
Grafik bulanan  : per jurnal; netKas > 0 → Cash In, netKas < 0 → Cash Out (nilai positif);
                  Net = In − Out; bulan = bulan tanggal mulai PERIODE jurnal (bukan trans_date)
Rekonsiliasi ERP: total per laci cara ERP (seluruh baris lawan tanpa alokasi, bagian tak terpetakan dibuang)
                  dibandingkan dengan dashboard; selisih = efek "jurnal campuran" dan "belum terklasifikasi"
```

> Catatan: ERP sendiri **tidak** mengecek kas awal + arus kas = kas akhir. Dengan cara ERP, kas akhir bisa meleset bila ada baris tak terpetakan atau jurnal campuran.

#### 8.4.5 Contoh angka

Jurnal 1 (Oktober): Kas masuk 100 jt dari penjualan, lawan: Pendapatan 150 jt (kredit) dan Piutang EDC 50 jt (debit); kas 100 (debit).
Baris lawan: Pendapatan (credit 150 → |debet − credit| = 150) dan Piutang (debet 50 → 50). Bobot 150 dan 50, jumlah 200. netKas = +100.

```text
porsi Pendapatan = 100 × 150 ÷ 200 = +75   → sub-baris "Pendapatan Usaha" / "Penerimaan dari pelanggan" (OPERATING)
porsi Piutang    = 100 ×  50 ÷ 200 = +25   → sub-baris "Arus Kas dari Piutang" (OPERATING)
Total jurnal     = +100 = netKas ✔  (ERP menghitung 150 + 50 = 200)
```

Kas awal 1.000 jt + arus kas bersih (OPERATING +900, INVESTING −300, FUNDING +100 = +700 jt) = kas akhir 1.700 jt, yang harus sama dengan saldo Kas + Bank + Deposito pada 31 Oktober.

#### 8.4.6 Runway dan rasio (dipakai Cash Position, P&L, Summary)

`computeRunwayMetrics` (`runway.service.ts`) menghitung empat angka dalam satu hasil:

| Angka                         | Rumus                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Burn rata-rata**            | Rata-rata **arus kas bersih** (porsi kas semua jurnal; semua laci, termasuk pendanaan dan pinjaman masuk) selama **3 bulan penuh sebelum bulan `asOf`** (bulan reguler yang berakhir sebelum `asOf` dan dimulai sebelum bulan `asOf`; kurang dari 3 bulan → pakai yang ada; tanpa bulan → 0) |
| **Runway**                    | Burn ≥ 0 → "arus kas positif" (tanpa angka). Burn < 0: bila Cash Position ≤ 0 → `0,0` bulan; selain itu `Cash Position ÷                                                                                                                                                                     | burn                                                   | ` dengan 1 desimal                              |
| **Gross margin / Net margin** | `Laba Kotor ÷ Revenue` dan `Net Profit ÷ Revenue`, dari P&L yang sama (8.5). Revenue = 0 → "—"                                                                                                                                                                                               |
| **Current ratio**             | `Σ saldo seluruh akun POSTABLE grup Liquid Assets ÷                                                                                                                                                                                                                                          | Σ saldo seluruh akun POSTABLE grup Current Liabilities | `pada`asOf` (Q7–Q9), 2 desimal; pembagi 0 → "—" |

Pembilang Runway adalah Cash Position (**Kas + Bank**), sedangkan arus kas yang membentuk burn sudah memuat **Deposito**. Pembilang Current Ratio bukan hanya kas, tetapi semua akun bergrup Liquid Assets (termasuk piutang dan persediaan); folder hutang bank jangka panjang bergrup Current Liabilities ikut masuk penyebut sehingga rasio bisa tampak lebih buruk.

**Contoh Runway:** Cash Position 1.770 jt; arus kas bersih 3 bulan sebelumnya −300 jt, −450 jt, −270 jt → burn = −340 jt → Runway = 1.770 ÷ 340 = **5,2 bulan**.

#### 8.4.7 Expense Paid (tab kedua)

**Tujuan:** biaya operasional yang **benar-benar dibayar** selama periode (sisi kas), dari tiga sumber:

1. **Pembayaran tagihan AP**: kartu pembayaran AP (`module_type = 0`, `transaction_type` ∈ {9, 10, 14}, `in_out` ∈ {−1, 1}) bertanggal dalam rentang `d1`..`asOf`, ditelusuri lewat `ap_ar_card_detail` ke tagihan yang dilunasi; hanya tagihan bertipe 0, 1, 2, 4, 5, 6, 12 (`AP_BILL_ITEM_TYPES`). Tipe 3 (hutang aset) **bukan** biaya operasional.
2. **Pembayaran belum dialokasikan**: kartu pembayaran AP yang sama **tanpa baris detail**.
3. **Pembayaran langsung tanpa tagihan** (petty cash, bank non-PO): jurnal posted yang mengkredit **hanya akun Kas dan Bank** (bukan Deposito) dengan lawan bergrup Cost Of Sales atau Expense (porsi kas < 0, hasil alokasi proporsional yang sama dengan Cash Flow).

**Query:**

```sql
-- E1: pembayaran AP yang punya alokasi (expensePaidAllocated; di-cache 1 menit)
SELECT p.ap_ar_card_id AS cardId, COALESCE(p.transaction_number, '') AS cardNumber,
       DATE(p.transaction_date) AS txDate, p.location_id AS locationId,
       i.owner_id AS vendorId, i.transaction_type AS itemType, SUM(d.amount) AS detailSum
FROM ap_ar_card p
JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
JOIN ap_ar_card i        ON i.ap_ar_card_id = d.invoice_id
WHERE p.module_type = 0 AND p.transaction_type IN (9, 10, 14) AND p.in_out IN (-1, 1)
  AND p.transaction_date >= :d1 AND p.transaction_date < :asOf_plus_1
  [AND p.location_id IN (:lokasi)]
GROUP BY p.ap_ar_card_id, p.transaction_number, DATE(p.transaction_date), p.location_id, i.owner_id, i.transaction_type

-- E2: pembayaran AP tanpa alokasi (expensePaidUnallocated)
SELECT p.ap_ar_card_id AS cardId, COALESCE(p.transaction_number, '') AS cardNumber,
       DATE(p.transaction_date) AS txDate, p.location_id AS locationId,
       p.owner_id AS vendorId, p.amount * p.in_out AS signedAmount
FROM ap_ar_card p
WHERE p.module_type = 0 AND p.transaction_type IN (9, 10, 14) AND p.in_out IN (-1, 1)
  AND p.transaction_date >= :d1 AND p.transaction_date < :asOf_plus_1
  [AND p.location_id IN (:lokasi)]
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)
```

Sumber ketiga memakai Q20 yang sama dengan Cash Flow. Nama vendor dari `vendor` (hanya id, kode, nama). Filter entitas untuk dua query di atas memakai `location_id` kartu.

**Rumus:** `Expense Paid = pembayaran tagihan AP (E1, jumlah alokasi dinegasikan) + pembayaran belum dialokasikan (E2, dinegasikan) + pembayaran langsung`. Dikelompokkan menjadi kategori "Pembayaran tagihan AP" (per vendor), "Pembayaran belum dialokasikan" (per vendor), dan folder akun beban/HPP untuk pembayaran langsung. **Tidak termasuk:** cicilan pokok pinjaman, pembelian aset, dividen, uang muka (AP tipe 11), karena bukan biaya operasional. Per entitas: sumber 1 dan 2 menurut `location_id` kartu, sumber 3 menurut lokasi baris biaya.

> ✅ 🔵 **Diperbaiki (KF-24, 2026-11-05):** rumus di `docs/data-model.md` §6.5 menulis `dibayar = Σ (− detail.amount)`, tetapi kode lama menjumlahkan `detailSum` **tanpa tanda minus** (sedangkan drill-down menegasikannya). Pengecekan DB lokal membuktikan alokasi pembayaran memang **negatif**: pada September 2025 kartu tipe 10 dengan `in_out = −1` (70.825 kartu) berjumlah **−Rp53,6 M**, tipe 9 (2 kartu) −Rp1,40 jt, dan tipe 10 dengan `in_out = +1` (34 kartu, retur melebihi tagihan) +Rp243,5 jt. Akibatnya "Pembayaran tagihan AP" dan total Expense Paid tampil negatif dan berbeda dari drill-down. Kini `computeExpensePaidBreakdown` (`src/lib/finance/ap-ar/expense-paid.ts`) dan angka per entitas (`expense-paid.service.ts`) **menegasikan** `detailSum`, jadi uang keluar bernilai positif, retur/memo yang dipakai pada pembayaran mengurangi, dan total, per entitas, serta drill-down memakai tanda yang sama. Tes unit diubah memakai tanda data nyata (alokasi pembayaran negatif). Belum diverifikasi ulang dengan angka nyata di UI.

**Perlu dikonfirmasi (Cash Flow, Runway, Expense Paid):**

| Kode  | Pertanyaan                                                                                                                                                                                                                                                                                                                                                          | Default sementara                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| KF-25 | Pada jurnal campuran (sebagian tunai, sebagian piutang) hanya bagian kasnya yang dihitung. Apakah ini sesuai harapan (angka per sub-baris bisa lebih kecil dari layar ERP)?                                                                                                                                                                                         | Alokasi proporsional (D27, disetujui user) ✅ |
| KF-26 | Celah `cash_flow_setup` klien (O13): (a) grup tanpa pemetaan (Inventory, Long Term Liabilities, Other Assets, Cost Of Sales, debit Equity/dividen/prive) → "Belum terklasifikasi"; (b) **pinjaman bank** (2161/2162) masuk "Pembayaran Kewajiban" (OPERATING), bukan FUNDING; (c) akun wakil "Biaya Dibayar Dimuka" perlu dipastikan. Apakah setup akan dilengkapi? | Mengikuti setup apa adanya ⚠️                 |
| KF-27 | Burn = rata-rata arus kas bersih **semua laci** (termasuk pendanaan dan pinjaman masuk). Apakah burn sebaiknya hanya arus kas operasional? Pembilang Runway = Kas + Bank sedangkan arus kas termasuk Deposito: wajar?                                                                                                                                               | Semua laci ⚠️                                 |
| KF-28 | Current Ratio: pembilang = **seluruh** akun Liquid Assets (termasuk piutang, persediaan); penyebut = Current Liabilities termasuk hutang bank jangka panjang di folder tertentu. Sesuai definisi finance?                                                                                                                                                           | Seperti rumus ⚠️                              |
| KF-29 | Expense Paid: apakah pembayaran langsung tanpa tagihan (petty cash, bank non-PO) semua dianggap biaya bila lawannya akun Beban/HPP (O6)? Pembayaran giro/cek dihitung di tanggal pencatatan, bukan tanggal giro cair — diterima?                                                                                                                                    | Ya, bila lawan akun Beban/HPP ⚠️              |

---

### 8.5 Halaman Profit & Loss (termasuk Fixed Cost)

Rute `/profit-loss` · service `src/server/services/pnl/pnl.service.ts`, `fixed-cost.service.ts`, bacaan bersama `pl-movements.ts` · logika murni `src/lib/finance/pnl/pnl.ts`, `fixed-cost.ts`, `operating-expense.ts` · komponen `src/components/profit-loss/`.

Halaman punya dua tab: **Laba Rugi** dan **Fixed Cost** (Biaya Tetap).

#### 8.5.1 Yang ditampilkan

- **Kartu KPI** (Revenue, Laba Kotor, Laba Usaha, Net Profit dengan margin dan pembanding).
- **Tabel laporan laba rugi** (8 baris di bawah) yang dapat di-drill; tiap baris punya rincian folder dan akun; ekspor CSV dan cetak.
- **Tab Fixed Cost:** biaya tetap per bulan (tetap vs variabel), rata-rata biaya tetap, rincian per folder.

#### 8.5.2 Data dan query

Semua halaman keluarga laba rugi (P&L, Fixed Cost, Budget, pembanding Revenue) membaca **satu hasil bersama** (`loadPlMovements`, di-cache sebagai metrik `plMovements`): Q11/Q12 (bab 7.3) dengan akun = semua akun POSTABLE bergrup **Revenue, Cost Of Sales, Expense, Other Revenue, Other Expense** ditambah akun keranjang **Biaya Tetap**, `byPeriod = true`, tanpa `byLocation`. Setiap halaman lalu menyaring akun yang ia butuhkan **di memori** (`onlyAccounts`), jadi GL tidak dibaca berulang. Dibaca dua kali bila ada pembanding (periode terpilih dan periode pembanding).

#### 8.5.3 Rumus laporan laba rugi

Tiap baris: jumlah Σ per akun POSTABLE di grupnya, dikali tanda sisi kelompok (6.5):

```text
Revenue          = Σ (credit − debet)  akun grup Revenue
Cost Of Sales    = Σ (debet − credit)  akun grup Cost Of Sales      (HPP)
Laba Kotor       = Revenue − Cost Of Sales
Expense          = Σ (debet − credit)  akun grup Expense            (Beban Operasional)
Laba Usaha       = Laba Kotor − Expense
Other Revenue    = Σ (credit − debet)  akun grup Other Revenue
Other Expense    = Σ (debet − credit)  akun grup Other Expense      (termasuk bunga, selisih kurs, pajak, penyusutan bila di grup itu)
Net Profit       = Laba Usaha + Other Revenue − Other Expense
Margin (Kotor, Usaha, Net) = nilai ÷ Revenue   (Revenue = 0 → "—"); dikirim server sebagai rasio desimal (D33)
```

- **Per periode:** setiap baris juga dihitung per `period_id` (untuk kolom per bulan).
- **Folder dan akun:** untuk setiap grup, folder dibentuk dengan aturan yang sama dengan Revenue (8.2.5).
- **Acuan resmi:** laporan Laba Rugi ERP versi **"generate"** (`profitloss_segmentgen.jsp`) yang hanya menghitung jurnal **posted**, per `gl.period_id`; YTD = **jumlah bulan** Januari sampai bulan terpilih. Versi lain di menu ERP ikut menghitung jurnal draft dan memakai saldo awal laba rugi yang tidak cocok dengan GL pada data demo (D26, 🟣 sebagai keputusan, belum dicocokkan ke data klien).
- **OCI dinonaktifkan sementara (D39):** akun di subtree kode "9" dihitung menurut grup akunnya sendiri; tidak ada baris OCI atau Total Laba Komprehensif.
- Margin dan Laba Usaha belum dikurangi penyusutan bila penyusutan ada di grup Other Expense.

#### 8.5.4 Fixed Cost (Biaya Tetap)

```text
biaya (satu akun)  = Σ (debet − credit)  (selalu dihitung sebagai biaya, tanda grup Expense)
Tetap / bulan      = Σ biaya akun di keranjang "Biaya Tetap" pada periode bulan itu
Variabel / bulan   = Σ biaya akun POSTABLE grup Expense yang TIDAK ada di keranjang
                     (akun di kedua daftar dihitung tetap)
Rata-rata tetap    = Σ Tetap semua bulan ÷ jumlah bulan dalam filter
Rincian folder     = akun keranjang dikelompokkan menurut induk langsungnya di pohon CoA,
                     dengan total semua mutasinya selama periode
```

- Bila keranjang Biaya Tetap **kosong**, semuanya 0 dan `basketEmpty = true` (tab menampilkan petunjuk ke Settings; donut Fixed Cost di Summary disembunyikan).
- Angka "Variabel" hanyalah **sisa akun Expense di luar keranjang**; Cost Of Sales tidak ikut.

#### 8.5.5 Contoh angka

```text
Revenue 1.260 jt;  Cost Of Sales 504 jt;  Expense 480 jt;  Other Revenue 6 jt;  Other Expense 30 jt
Laba Kotor   = 1.260 − 504 = 756 jt            (margin 60,0%)
Laba Usaha   = 756 − 480 = 276 jt              (margin 21,9%)
Net Profit   = 276 + 6 − 30 = 252 jt           (margin 20,0%)
Fixed Cost Oktober: Gaji 150 jt + Sewa 90 jt = tetap 240 jt; akun Expense lain (Listrik dll.) 240 jt = variabel
```

#### 8.5.6 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                    | Default sementara                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| KF-30 | Acuan resmi Laba Rugi = laporan ERP versi "generate" (`profitloss_segmentgen.jsp`)? Jurnal draft tidak ikut dihitung. (Dikonfirmasi user sebagai O14, belum dicocokkan ke data klien.)        | Ya ⚠️                                       |
| KF-31 | Apakah klien punya akun **OCI** (revaluasi aset, selisih kurs penjabaran, dan sejenisnya)? Bila ada, sebutkan akun atau kode induknya agar fitur OCI dapat diaktifkan lagi (O4).              | OCI nonaktif; semua akun menurut grupnya ⚠️ |
| KF-32 | Isi grup **Other Expense** di CoA klien (bunga, selisih kurs, pajak penghasilan, penyusutan?) dan apakah penyusutan seharusnya mengurangi Laba Usaha (O19)?                                   | Other Expense di luar Laba Usaha ⚠️         |
| KF-33 | Apakah HPP (Cost Of Sales) diposting ke buku besar klien? Bila tidak, Laba Kotor = Revenue.                                                                                                   | Mengikuti data ⚠️                           |
| KF-34 | Keranjang Biaya Tetap: akun apa yang dianggap biaya tetap (default klien: folder Fixed Cost Adm & Umum dan Operasional)? Apakah "Variabel" = sisa akun Expense sudah sesuai definisi finance? | Sesuai Settings ⚠️                          |

---

### 8.6 Halaman Budget (Anggaran vs Realisasi)

Rute `/budget` · service `src/server/services/pnl/budget.service.ts` · repo `src/server/repo/pnl/budget.repo.ts` · logika murni `src/lib/finance/pnl/budget.ts` · komponen `src/components/budget/BudgetTable.tsx`.

#### 8.6.1 Yang ditampilkan

Tiga kartu (**Realisasi**, **Anggaran**, **Selisih**; mengacu ke Net Profit) dan tabel **per grup akun** (Revenue, Cost Of Sales, Expense, Other Revenue, Other Expense) yang dapat dibuka menjadi akun: realisasi, anggaran, selisih, selisih %. Warna selisih mengikuti arah baik/buruk (pendapatan: lebih tinggi lebih baik; biaya: lebih rendah lebih baik).

#### 8.6.2 Data dan query

- **Realisasi:** dari bacaan bersama laba rugi (8.5.2), disaring ke akun POSTABLE bergrup laba rugi, dikali tanda grup.
- **Anggaran:**

```sql
SELECT b.coa_id AS coaId, b.bgt_year AS bgtYear, b.bgt_month AS bgtMonth, SUM(b.amount) AS amount
FROM coa_budget b
JOIN coa c ON c.coa_id = b.coa_id
WHERE b.budget_type = 1
  AND ((b.bgt_year = :tahun1 AND b.bgt_month IN (:bulan0_a, :bulan0_b, ...)) OR (b.bgt_year = :tahun2 AND ...))
  [AND b.segment1_id IN (:segmen)]
GROUP BY b.coa_id, b.bgt_year, b.bgt_month
```

Hanya `budget_type = 1` (Accounting) yang dibaca. **`bgt_month` berbasis 0** (Januari = 0, Desember = 11): bulan filter `YYYY-MM` diubah menjadi `bulan − 1` (G23, D28). Akun budget yang tidak ada di `coa` (target KPI khusus, mis. jumlah struk) tidak masuk karena hanya akun POSTABLE laba rugi yang ditampilkan.

#### 8.6.3 Rumus

```text
Realisasi akun = Σ mutasi akun pada periode terpilih × tanda grup (6.5)
Anggaran akun  = Σ coa_budget.amount untuk SEMUA bulan dalam filter (bulan penuh)
Selisih        = Realisasi − Anggaran
Selisih %      = Selisih ÷ |Anggaran| × 100          (Anggaran 0 → "—")
Net Profit (kartu) = (Revenue + Other Revenue) − (Cost Of Sales + Expense + Other Expense),
                     untuk realisasi maupun anggaran
```

> Anggaran dijumlahkan untuk **bulan penuh** dalam filter, sedangkan realisasi periode berjalan baru sampai hari ini. Pada "Bulan ini" di tengah bulan, realisasi tampak jauh di bawah anggaran.

**Tidak dibaca oleh kode:** `budget_type = 2` (Operasional/"Target Operasional", hanya akun Revenue). D28 menyebut bahwa tipe ini akan tampil terpisah, tetapi kode saat ini hanya membaca tipe 1.

#### 8.6.4 Contoh angka

```text
Oktober, semua entitas. Revenue realisasi 1.260 jt, anggaran 1.200 jt → selisih +60 jt, +5,0% (hijau)
Expense realisasi 480 jt, anggaran 450 jt → selisih +30 jt, +6,7% (merah: biaya lebih besar dari anggaran)
Net Profit realisasi 252 jt, anggaran 240 jt → selisih +12 jt
```

#### 8.6.5 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                   | Default sementara     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| KF-35 | Anggaran = `coa_budget` bertipe 1 (Accounting) per lokasi (`segment1_id`), dengan bulan berbasis 0. Apakah `segment1_id` pada anggaran memang berarti Lokasi, sama seperti pada jurnal (O5)? | Diasumsikan Lokasi ⚠️ |
| KF-36 | Anggaran untuk periode berjalan dijumlahkan sebulan penuh, sementara realisasi baru sampai hari ini. Apakah anggaran sebaiknya dipotong proporsional sampai hari ini, atau dibiarkan penuh?  | Penuh ⚠️              |
| KF-37 | `budget_type = 2` (Target Operasional) belum ditampilkan. Apakah perlu ditampilkan (D28)? 🔵 DB demo: tipe 1 = 445.068 baris, tipe 2 = 26.904 baris                                          | Tidak ditampilkan ⚠️  |

---

### 8.7 Halaman Payables (Utang usaha, AP Aging)

Rute `/payables` · service `src/server/services/ap-ar/ap-aging.service.ts` (+ `aging-reader.ts`, `aging-metric.ts`, `aging-helpers.ts`) · logika murni `src/lib/finance/ap-ar/apar.ts`, `aging.ts`, `aging-aggregate.ts`, `aging-reconciliation.ts` · repo `src/server/repo/ap-ar/aging.repo.ts`, `unallocated-sql.ts`, `party.repo.ts` · snapshot `src/server/dash/snapshot*.ts` · komponen `src/components/aging/`.

Halaman Receivables (8.8) memakai kode yang sama (`createAgingMetric`), hanya berbeda modul dan tipe transaksi; semua penjelasan di sini berlaku untuk keduanya kecuali dikatakan lain.

#### 8.7.1 Yang ditampilkan

- Empat kartu: **Utang usaha (neto)** (`total`), **Tagihan belum dibayar** (`unpaidBills`), **Total lewat jatuh tempo** (`overdueSubtotal`, neto per bucket), **Kredit vendor** (`vendorCredits`).
- Peringatan merah bila saldo kartu (buku pembantu) berbeda ≥ Rp1 dengan saldo GL akun kontrol (rekonsiliasi).
- **Bilah umur** (AgingBar): delapan bucket.
- **Tabel per vendor** (dapat dicari dan diurutkan): total dan delapan bucket per vendor; klik membuka drill-down.
- Kartu **Kredit vendor** menampilkan teks pendamping "Retur langsung (IDR ...)" bila ada retur langsung AP yang bersisa negatif.

#### 8.7.2 Data yang diambil

| Data                               | Tabel                                                                   | Dipakai untuk                  |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| Tagihan AP yang masih punya sisa   | `ap_ar_card` + `ap_ar_card_detail` (dibaca dari `dash_snap_ap_ar_open`) | Bagian A                       |
| Pembayaran belum dialokasikan (AP) | `ap_ar_card` (dibaca dari `dash_snap_ap_ar_unallocated`)                | Bagian B                       |
| Nama vendor                        | `vendor` (hanya id, kode, nama; diingat 10 menit per id)                | Tabel vendor                   |
| Akun kontrol utang                 | `coa` + GL (Q7–Q9)                                                      | Rekonsiliasi dengan buku besar |

#### 8.7.3 Urutan sumber data

```text
asOf ≥ tanggal snapshot hari ini                  → dash_snap_ap_ar_*           (cepat)
asOf = akhir bulan yang ada di riwayat            → dash_snap_ap_ar_hist_*      (cepat)
selain itu                                        → query langsung ke ERP (Q16/Q17; lambat di ERP besar)
```

Angka agregat (total, bucket, per vendor) dijumlahkan **langsung oleh database dari tabel snapshot**; daftar tagihan lengkap hanya dimuat untuk tabel tagihan dan drill-down. Bila snapshot dan riwayat tidak mencakup `asOf`, perhitungan memakai daftar tagihan dari query langsung (hasilnya sama). Pembanding (periode sebelumnya) hanya dihitung bila snapshot atau riwayat mencakup tanggalnya; bila tidak, pembanding dilewati supaya halaman tidak menunggu berpuluh menit.

#### 8.7.4 Query

**Agregasi aging dari snapshot** (`snapshot-aggregate.ts`; sama untuk riwayat dengan tambahan `AND as_of_date = :hari` dan tabel `…_hist_*`):

```sql
-- A1: tagihan terbuka dijumlahkan per vendor/pelanggan dan per bucket umur
SELECT a.partyId AS partyId,
       SUM(CASE WHEN a.days BETWEEN 0   AND 30        THEN a.balance ELSE 0 END) AS overdue0_30,
       SUM(CASE WHEN a.days BETWEEN 31  AND 60        THEN a.balance ELSE 0 END) AS overdue31_60,
       SUM(CASE WHEN a.days BETWEEN 61  AND 90        THEN a.balance ELSE 0 END) AS overdue61_90,
       SUM(CASE WHEN a.days BETWEEN 91  AND 100000000 THEN a.balance ELSE 0 END) AS overdue90plus,
       SUM(CASE WHEN a.days BETWEEN -30 AND -1        THEN a.balance ELSE 0 END) AS due1_30,
       SUM(CASE WHEN a.days BETWEEN -60 AND -31       THEN a.balance ELSE 0 END) AS due31_60,
       SUM(CASE WHEN a.days BETWEEN -90 AND -61       THEN a.balance ELSE 0 END) AS due61_90,
       SUM(CASE WHEN a.days BETWEEN -100000000 AND -91 THEN a.balance ELSE 0 END) AS due90plus,
       SUM(CASE WHEN a.balance > 0 THEN a.balance ELSE 0 END) AS positive,
       SUM(CASE WHEN a.balance < 0 THEN a.balance ELSE 0 END) AS negative,
       SUM(CASE WHEN a.itemType = 3 THEN a.balance ELSE 0 END) AS nonTrade,
       SUM(CASE WHEN a.balance > 0 AND a.days >= 0 THEN a.balance ELSE 0 END) AS overdueBills
FROM (
  SELECT party_id AS partyId, balance AS balance, item_type AS itemType,
         DATEDIFF(:asOf, COALESCE(due_date, tx_date)) AS days
  FROM dash_snap_ap_ar_open [FORCE INDEX (PRIMARY)]        -- hint hanya bila tanpa filter entitas
  WHERE module_type = :modul [AND location_id IN (:lokasi)]
) a
GROUP BY a.partyId

-- A2: pembayaran belum dialokasikan, dijumlahkan per pihak dan bucket, diumurkan menurut tanggal transaksinya
SELECT a.partyId AS partyId, (delapan SUM bucket seperti di atas)
FROM (SELECT party_id AS partyId, balance AS balance, DATEDIFF(:asOf, tx_date) AS days
      FROM dash_snap_ap_ar_unallocated
      WHERE module_type = :modul AND kind = 'counted' [AND location_id IN (:lokasi)]) a
GROUP BY a.partyId

-- A3: akun kontrol (untuk rekonsiliasi), pada tabel tagihan dan tabel belum-dialokasikan
SELECT DISTINCT coa_id AS coaId FROM dash_snap_ap_ar_open
WHERE module_type = :modul AND coa_id IS NOT NULL [AND location_id IN (:lokasi)]
-- dan idem untuk dash_snap_ap_ar_unallocated (dengan tambahan AND kind = 'counted')
```

Batas bucket hanya didefinisikan di satu tempat (`AGING_BUCKET_DAYS` di `src/lib/finance/ap-ar/aging.ts`) dan dipakai baik oleh SQL maupun oleh fungsi `bucketOf` di JavaScript (dijaga tes). Penjelasan: `days` = tanggal acuan − jatuh tempo (`due_date`; bila kosong, tanggal transaksi). `days ≥ 0` = sudah jatuh tempo, `days < 0` = belum.

**Daftar tagihan (tabel tagihan dan drill-down)** dari snapshot: S1/S2 (bab 5.7). **Riwayat**: S3.

**Q16: Tagihan terbuka, ERP langsung** (`liveAgingInvoices`; di-cache 5 menit):

```sql
SELECT i.ap_ar_card_id AS invoiceId,
       COALESCE(NULLIF(i.invoice_number, ''), i.transaction_number, '') AS invoiceNumber,
       i.owner_id AS partyId, i.location_id AS locationId, i.coa_id AS coaId,
       DATE(i.transaction_date) AS txDate, i.due_date AS dueDate, i.transaction_type AS itemType,
       i.amount * i.in_out AS originalAmount,
       i.amount * i.in_out + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance
FROM ap_ar_card i
LEFT JOIN ap_ar_card_detail d ON d.invoice_id = i.ap_ar_card_id
LEFT JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
                      AND p.transaction_date < :asOf_plus_1 AND p.in_out IN (-1, 1)
                      AND p.module_type = :modul AND p.transaction_type IN (:tipe_pelunasan)
WHERE i.module_type = :modul AND i.transaction_type IN (:tipe_tagihan)
  AND i.in_out IN (-1, 1) AND i.transaction_date < :asOf_plus_1
  [AND i.location_id IN (:lokasi)]
GROUP BY i.ap_ar_card_id, i.invoice_number, i.transaction_number, i.owner_id, i.location_id, i.coa_id,
         DATE(i.transaction_date), i.due_date, i.transaction_type, i.amount, i.in_out
HAVING balance <> 0
```

Penjelasan: satu tagihan (`i`) digabung dengan alokasi pelunasan (`d`) yang berasal dari kartu pelunasan (`p`) bertanggal sebelum tanggal acuan. Sisa = nominal bertanda + jumlah alokasi (alokasi bertanda berlawanan). Hanya yang sisanya tidak nol yang diambil. Query ini **lambat** pada jutaan kartu (menit), karena itu snapshot dibangun dengan cara lain (B1–B3, bab 5.6).

**Q17: Pembayaran belum dialokasikan, ERP langsung** (`liveAgingUnallocated`):

```sql
-- AP: pembayaran tanpa alokasi (query lama) (fungsi paymentsWithoutDetailQuery di unallocated-sql.ts)
SELECT p.ap_ar_card_id AS cardId, p.owner_id AS partyId, p.location_id AS locationId, p.coa_id AS coaId,
       DATE(p.transaction_date) AS txDate, p.amount * p.in_out AS balance
FROM ap_ar_card p
WHERE p.module_type = :modul AND p.transaction_type IN (:tipe_tanpa_alokasi)
  AND p.in_out IN (-1, 1) AND p.transaction_date < :asOf_plus_1
  [AND p.location_id IN (:lokasi)]
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id);

-- AR: retur langsung (tipe 2), sisanya setelah pelunasan yang menunjuk ke kartu retur (src/server/repo/ap-ar/unallocated-sql.ts, fungsi directReturnsQuery)
SELECT r.ap_ar_card_id AS cardId,
       r.owner_id AS partyId,
       r.location_id AS locationId,
       r.coa_id AS coaId,
       DATE(r.transaction_date) AS txDate,
       r.amount * r.in_out + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance
FROM ap_ar_card r
LEFT JOIN ap_ar_card_detail d ON d.invoice_id = r.ap_ar_card_id
LEFT JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
                      AND p.transaction_date < :asOf_plus_1
                      AND p.in_out IN (-1, 1)
                      AND p.module_type = :modul
                      AND p.transaction_type IN (:tipe_pelunasan)
WHERE r.module_type = :modul
  AND r.transaction_type IN (:tipe_tanpa_alokasi)
  AND r.in_out IN (-1, 1)
  AND r.transaction_date < :asOf_plus_1
  [AND r.location_id IN (:lokasi)]
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail o WHERE o.ap_ar_card_id = r.ap_ar_card_id)
GROUP BY r.ap_ar_card_id, r.owner_id, r.location_id, r.coa_id, DATE(r.transaction_date), r.amount, r.in_out
HAVING balance <> 0;
```

**Q18: Nama vendor/pelanggan** (`party.repo.ts`; per kelompok 1.000 id, diingat 10 menit, hingga 100.000 entri):

```sql
SELECT t.vendor_id AS id, t.code AS code, t.name AS name     -- atau customer_id untuk piutang
FROM vendor t WHERE t.vendor_id IN (:id_vendor)
```

Hanya id, kode, dan nama yang diambil (tidak ada rekening bank, NPWP, atau data identitas).

**Rekonsiliasi dengan GL:** saldo seluruh **akun kontrol** (akun `coa_id` yang muncul pada tagihan dan pembayaran tak teralokasi) dihitung dengan Q7–Q9 pada `asOf`, lalu dibandingkan dengan total buku pembantu.

```text
selisih = saldo GL akun kontrol − total kartu;  sinkron bila |selisih| < Rp1 (RECONCILIATION_TOLERANCE)
```

Bila tidak sinkron, tampil peringatan merah dan temuan `REC_AP` di panel Data perlu dicek (8.11).

#### 8.7.5 Rumus (✅ dari `apar.ts`, `aging-aggregate.ts`)

**Sisa satu tagihan** (D16, D24): `sisa = nominal × in_out + Σ alokasi pelunasan sampai asOf`. Hanya sisa ≠ 0 yang masuk.

Tipe yang dihitung (mengikuti AP Aging ERP): **tagihan AP** = tipe 0, 1, 2, 3, 4, 5, 6, 12 · **pelunasan AP** = tipe 7, 8, 9, 10, 11, 13, 14. (AR: tagihan 0, 3, 4, 5; pelunasan 1, 2.)

```text
Bagian A  (tagihan terbuka)         : Σ sisa semua tagihan; sisa > 0 = tagihan, sisa < 0 = kredit vendor
Bagian B  (pembayaran belum dialokasikan AP) : Σ (nominal × arah) kartu pelunasan tanpa detail (kind = 'counted'); negatif = mengurangi utang
Retur langsung AP                   = Σ sisa negatif item tipe 2 (sudah termasuk Kredit vendor)
Utang usaha (neto) "total"          = A(tagihan) + A(kredit vendor) + B
Tagihan belum dibayar "unpaidBills" = Σ sisa > 0
Kredit vendor "vendorCredits"       = Σ sisa < 0
Umur satu tagihan                   = asOf − jatuh tempo  (jatuh tempo kosong → tanggal transaksi)
Bucket                              : 0–30, 31–60, 61–90, >90 hari lewat tempo (jatuh tempo hari ini = 0–30);
                                      1–30, 31–60, 61–90, >90 hari belum jatuh tempo
Pembayaran belum dialokasikan       diumurkan menurut tanggal transaksinya sendiri
Total lewat jatuh tempo (neto) "overdueSubtotal" = Σ empat bucket "overdue" (sudah dinetto kredit dan pembayaran)
Overdue kartu Summary "overdueBills" = Σ sisa > 0 yang lewat jatuh tempo (hanya tagihan positif; D37)
```

- `payment_status` **sengaja tidak dipakai** (sudah "lunas" begitu tagihan masuk Pengakuan Biaya padahal uang belum keluar).
- `bankpo_payment_detail` **tidak** ditambahkan ke sisa (hitung ganda).
- Receivables: tambahan angka **Piutang non-dagang** = Σ sisa pada item bertipe 3, dan "pengembalian belum dialokasikan": hanya retur langsung (tipe 2), sisanya setelah pelunasan yang menunjuk ke retur; pembayaran tipe 1 tanpa alokasi diabaikan seperti ERP (D25, D51).
- Dua bug ERP **tidak ditiru** (D24): join detail berlipat dan batas bucket berjam.

#### 8.7.6 Contoh angka

Tanggal acuan 15 Oktober.

| Vendor | Tagihan                          | Jatuh tempo | Sisa   | Umur     | Bucket                              |
| ------ | -------------------------------- | ----------- | ------ | -------- | ----------------------------------- |
| A      | INV-1                            | 5 Okt       | 100 jt | +10 hari | overdue 0–30                        |
| A      | INV-2                            | 25 Okt      | 80 jt  | −10 hari | due 1–30                            |
| B      | INV-3                            | 15 Okt      | 60 jt  | 0 hari   | overdue 0–30 (jatuh tempo hari ini) |
| B      | Retur RT-1                       | 12 Okt      | −20 jt | +3       | overdue 0–30                        |
| C      | Pembayaran tanpa alokasi (1 Okt) |             | −30 jt | +14      | overdue 0–30                        |

```text
unpaidBills   = 100 + 80 + 60            = 240 jt
vendorCredits = −20                       = −20 jt
unallocated   = −30                       = −30 jt
total (neto)  = 240 − 20 − 30             = 190 jt
overdueSubtotal (neto)  = 100 + 60 − 20 − 30 = 110 jt       → angka bucket di halaman Payables
overdueBills (kartu Summary) = 100 + 60       = 160 jt       → hanya tagihan positif
```

#### 8.7.7 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                                     | Default sementara                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| KF-38 | Total Payables sama dengan laporan **AP Aging ERP** pada tanggal yang sama?                                                                                                                                    | Dirancang sama (D24), belum dicocokkan ke data klien ⚠️                                        |
| KF-39 | Overdue di kartu Summary hanya menghitung tagihan **positif** (tidak dinetto kredit vendor dan pembayaran belum dialokasikan), sedangkan halaman Payables memakai overdue **neto**. Sesuai?                    | Dua definisi berbeda (D37) ⚠️ (Catatan: Payment Plan memakai angka setelah kredit vendor, D53) |
| KF-40 | Tagihan yang sudah masuk Pengakuan Biaya tetapi belum dibayar tetap dihitung sebagai utang (`payment_status` tidak dipercaya). Benar?                                                                          | Ya (D16) ⚠️                                                                                    |
| KF-41 | Apakah ada pembayaran vendor **belum dialokasikan** dalam jumlah besar (mengurangi utang)? Siapa yang menanganinya di ERP?                                                                                     | Dihitung sebagai pengurang ⚠️                                                                  |
| KF-42 | 77 tagihan AP non-dagang lama (2021–2024) berstatus lunas tanpa catatan pelunasan (`AP_PAID_NO_PAYMENT`, O12): dibersihkan lewat jurnal GL, atau memang masih utang?                                           | Dihitung sebagai utang lama ⚠️                                                                 |
| KF-43 | Tagihan dengan `due_date` sebelum tanggal transaksi (±5 ribu di data demo): perlu diperbaiki di ERP?                                                                                                           | Dihitung apa adanya ⚠️                                                                         |
| KF-44 | Pembanding Payables hanya muncul bila tanggal pembanding ada di snapshot atau riwayat; untuk tanggal lampau lainnya pembanding dilewati (kalau tidak, halaman menunggu menit). Diterima?                       | Pembanding dilewati ⚠️                                                                         |
| KF-63 | Retur atau memo yang terpakai melebihi nilainya sehingga sisanya positif (sekitar 18 retur / +1,43 miliar di Client 1; kini tampil sebagai "tagihan belum dibayar"): salah input, atau memang kelebihan?       | Dihitung apa adanya ⚠️                                                                         |
| KF-65 | Kredit vendor yang sangat lama (79% lebih dari 90 hari; di luar retur sekitar 30,4 miliar; hutang aset tipe 3 dibayar berlebih sekitar 10,5 miliar dari 2 item di Client 1): diklaim, dihapus, atau dibiarkan? | Dihitung sebagai kredit vendor yang mengurangi utang ⚠️                                        |

---

### 8.8 Halaman Receivables (Piutang usaha, AR Aging)

Rute `/receivables` · service `ar-aging.service.ts` · kode sama dengan 8.7. Kartu: **Piutang usaha (neto)** (dengan teks pendamping "Retur langsung (IDR ...)" bila ada retur langsung AR terbuka), **Faktur belum dibayar**, **Total lewat jatuh tempo**, **Piutang non-dagang**; tabel per pelanggan. Query, bucket, snapshot, dan rekonsiliasi sama dengan 8.7 (`module_type = 1`).

**Perbedaan dengan Payables:**

| Aspek                | Payables                                             | Receivables                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modul                | `module_type = 0`                                    | `module_type = 1`                                                                                                                                                             |
| Tipe tagihan         | 0, 1, 2, 3, 4, 5, 6, 12                              | 0, 3, 4, 5                                                                                                                                                                    |
| Tipe pelunasan       | 7, 8, 9, 10, 11, 13, 14                              | 1, 2                                                                                                                                                                          |
| Retur langsung       | Pembayaran belum dialokasikan (semua tipe pelunasan) | Hanya retur langsung (tipe 2), sisanya setelah pelunasan yang menunjuk ke retur; pembayaran pelanggan tipe 1 tanpa alokasi disimpan sebagai ignored dan diabaikan seperti ERP |
| Kartu tambahan       | Kredit vendor                                        | Piutang non-dagang (tipe 3)                                                                                                                                                   |
| Nama pihak           | `vendor`                                             | `customer`                                                                                                                                                                    |
| Status rencana bayar | Ada (Pengakuan Biaya)                                | Tidak ada                                                                                                                                                                     |

#### Contoh angka retur langsung AR (data fiktif)

- Faktur `00005/INV`: nominal 600.000
- Retur langsung `SLSR 00001`: nominal 200.000 (`in_out = -1`)
- Kartu pelunasan `ARP112600003` (nominal 400.000) membuat dua alokasi detail:
  - `+200.000` ke retur langsung (`invoice_id` = kartu retur)
  - `-600.000` ke faktur (`invoice_id` = kartu faktur)

Hasil hitung:

- Sisa faktur = 600.000 − 600.000 = 0 (tutup).
- Sisa retur langsung = −200.000 + 200.000 = **0** (tutup; dibuang dari daftar kartu belum dialokasikan).
- Total piutang pelanggan = **0** (sebelum perbaikan: retur langsung tetap dihitung −200.000 sehingga total piutang −200.000, keliru).

Pembayaran pelanggan tanpa alokasi dipantau lewat data check `AR_PAYMENT_UNALLOC` (warning). Retur langsung yang masih terbuka (baik di AP maupun AR) dipantau lewat data check `DIRECT_RETURN_OPEN` (tingkat `info`).

**Perlu dikonfirmasi:**

| Kode  | Pertanyaan                                                                                                                                                                                                                                             | Default sementara                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| KF-45 | Total Receivables sama dengan laporan **AR Aging ERP**? Pembayaran pelanggan tanpa alokasi diabaikan seperti ERP (dilaporkan data check AR_PAYMENT_UNALLOC, tingkat peringatan, di panel Data perlu dicek): apakah finance ingin angkanya dikurangkan? | Diabaikan (D25) ⚠️                                               |
| KF-46 | Piutang non-dagang (tipe 3; ±Rp24,7 M di data demo): apakah tetap dalam total piutang, atau dipisah?                                                                                                                                                   | Tetap termasuk, dan ditampilkan juga sebagai angka tersendiri ⚠️ |

---

### 8.9 Halaman Payment Plan (rencana pembayaran harian)

Rute `/payment-plan` · service `src/server/services/ap-ar/payment-plan.service.ts` · logika murni `src/lib/finance/ap-ar/payment-plan.ts`, `payment-plan-aggregate.ts`, `payment-plan-bills.ts` · repo `payment-plan.repo.ts`, `aging.repo.ts`, `bank-payment.repo.ts` · komponen `src/components/payment-plan/`.

#### 8.9.1 Yang ditampilkan

- Kontrol: **horizon** 7 / 14 / 30 hari ke depan dan toggle **"Sertakan proyeksi penerimaan"**.
- Peringatan bila ada tagihan **lewat jatuh tempo** (dibebankan ke hari pertama).
- Tiga kartu: **Kas awal**, **Total pengeluaran terencana**, **Saldo proyeksi terendah**.
- **Grafik saldo proyeksi** per hari dan **tabel jadwal harian** (kas awal, penerimaan, pengeluaran, kas akhir, rincian menurut status rencana bayar; hari bersaldo negatif ditandai; klik hari membuka daftar tagihan jatuh tempo hari itu).

#### 8.9.2 Data dan query

| Bagian                               | Sumber                                                                          | Query                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------- |
| Kas awal                             | Cash Position pada **hari ini** (bukan `asOf` filter)                           | 8.3 (Q7–Q9)                                 |
| Tagihan AP jatuh tempo               | Snapshot AP (jumlah per tanggal jatuh tempo di SQL) atau daftar tagihan         | A-agregat di bawah, atau S1/Q16             |
| Kredit vendor & tagihan pasangan     | Snapshot AP (`snapshotCreditData`, `creditPoolsQuery` & `creditableBillsQuery`) | C1 & C2 di bawah                            |
| Status rencana bayar                 | `bankpo_payment` tipe 0 + `bankpo_payment_detail`                               | Q19                                         |
| Penerimaan piutang (opsional)        | Snapshot AR per tanggal jatuh tempo                                             | A-agregat di bawah                          |
| Penerimaan dana pencairan (opsional) | `bank_payment`                                                                  | Q10 dan rata-rata lama cair (8.3.3 butir 6) |

**Jumlah per tanggal jatuh tempo** (`dueTotalsQuery`; sama untuk riwayat):

```sql
SELECT t.dueDate AS dueDate, SUM(t.balance) AS total
FROM (
  SELECT COALESCE(due_date, tx_date) AS dueDate, balance AS balance
  FROM dash_snap_ap_ar_open [FORCE INDEX (PRIMARY)]
  WHERE module_type = :modul AND balance > 0
    [AND location_id IN (:lokasi)] [AND card_id IN (:id_tagihan)]
) t
WHERE t.dueDate <= :tanggal_terakhir [AND t.dueDate >= :tanggal_awal]
GROUP BY t.dueDate
```

Dipanggil: untuk AP semua tagihan sampai tanggal terakhir horizon (termasuk yang lewat tempo), lalu dua kali lagi dengan daftar id tagihan berstatus "disetujui" dan "diseleksi" untuk memecah menurut status. Untuk AR hanya tanggal hari ini sampai tanggal terakhir.

**Query C1: Kolam kredit vendor AP per (vendor, entitas)** (`creditPoolsQuery` di `src/server/dash/snapshot-aggregate.ts`; sama untuk riwayat `dash_snap_ap_ar_hist_open`):

```sql
SELECT party_id AS partyId, location_id AS locationId, SUM(balance) AS total
FROM dash_snap_ap_ar_open [FORCE INDEX (PRIMARY)]      -- petunjuk hanya bila tanpa filter entitas (hari ini)
WHERE module_type = 0 AND balance < 0 AND party_id IS NOT NULL
  [AND location_id IN (:lokasi)]
GROUP BY party_id, location_id
-- total bernilai negatif; kode mengubahnya menjadi jumlah kolam positif (-total) dan membuang pihak kosong
```

**Query C2: Tagihan positif pasangan berkredit** (`creditableBillsQuery` di `src/server/dash/snapshot-aggregate.ts`; sama untuk riwayat):

```sql
SELECT card_id AS invoiceId, party_id AS partyId, location_id AS locationId,
       COALESCE(due_date, tx_date) AS dueDate, balance AS balance
FROM dash_snap_ap_ar_open [FORCE INDEX (PRIMARY)]      -- petunjuk hanya bila tanpa filter entitas dan tanpa daftar vendor
WHERE module_type = 0 AND balance > 0
  [AND party_id IN (:partyIds)]                         -- hanya bila ada filter entitas (jalur 2 di bawah)
  AND COALESCE(due_date, tx_date) <= :maxDue
  [AND location_id IN (:lokasi)]
```

Dua jalur pembacaan (`readCreditData`):

1. **Tanpa filter entitas:** satu pemindaian seluruh tagihan positif sisi AP dalam urutan kunci utama (tanpa `party_id IN`); vendor yang tidak punya kredit dibuang di Node. Dipilih karena hampir semua tagihan milik vendor berkredit: pada data demo (3.972 vendor berkredit, 146.852 tagihan sampai horizon) membaca lewat daftar vendor memakan 5,6 detik, pemindaian kunci utama 0,4 detik (🔵 diukur pada DB lokal, 2026-11-07).
2. **Dengan filter entitas:** tagihan dibaca per potongan lokasi dan per kelompok 1.000 vendor (`party_id IN`), tanpa petunjuk indeks, karena filter menyempitkan pembacaan.

Bila tidak ada kolam kredit sama sekali, tagihan tidak dibaca.

Catatan: Pada jalur daftar `computePaymentPlan`, query C1 dan C2 tidak dipanggil karena semua baris AP terbuka (positif dan negatif) sudah dimuat oleh `apOpenInvoices`; kolam dan tagihan dipasangkan langsung di memori oleh `creditPoolsFromItems`.

**Query C3: Kolam kredit pelanggan AR dari tabel retur langsung** (`unallocatedCreditPoolsQuery` di `src/server/dash/snapshot-aggregate.ts`; sama untuk riwayat `dash_snap_ap_ar_hist_unallocated`):

```sql
SELECT party_id AS partyId, location_id AS locationId, SUM(balance) AS total
FROM dash_snap_ap_ar_unallocated
WHERE module_type = 1 AND balance < 0 AND kind = 'counted' AND party_id IS NOT NULL
  [AND as_of_date = :hari]                              -- hanya untuk riwayat akhir bulan
  [AND location_id IN (:lokasi)]
GROUP BY party_id, location_id
```

Catatan: Pada sisi AR, pembacaan kredit (`readCreditData` dengan opsi `includeUnallocated: true` dan `minDue: today`) menggabungkan kolam dari item terbuka bersisa negatif (query C1) dan retur langsung terbuka (query C3), serta membatasi tagihan yang dibaca (`creditableBillsQuery` C2) hanya yang jatuh tempo pada atau setelah hari ini (`COALESCE(due_date, tx_date) >= :minDue`).

**Q19: Dokumen Pengakuan Biaya aktif** (`listActivePlanStatuses`; di-cache 5 menit):

```sql
SELECT bd.invoice_id AS invoiceId, b.status AS status
FROM bankpo_payment_detail bd
JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
WHERE b.type = 0 AND b.status IN ('Posted', 'Partialy Paid', 'Not Posted')
```

Satu query untuk semua tagihan (bukan satu per tagihan). Untuk drill-down satu halaman tagihan dipakai varian dengan `bd.invoice_id IN (:id)` tanpa saringan status.

#### 8.9.3 Rumus (✅ dari `payment-plan.ts` dan `payment-plan-credits.ts`)

```text
Tagihan yang diperhitungkan : tagihan AP bersisa > 0 dikurangi kolam kredit vendor (D53)
Aturan kolam kredit AP      : 1. Kolam kredit dihitung per pasangan (vendor, entitas/location_id).
                              2. Kredit = semua item AP bersisa negatif (retur, memo kredit, kelebihan bayar),
                                 tanpa batas umur (kredit lama tetap diperhitungkan).
                              3. Kredit mengurangi tagihan pasangan tersebut dengan urutan jatuh tempo paling awal
                                 dulu (due_date ASC, lalu invoiceId ASC).
                              4. Potongan kredit tidak pernah melebihi total tagihan pasangan itu (pengeluaran vendor
                                 tidak pernah bernilai negatif).
                              5. Status rencana bayar potongan kredit mengikuti status tagihan yang dikurangi.
                              6. Potongan kredit tampil sebagai baris tersendiri bertanda negatif di tabel tagihan
                                 dan drill-down hari.
                              7. Pembayaran AP belum dialokasikan (tanpa detail) saat ini tidak dimasukkan ke kolam.
Jatuh tempo                 = due_date (kosong → tanggal transaksi)
Status satu tagihan         : "Disetujui, menunggu bayar" bila ada dokumen Posted / Partialy Paid;
                              selain itu "Diseleksi, belum disetujui" bila ada dokumen Not Posted;
                              selain itu "Belum diseleksi"
Lewat jatuh tempo (overdue) = Σ (saldo tagihan − potongan kredit) dengan jatuh tempo < hari ini → dibebankan pada HARI KE-0
Aturan kolam kredit AR      : 1. Kolam kredit per (pelanggan, entitas/location_id) = retur langsung AR (unallocated)
                                 + item AR bersisa negatif (memo kredit).
                              2. Kredit hanya mengurangi faktur yang dihitung dalam proyeksi horizon
                                 (jatuh tempo hari ini s.d. akhir horizon), urut jatuh tempo terawal (D54).
                              3. Faktur lewat jatuh tempo tidak ikut proyeksi dan tidak menyerap kredit (konservatif).
                              4. Potongan tidak melebihi total faktur horizon pelanggan tersebut.
                              5. Pembayaran AR tanpa alokasi tidak ikut kolam (D25).
Hari h (0…horizon−1)        : pengeluaran = Σ (saldo tagihan − potongan kredit) jatuh tempo pada tanggal itu (+ overdue pada hari 0)
                              penerimaan  = Σ (faktur piutang − potongan kredit pelanggan) jatuh tempo hari itu
                                            + dana pencairan yang diperkirakan cair hari itu
                              (hanya bila toggle penerimaan aktif)
                              kas akhir   = kas awal + penerimaan − pengeluaran;  kas awal hari berikutnya = kas akhir
Perkiraan tanggal cair dana = tanggal transaksi + max(1, ceil(rata-rata lama cair channel 90 hari terakhir)),
                              tidak lebih awal dari BESOK (bila channel tak punya data: 1 hari)
Total pengeluaran           = overdue + Σ pengeluaran harian
Kredit terpakai (AP)        = creditsApplied = Σ potongan kredit pada tagihan yang masuk horizon atau overdue
Kredit penerimaan (AR)      = inflowCreditsApplied = Σ potongan kredit pelanggan pada faktur horizon
Saldo proyeksi terendah     = kas akhir terkecil (atau kas awal bila tidak ada yang lebih kecil)
```

Tagihan yang jatuh temponya **lewat horizon** tidak mengubah rencana, jadi tidak dimuat. Pada tabel tagihan (di halaman Summary, 8.1.6) tagihan dipisah menjadi dua tab "jatuh tempo ≤ horizon" dan "lewat jatuh tempo".

#### 8.9.4 Contoh angka

Hari ini 15 Oktober, horizon 7 hari, kas awal 1.770 jt, tanpa proyeksi penerimaan.

| Tagihan | Jatuh tempo   | Saldo  | Status                          |
| ------- | ------------- | ------ | ------------------------------- |
| INV-1   | 5 Okt (lewat) | 100 jt | Belum diseleksi                 |
| INV-2   | 15 Okt        | 40 jt  | Disetujui                       |
| INV-3   | 18 Okt        | 300 jt | Diseleksi                       |
| INV-4   | 30 Okt        | 500 jt | (di luar horizon, tidak dimuat) |

```text
Hari 15 Okt : pengeluaran = 40 + overdue 100 = 140 jt;  kas akhir = 1.770 − 140 = 1.630 jt
Hari 18 Okt : pengeluaran = 300 jt;                     kas akhir = 1.630 − 300 = 1.330 jt
Total pengeluaran = 100 + 40 + 300 = 440 jt;  saldo terendah = 1.330 jt
```

**Contoh pemotongan kredit vendor:**

- Tagihan 22.200 dan retur 4.440 pada vendor dan entitas yang sama: tagihan dipotong 4.440 sehingga rencana bayar menjadi 17.760.
- Contoh kolam kredit 150: Vendor V1 di entitas L1 memiliki kredit 150 dan tiga tagihan: Tagihan 1 (overdue, 60), Tagihan 2 (hari ke-2, 70), Tagihan 3 (hari ke-5, 50). Alokasi kolam 150: Tagihan 1 terpotong penuh 60 (sisa kredit 90), Tagihan 2 terpotong penuh 70 (sisa kredit 20), Tagihan 3 terpotong 20 (tersisa 30). Pengeluaran menjadi: Hari 0 (overdue) = 0, Hari ke-2 = 0, Hari ke-5 = 30. Kredit terpakai (creditsApplied) = 150.
- **Contoh penerimaan dikurangi kredit pelanggan:** Pelanggan C1 memiliki retur langsung 120 jt dan dua faktur dalam horizon: Faktur 1 (jatuh tempo hari ini, 100 jt) dan Faktur 2 (jatuh tempo hari ke-3, 50 jt), serta faktur lewat jatuh tempo 80 jt. Faktur lewat jatuh tempo tidak menyerap kredit. Alokasi kolam 120 jt: Faktur 1 terpotong penuh 100 jt (sisa kredit 20 jt), Faktur 2 terpotong 20 jt (sisa faktur 30 jt). Penerimaan menjadi: Hari ini = 0 jt, Hari ke-3 = 30 jt. Kredit pelanggan terpakai (inflowCreditsApplied) = 120 jt.

#### 8.9.5 Perlu dikonfirmasi

| Kode  | Pertanyaan                                                                                                                                                                                  | Default sementara                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| KF-47 | Istilah label status rencana bayar yang dipakai finance klien ("Belum diseleksi", "Diseleksi, belum disetujui", "Disetujui, menunggu bayar") sudah sesuai (O16)?                            | Mengikuti nama menu ERP "Seleksi Invoice" ⚠️                       |
| KF-48 | Kas awal Payment Plan = Cash Position (Kas + Bank) hari ini, **tanpa** Deposito dan tanpa mengurangi giro beredar. Sesuai (O15)?                                                            | Ya ⚠️                                                              |
| KF-49 | Semua tagihan lewat jatuh tempo dibebankan ke hari pertama. Apakah tagihan sangat lama (mis. > 180 hari) perlu ditandai atau ditinjau terpisah?                                             | Tanpa penandaan ⚠️                                                 |
| KF-50 | Proyeksi penerimaan memakai tanggal jatuh tempo piutang dan perkiraan lama cair dana per channel (rata-rata 90 hari). Apakah pola pembayaran pelanggan sebenarnya berbeda dari jatuh tempo? | Memakai jatuh tempo ⚠️                                             |
| KF-64 | 337 vendor dengan kredit persis sama dengan tagihan (sekitar 10,48 miliar di Client 1): kenapa tidak dipasangkan di ERP?                                                                    | Belum dipasangkan di ERP ⚠️                                        |
| KF-66 | Dokumen Pengakuan Biaya berstatus Not Posted yang berumur tahunan: masih berlaku atau draf mati? (memengaruhi label "Diseleksi")                                                            | Dihitung sebagai Diseleksi ⚠️                                      |
| KF-67 | Setujukah finance bila Payment Plan AP mengurangi kredit vendor otomatis (aturan kolam D53)?                                                                                                | Mengurangi tagihan terawal ⚠️                                      |
| KF-68 | Setujukah finance bila proyeksi penerimaan piutang dikurangi kredit pelanggan (retur langsung dan memo kredit), hanya pada faktur yang jatuh tempo dari hari ini sampai akhir horizon?      | Dikurangi, faktur lewat jatuh tempo tidak menyerap kredit (D54) ⚠️ |

---

### 8.10 Settings › Account Mapping

Rute `/settings/account-mapping` · service `src/server/services/settings.service.ts` · repo `settings.repo.ts` (Q5) · logika `src/lib/finance/coa/basket-resolver.ts`, `src/lib/settings/mapping-validate.ts`, `mapping-schema.ts` · komponen `src/components/settings/`.

**Tujuan:** admin memilih akun mana yang masuk lima keranjang (Kas, Bank, Deposito, Dana dalam pencairan, Biaya Tetap) dengan **mencentang pohon CoA**. Centang HEADER = seluruh isinya ikut (termasuk akun yang ditambahkan kemudian); centang sebagian = hanya anak-anak yang dicentang.

- **Penyimpanan:** satu baris `system_main` (Q5) berisi JSON `{ version, updatedAt, baskets: { cash|bank|deposit|inTransit|fixedCost: { include: [coa_id…] } } }`. Satu pengaturan per instalasi (tanpa profil klien).
- **Validasi** sebelum simpan (✅ `mapping-validate.ts`): **memblokir** bila satu akun berada di lebih dari satu keranjang di antara Kas/Bank/Deposito/Dana dalam pencairan (Biaya Tetap dikecualikan dari cek ini); **peringatan** bila Kas dan Bank sama-sama kosong; **peringatan** bila ada `coa_id` yang sudah tidak ada di CoA (diabaikan).
- **Setelah simpan:** seluruh cache dikosongkan (`clearCache()`), sehingga semua angka dihitung ulang. Snapshot kas (`dash_snap_cash_*`) otomatis dibangun ulang pada siklus refresh berikutnya karena hash akun kas berubah (bab 5.5).
- **Pratinjau:** pohon CoA dengan saldo tiap akun pada tanggal acuan (Q7–Q9) dan daftar akun hasil resolusi.
- **Izin:** semua pengguna yang bisa login boleh menyimpan (S9). Tidak ada pemeriksaan peran.
- Yang **tidak** bisa diatur (sementara): baris P&L, kolom segmen entitas, ambang aging/runway.

**Perlu dikonfirmasi:** KF-06 (isi keranjang) dan KF-51: siapa yang boleh mengubah Account Mapping? Saat ini siapa pun yang bisa login. Perubahan keranjang langsung mengubah semua angka kas.

---

### 8.11 Panel "Data perlu dicek" (kualitas data)

Panel ini ada di kerangka aplikasi (`AppShell`) dan menampilkan temuan yang membuat angka perlu dicurigai. Hasilnya di-cache 5 menit. Setiap sub-pemeriksaan berdiri sendiri; yang gagal dilaporkan sebagai `CHECK_FAILED` tanpa menyembunyikan yang lain. Kode: `src/server/services/data-checks.service.ts`, `src/server/repo/data-checks.repo.ts`, `src/lib/finance/checks/data-checks.ts`.

| Kode                    | Arti                                                                              | Syarat muncul                                             | Tautan        |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------- |
| `CF_IDENTITY` (bahaya)  | Kas awal + arus kas ≠ kas akhir                                                   | Cek identitas Cash Flow gagal                             | Cash Flow     |
| `TRANSIT_OVERDUE`       | Dana belum cair tertahan > 7 hari atau bertanggal masa depan                      | ≥ 1 transaksi                                             | Cash Position |
| `CF_UNCLASSIFIED`       | Mutasi kas belum terklasifikasi (atau sumber klasifikasi memakai aturan cadangan) | Jumlah "Belum terklasifikasi" > 0, atau sumber = cadangan | Cash Flow     |
| `REC_TRANSIT`           | Saldo GL dana dalam pencairan berbeda ≥ Rp1 dengan register                       | Tidak sinkron                                             | Cash Position |
| `REC_AP`                | Saldo kartu utang berbeda ≥ Rp1 dengan akun kontrol GL                            | Tidak sinkron                                             | Payables      |
| `AR_PAYMENT_UNALLOC`    | Pembayaran pelanggan tanpa alokasi ke faktur                                      | Jumlah > 0                                                | Receivables   |
| `DIRECT_RETURN_OPEN`    | Retur langsung masih terbuka (AP + AR; tingkat **info**)                          | Jumlah > 0                                                | Payables      |
| `AP_PAID_NO_PAYMENT`    | Tagihan AP **non-dagang** (tipe 1) berstatus lunas tanpa catatan pelunasan        | ≥ 1                                                       | Payables      |
| `CARD_PARTY_MISSING`    | Vendor/pelanggan di kartu tidak ada di master                                     | ≥ 1                                                       | Payables      |
| `CARD_LOCATION_INVALID` | Lokasi kartu tidak ada di master lokasi                                           | ≥ 1                                                       | Payables      |
| `UNPOSTED`              | Jurnal draft pada periode terpilih                                                | ≥ 1                                                       | Summary       |
| `SETTINGS`              | Account Mapping belum disimpan                                                    | Baris `system_main` kosong/tak ada                        | Settings      |
| `CHECK_FAILED`          | Satu atau lebih pemeriksaan gagal dijalankan                                      | ≥ 1 gagal                                                 | Summary       |

**Query pemeriksaan** (semua dari `data-checks.repo.ts` ✅):

```sql
-- AP_PAID_NO_PAYMENT
SELECT COUNT(*) AS n, COALESCE(SUM(c.amount), 0) AS amount
FROM ap_ar_card c
WHERE c.module_type = 0 AND c.transaction_type = 1 AND c.payment_status = 2
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.invoice_id = c.ap_ar_card_id)
  [AND c.location_id IN (:lokasi)]

-- CARD_PARTY_MISSING (pelanggan; modul AR)
SELECT COUNT(*) AS n FROM ap_ar_card c
WHERE c.module_type = 1 AND c.owner_id IS NOT NULL AND c.owner_id != ''
  AND NOT EXISTS (SELECT 1 FROM customer cust WHERE cust.customer_id = c.owner_id)
  [AND c.location_id IN (:lokasi)]
-- CARD_PARTY_MISSING (vendor): daftar pemilik berbeda di ap_ar_card dicocokkan dulu dengan tabel vendor,
-- lalu hanya kartu pemilik yang bukan vendor yang dihitung (sebelumnya anti-join ±3 menit, kini ±2 detik)
SELECT c.module_type AS moduleType, COUNT(*) AS n
FROM ap_ar_card c
WHERE c.owner_id IN (
    SELECT o.owner_id FROM (SELECT DISTINCT owner_id FROM ap_ar_card WHERE owner_id IS NOT NULL AND owner_id != '') o
    WHERE o.owner_id NOT IN (SELECT vendor_id FROM vendor))
  [AND c.location_id IN (:lokasi)]
GROUP BY c.module_type

-- CARD_LOCATION_INVALID
SELECT COUNT(*) AS n FROM ap_ar_card c
WHERE c.location_id IS NOT NULL AND c.location_id != ''
  AND NOT EXISTS (SELECT 1 FROM pos_location l WHERE l.location_id = c.location_id)

-- TRANSIT_OVERDUE
SELECT COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2) AND bp.status = 0
  AND (bp.transaction_date < :asOf_minus_7 OR bp.transaction_date >= :asOf_plus_1)
  [AND bp.segment1_id IN (:segmen)]

-- AR_PAYMENT_UNALLOC (dari snapshot hari ini, kind = 'ignored')
SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS total
FROM dash_snap_ap_ar_unallocated
WHERE module_type = 1 AND kind = 'ignored'
  [AND location_id IN (:lokasi)]

-- UNPOSTED (per tabel GL dan per kelompok periode)
SELECT COUNT(*) AS n FROM gl g WHERE g.posted_status = 0 AND g.period_id IN (:periode)
```

Tingkat pemeriksaan: **bahaya** (danger), **peringatan** (warning), dan **info**. Pemeriksaan bertingkat `info` (seperti `DIRECT_RETURN_OPEN`) ditampilkan dengan nada redup (muted) di panel dan **tidak menaikkan angka badge lonceng** di `AppShell`, karena retur langsung yang masih terbuka adalah hal wajar operasional yang sekadar perlu diketahui tanpa menuntut tindakan mendesak.

Pemeriksaan lain (`CF_IDENTITY`, `CF_UNCLASSIFIED`, `REC_TRANSIT`, `REC_AP`, `AR_PAYMENT_UNALLOC`, `DIRECT_RETURN_OPEN`, `SETTINGS`) memakai hasil metrik Cash Flow, Cash Position, AP/AR Aging, dan snapshot hari ini yang sudah ada.

> Catatan: `TRANSIT_OVERDUE` memakai ambang **7 hari** tetap, sedangkan tabel Dana dalam pencairan di Cash Position memakai `IN_TRANSIT_ALERT_DAYS` (bawaan 3). Keduanya sengaja berbeda.

**Perlu dikonfirmasi:** KF-52: apakah temuan `UNPOSTED` (jurnal draft pada periode terpilih) perlu ditampilkan lebih menonjol karena draft tidak masuk angka (KF-08)? Dan KF-42/KF-43 (kualitas data kartu).

---

### 8.12 Drill-down (dari angka sampai baris jurnal)

Klik angka/baris di halaman membuka **panel samping** (sheet). Statusnya di parameter URL `drill` (metrik + daftar langkah, maksimal 8), jadi bisa dibagikan. Semua level memakai filter yang sama dengan halaman. Kode: `src/server/services/drill/` (`drill.service.ts` memilih jalur menurut `drill.metric`), `src/components/drill/`. Satu halaman data = **200 baris** (`PAGE_SIZE`).

| Metrik (`drill.metric`)                 | Jalur langkah                                                 | Sumber                                             |
| --------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `revenue`, `pnl`, `fixedCost`, `budget` | bagian/folder → akun → entitas → baris jurnal                 | Q11/Q12 (per akun, per lokasi) dan baris jurnal R5 |
| `cashPosition`                          | Kas/Bank → folder → akun → (saldo)                            | Q7–Q9                                              |
| `inTransit`                             | channel → entitas → tanggal → transaksi belum cair            | Q10 dan daftar transaksi (8.3.3 butir 5)           |
| `cashFlow`                              | laci → sub-baris → akun lawan → jurnal                        | Porsi kas terklasifikasi (8.4)                     |
| `expensePaid`                           | kategori → vendor/akun → pembayaran                           | E1, E2, porsi kas (8.4.7)                          |
| `apAging`, `arAging`                    | bucket → vendor/pelanggan → tagihan → riwayat pelunasan kartu | Daftar tagihan snapshot (S1/S2) dan riwayat kartu  |
| `paymentPlan`                           | hari → daftar tagihan jatuh tempo                             | Daftar tagihan AP                                  |

- **Riwayat pelunasan satu kartu** (langkah `card`, dari metrik mana pun):

```sql
SELECT p.ap_ar_card_id AS cardId, p.transaction_type AS transactionType,
       COALESCE(p.transaction_number, '') AS transactionNumber, DATE(p.transaction_date) AS txDate, d.amount AS amount
FROM ap_ar_card_detail d
JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
WHERE d.invoice_id = :id_tagihan
ORDER BY p.transaction_date, p.ap_ar_card_id
```

- **Keterangan entitas** (nama entitas kecil di bawah baris) hanya dipasang pada baris dengan **satu pemilik** (tagihan, baris jurnal) dan hanya bila lebih dari satu entitas dalam filter; baris agregat (P&L, Budget, Cash Position, Cash Flow) tidak diberi keterangan (D41, O18).
- **Jumlah baris jurnal** per akun per jurnal: satu jurnal yang menyentuh akun yang sama dua kali dijumlah menjadi satu baris.
- Drill AP/AR memuat daftar tagihan lengkap ke memori (hanya saat dibuka).

**Perlu dikonfirmasi:** KF-17 (kecukupan nomor jurnal/jenis/keterangan) dan KF-53: apakah baris agregat (P&L, Budget, vendor/customer) perlu keterangan entitas (O18)?

---

## 9. Cache, performa, dan umur angka

### 9.1 Mengapa ada cache dan apa akibatnya untuk angka

Menghitung sebuah halaman bisa menjalankan beberapa query berat. Agar halaman terasa cepat dan database ERP tidak dibebani, hasil disimpan sementara di **memori server** (`src/server/cache.ts`). Akibatnya angka di layar **bisa sedikit lebih tua dari ERP**. Ada dua lapis penyimpanan sementara:

1. **Tabel `dash_*`** (bab 5): salinan hasil hitung di database, diperbarui tiap beberapa menit sampai jam.
2. **Cache memori server**: hasil query dan hasil metrik, diingat detik sampai jam.

Keduanya dapat membuat angka dashboard tertinggal dari ERP. Tabel "Data as of …" di sidebar hanya menunjukkan umur lapis pertama untuk **utang/piutang**; lapis kedua tidak terlihat di layar.

### 9.2 Cache hasil metrik: stale-while-revalidate (SWR)

Setiap metrik (Revenue, P&L, Cash Position, …) dibungkus `memoMetric` (D45):

```text
umur 0 ─────────── 60 detik ─────────────────── 60 + 180 detik ──────►
       "segar"      "basi tetapi masih dipakai"     "kedaluwarsa"
       dijawab      dijawab SEKETIKA dari cache,    dihitung ulang dan
       dari cache   sambil SATU perhitungan ulang   pengguna menunggu
                    berjalan di belakang layar
```

- `METRIC_FRESH_SECONDS` (bawaan 60, 5–3600) dan `METRIC_STALE_SECONDS` (bawaan 180, 0–86.400; `0` = tidak ada masa basi).
- Jadi angka yang ditampilkan **paling lama sekitar 4 menit lebih tua** dari data ERP (60 + 180 detik).
- **Keterbatasan 1:** karena metrik saling memakai hasil satu sama lain, angka di kartu dan di drill-down-nya dapat dihitung pada saat berbeda dan selisihnya bisa sebesar masa basi.
- **Keterbatasan 2:** hasil yang dihitung ulang di belakang layar bisa memakai metrik dalam yang sendiri masih dari cache basi, sehingga umur angka bisa melebihi 4 menit (paling buruk mendekati dua kali lipat).
- Bila angka kartu dan drill-down harus identik, tunggu sampai segar atau tekan **"Perbarui sekarang"**.
- Satu perhitungan untuk kunci yang sama dibagi bersama (permintaan bersamaan tidak menjalankan query dua kali).
- Perhitungan ulang di belakang layar yang gagal menjaga angka lama dan mencoba lagi setelah 10 detik.

### 9.3 Cache lain (TTL)

| Isi                                                                                                                     | Lama                                                                        | Lokasi di kode                             |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| Metrik (Revenue, P&L, Cash Position, Cash Flow, Runway, Budget, Fixed Cost, Expense Paid, AP/AR Aging, Payment Plan, …) | 60 detik segar + 180 detik basi                                             | `memoMetric`                               |
| Data induk: daftar akun (pohon), periode, entitas                                                                       | 10 menit                                                                    | `context.ts`                               |
| Pengaturan keranjang akun                                                                                               | 2 menit (bila dihitung ulang)                                               | `account-mapping`                          |
| Saldo akun per tanggal                                                                                                  | 60 detik                                                                    | `balance.service.ts`                       |
| Dana belum cair, giro beredar (register `bank_payment`)                                                                 | 60 detik                                                                    | `bank-payment.repo.ts`                     |
| Baris jurnal kas, pembayaran AP (Expense Paid)                                                                          | 60 detik                                                                    | `cashflow.repo.ts`, `expense-paid.repo.ts` |
| Daftar tagihan terbuka/belum dialokasikan (query langsung)                                                              | 5 menit                                                                     | `aging.repo.ts`                            |
| Dokumen Pengakuan Biaya aktif                                                                                           | 5 menit                                                                     | `payment-plan.repo.ts`                     |
| Hasil Data perlu dicek                                                                                                  | 5 menit (tanpa masa basi)                                                   | `data-checks.service.ts`                   |
| Info snapshot AP/AR (`dash_snap_meta`)                                                                                  | 15 detik                                                                    | `snapshot.ts`                              |
| Daftar periode yang ada di snapshot GL/kas                                                                              | 30 detik                                                                    | `gl-snapshot.ts`, `cash-lines-read.ts`     |
| Isi snapshot AP/AR di memori                                                                                            | sampai snapshot berikutnya (maks. 6 jam; kunci memuat `refreshedAt`)        | `snapshot.ts`                              |
| Riwayat akhir bulan di memori                                                                                           | 30 menit (kunci memuat waktu bangun)                                        | `snapshot-hist.ts`                         |
| Mutasi GL periode **Closed**                                                                                            | 6 jam, maks. 500 entri dan ±400 ribu baris (LRU; kunci memuat versi bangun) | `glMovementsCache`                         |
| Nama vendor/pelanggan                                                                                                   | 10 menit, maks. 100.000 entri                                               | `party.repo.ts`                            |
| Cek kolom `canceled_date`                                                                                               | 1 jam                                                                       | `gl-columns.ts`                            |
| Status user (aktif/tidak)                                                                                               | 1 menit                                                                     | `user-check.ts`                            |
| Hitungan jurnal per periode (sidik jari) bersama dua langkah refresh                                                    | 60 detik                                                                    | `gl-period-stats.repo.ts`                  |

Batas memori cache umum: **200 entri** dan **1,5 juta "bobot"** (±jumlah baris); yang paling lama tidak dipakai dibuang lebih dulu.

### 9.4 Kapan cache dikosongkan

| Kejadian                                               | Yang dikosongkan                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Account Mapping disimpan                               | **Semua** cache                                                                  |
| Tombol "Perbarui sekarang"                             | Cache metrik (`metric:`) dan hitungan jurnal periode (`dash:period-stats:`)      |
| Periode GL/kas dibangun ulang atau dihapus di snapshot | Daftar periode, baris kas, mutasi periode Closed, semua metrik (`invalidate.ts`) |
| Refresh AP/AR selesai                                  | Cache info snapshot dibaca ulang dan snapshot baru dimuat ke memori ("warm")     |

### 9.5 Riwayat fase performa

Dokumen rencana lengkap ada di `plans/` (folder lokal, tidak di git) dan pengukuran di `docs/performance-measurement.md`. Ringkasan:

| Fase       | Tanggal    | Yang dilakukan                                                                                                    | Keputusan |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 0          | 2026-11-04 | Pengukuran awal: Runway 52–60 dtk, Cash Flow YTD 172–186 dtk, semua metrik selalu dingin, refresh berebut koneksi | —         |
| 1A         | 2026-11-04 | Sidik jari periode pada snapshot GL; bangun ulang otomatis bila periode dibuka dan ditutup ulang                  | D43       |
| 1B         | 2026-11-04 | Snapshot baris jurnal kas (`dash_snap_cash_*`) untuk Cash Flow dan Runway                                         | D44       |
| 2          | 2026-11-04 | Cache SWR, Summary memuat bertahap, tombol refresh mengosongkan cache metrik                                      | D45       |
| 3          | 2026-11-05 | Pool koneksi terpisah untuk refresh, scheduler mulai saat server boot                                             | D46       |
| 4          | 2026-11-05 | Aging AP/AR dan ringkasan Payment Plan dijumlahkan di SQL dari snapshot                                           | D47       |
| 5          | 2026-11-05 | `FORCE INDEX (PRIMARY)` untuk pembacaan penuh satu sisi snapshot                                                  | D48       |
| (perapian) | 2026-11-05 | Satu mesin refresh periode untuk snapshot GL dan kas                                                              | D49       |
| 6          | 2026-11-05 | Rebuild AP/AR lebih cepat: pemindaian sederhana digabung di Node                                                  | D50       |

Masalah yang masih dicatat: tombol "Perbarui sekarang" terasa lama (catatan 2026-11-05); log manual refresh kini memuat waktu tiap langkah (`step-timer.ts`) untuk menelusuri langkah mana yang memakan waktu.

### 9.6 Pengukuran dan log

- `SLOW_QUERY_MS` (bawaan 1000): query lebih lambat dari ini dicatat sebagai peringatan (hanya teks SQL, **tanpa parameter**). `0` = mati.
- `PERF_LOG=1`: mencatat durasi tiap metrik yang benar-benar dihitung (cache hit tidak dicatat) dan antrean tunggu koneksi.
- `DB_QUERY_TIMEOUT_MS` (bawaan 120.000): batas waktu satu `SELECT`; pekerjaan refresh mematikan batas ini pada sesinya sendiri.
- Log server memakai `createLogger`/`dashLog` (bukan `console`).

---

## 10. Operasional: konfigurasi, perintah, dan jadwal

### 10.1 Variabel lingkungan (`.env`; contoh di `.env.example`)

> Isi `.env` **tidak pernah** dibaca atau dicetak oleh Claude Code (skrip pengecekan sementara memuat `.env` di prosesnya sendiri dan tidak mencetak isinya). Nilai bawaan berasal dari `src/server/env.ts`.

| Variabel                                                                      | Bawaan                 | Arti                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                | (wajib)                | Alamat database `mysql://USER:PASSWORD@HOST:PORT/DATABASE`. Pengembangan: database **lokal** saja |
| `DB_POOL_SIZE`                                                                | 5 (1–10)               | Jumlah koneksi untuk permintaan pengguna                                                          |
| `DB_QUERY_TIMEOUT_MS`                                                         | 120000                 | Batas waktu satu `SELECT` (0 = tanpa batas)                                                       |
| `SLOW_QUERY_MS`                                                               | 1000                   | Batas peringatan query lambat (0 = mati)                                                          |
| `PERF_LOG`                                                                    | 0                      | 1 = catat durasi metrik dan antrean koneksi                                                       |
| `METRIC_FRESH_SECONDS`                                                        | 60 (5–3600)            | Lama hasil metrik dianggap segar                                                                  |
| `METRIC_STALE_SECONDS`                                                        | 180 (0–86400)          | Lama tambahan hasil lama masih dipakai sambil dihitung ulang                                      |
| `SESSION_SECRET`                                                              | (wajib, ≥ 32 karakter) | Kunci enkripsi cookie sesi                                                                        |
| `APP_TIMEZONE`                                                                | `Asia/Jakarta`         | Zona waktu untuk menentukan "hari ini"                                                            |
| `APP_TODAY`                                                                   | kosong                 | "Hari ini" tetap (`YYYY-MM-DD`) untuk rekonsiliasi data lama; **kosongkan di produksi**           |
| `IN_TRANSIT_ALERT_DAYS`                                                       | 3 (0–120)              | Ambang umur dana belum cair yang ditandai di Cash Position                                        |
| `ERP_APP_ID_INDEX`                                                            | 7 (0–99)               | Indeks aplikasi untuk membuat id baris `system_main` baru (pola ERP)                              |
| `DASH_REFRESH_ENABLED`                                                        | 1                      | 0 = matikan refresh snapshot (tombol "Perbarui sekarang" disembunyikan)                           |
| `DASH_REFRESH_MINUTES`                                                        | 10 (1–1440)            | Interval refresh snapshot                                                                         |
| `DASH_AP_AR_HIST_MONTHS`                                                      | 13 (0–36)              | Jumlah akhir bulan riwayat AP/AR (0 = matikan dan kosongkan)                                      |
| `DASH_POOL_SIZE`                                                              | 2 (1–5)                | Koneksi khusus refresh; server membuka `DB_POOL_SIZE + DASH_POOL_SIZE` koneksi                    |
| `AUTO_MIGRATE`                                                                | 0                      | 1 = terapkan migrasi `dash_*` saat server mulai                                                   |
| `DASH_MIGRATIONS_DIR`                                                         | `./drizzle-dash`       | Folder file migrasi                                                                               |
| `PORT`, `HOST`                                                                | 3000, `0.0.0.0`        | Server produksi (`npm start`)                                                                     |
| `TRUST_PROXY`                                                                 | 0                      | 1 hanya bila ada reverse proxy yang mengisi `X-Forwarded-For`                                     |
| `TEST_TODAY`, `TEST_DATABASE_URL`, `SEED_DEMO_LOGIN_ID`, `SEED_DEMO_PASSWORD` | (lihat `.env.example`) | Hanya untuk tes integrasi dan seed, wajib host lokal                                              |

### 10.2 Perintah (`npm run …`)

| Perintah                                                                    | Fungsi                                                                                                | Menyentuh DB?  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- |
| `dev`                                                                       | Server pengembangan di `http://localhost:3000`                                                        | Ya (membaca)   |
| `build` / `start`                                                           | Bangun dan jalankan server produksi (`scripts/start-server.mjs`, menyajikan `dist/`)                  | Ya             |
| `typecheck`, `lint`, `lint:fix`, `format`, `format:check`                   | Pemeriksaan kode                                                                                      | Tidak          |
| `test`                                                                      | Tes unit (Vitest, proyek `unit`)                                                                      | Tidak          |
| `test:db`                                                                   | Tes integrasi ke DB **lokal** (`tests/integration/**/*.int.test.ts`)                                  | Ya, minta izin |
| `db:pull`                                                                   | `drizzle-kit pull` dari DB lokal (hanya untuk menyalin struktur tabel ERP)                            | Ya, minta izin |
| `db:dash:generate`, `db:dash:check`                                         | Membuat dan memeriksa file migrasi `dash_*`                                                           | Tidak          |
| `db:dash:status`, `db:dash:migrate`                                         | Melihat dan menerapkan migrasi `dash_*`                                                               | Ya, minta izin |
| `dash:refresh`, `dash:refresh-gl`, `dash:refresh-cash`, `dash:refresh-hist` | Bangun snapshot AP/AR, GL Closed, baris kas, riwayat akhir bulan                                      | Ya, minta izin |
| `seed`                                                                      | Mengarah ke `scripts/seed/index.ts` yang **belum ada** (hanya pelindung host `scripts/seed/guard.ts`) | —              |

**Aturan izin (dari `CLAUDE.md`):** pemasangan/penghapusan paket, **apa pun yang berjalan ke database** (termasuk satu `SELECT`), commit, dan push **harus mendapat jawaban "ya" dari pemilik proyek lebih dulu**. Skrip `docs/sql/dashboard-indexes.sql` hanya dijalankan manual oleh pemilik proyek. Tidak pernah menjalankan `drizzle-kit push`.

### 10.3 Dari server menyala sampai angka tampil

1. `src/server-entry.ts` memulai **scheduler** snapshot (cadangan: dimulai oleh middleware pada permintaan pertama).
2. Bila `AUTO_MIGRATE=1`, migrasi `dash_*` diterapkan; bila ada migrasi tertunda, siklus refresh dilewati dan peringatan dicatat.
3. Scheduler menunggu sampai snapshot AP/AR berumur ≥ `DASH_REFRESH_MINUTES`, lalu menjalankan siklus tiap interval (bab 5.4).
4. Pengguna login → server function memeriksa sesi dan status user → `resolveFilter` → service → repo → hasil → cache.

### 10.4 Kartu "Data as of …" dan tombol "Perbarui sekarang"

- **Isi kartu:** tanggal yang digambarkan snapshot AP/AR dan kapan terakhir diperbarui/diperiksa. Peringatan "basi" muncul bila snapshot untuk hari yang lalu atau tidak diperiksa selama lebih dari `max(3 × interval, 30)` menit (5.3.1). Bila tabel `dash_*` belum ada atau belum pernah dibangun, kartu menjelaskan bahwa **query langsung yang lambat** dipakai (`not-migrated`, `not-refreshed`, `disabled`).
- **Tombol "Perbarui sekarang"** (U8): menjalankan **siklus yang sama dengan scheduler** (AP/AR selalu dibangun ulang, `force`), langsung menjawab "dimulai", lalu berjalan di latar belakang. Browser menanyakan status tiap ±3 detik saat berjalan (±60 detik saat diam) dan memuat ulang angka bila selesai. **Cooldown bersama 2 menit.** Semua pengguna yang login boleh menekannya. Tombol disembunyikan bila `DASH_REFRESH_ENABLED=0` atau migrasi belum diterapkan. Pesan galat mentah tidak dikirim ke browser.
- **Mengapa AP/AR dibangun ulang paksa:** edit pada tagihan lama tidak mengubah sidik jari ERP (jumlah dan id), jadi tanpa `force` tombol akan terasa "tidak berbuat apa-apa".

### 10.5 Pelindung otomatis (tes)

| Pelindung                                         | Menjaga apa                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js` (lapisan)                      | `routes`, `components`, `queries`, `lib` tidak mengimpor `~/server`, Drizzle, atau mysql2; `lib` tanpa React/router; `components/ui` bebas domain |
| `src/server/repo/sql-guard.test.ts`               | Semua file repo: kompatibel MySQL 5.7, tanpa `SELECT *`, tanpa penulisan data (kecuali `settings.repo.ts`), tanpa kata `password`                 |
| `src/server/dash/guard.test.ts`                   | Hanya tabel `dash_*` yang ditulis; repo tidak menulis ke `dash_*`                                                                                 |
| `src/server/dash/pool-usage.test.ts`              | Kode `dash` tidak memakai koneksi dari pool pengguna                                                                                              |
| `src/i18n/keys.test.ts`                           | Kunci `en.json` dan `id.json` identik                                                                                                             |
| `src/lib/finance/ap-ar/aging-bucket-days.test.ts` | Batas bucket SQL dan JavaScript sama                                                                                                              |

---

## 11. FAQ: kenapa angka tidak cocok dengan ERP?

Urutan pengecekan yang disarankan, dari penyebab paling umum:

| #   | Penyebab                                                                                                                                                               | Cara mengeceknya                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Jurnal belum diposting (draft)**: dashboard tidak menghitungnya                                                                                                      | Lihat temuan `UNPOSTED` di panel "Data perlu dicek"; di ERP, filter jurnal berstatus NOT POSTED pada periode itu (KF-08) |
| 2   | **Periode vs tanggal:** angka bulanan memakai periode pencatatan (`period_id`), laporan lain mungkin memakai tanggal transaksi                                         | Bandingkan dengan laporan ERP yang memakai dasar yang sama; jurnal bertanggal mundur masuk periode pencatatannya (6.3)   |
| 3   | **Periode masih Open/Pre Closed:** angkanya masih bisa berubah                                                                                                         | Banner di atas halaman                                                                                                   |
| 4   | **Angka lama di cache** (sampai ±4 menit, bisa hampir dua kali lipat pada metrik bersarang)                                                                            | Tekan "Perbarui sekarang", atau tunggu dan muat ulang (9.2)                                                              |
| 5   | **Snapshot AP/AR belum diperbarui** ("Data as of …")                                                                                                                   | Lihat kartu di sidebar; tekan "Perbarui sekarang" (10.4)                                                                 |
| 6   | **Periode Closed dibuka lalu ditutup ulang** dengan perubahan angka tanpa mengubah jumlah jurnal: snapshot lama belum sadar                                            | Dua periode terbaru dibangun ulang tiap 24 jam; lainnya lewat `npm run dash:refresh-gl -- --rebuild <id>` (5.5)          |
| 7   | **Filter entitas berbeda** dengan laporan ERP (mis. ERP semua lokasi, dashboard sebagian)                                                                              | Samakan filter; ingat "Tanpa entitas" tidak ikut bila entitas difilter (8.2.6)                                           |
| 8   | **Segmen Lokasi NBAL:** kas atau utang per entitas bisa janggal                                                                                                        | Periksa jurnal lintas rekening antar entitas (6.4, KF-05)                                                                |
| 9   | **Pembanding berbeda definisi:** dashboard membandingkan dengan periode lalu **penuh**                                                                                 | 6.1, KF-04                                                                                                               |
| 10  | **Revenue lebih besar dari laporan ERP:** retur/diskon penjualan mungkin ada di grup Expense/Cost Of Sales, atau sebaliknya                                            | Periksa grup akun retur dan diskon (KF-11); Other Revenue tidak ikut Revenue (KF-12)                                     |
| 11  | **Net Profit berbeda:** versi laporan Laba Rugi ERP berbeda-beda (versi lain ikut menghitung draft dan memakai saldo awal laba rugi)                                   | Acuan dashboard = versi "generate" `profitloss_segmentgen.jsp` (8.5.3, KF-30)                                            |
| 12  | **Cash Position berbeda dari Neraca ERP:** Deposito tidak ikut, giro beredar hanya informasi, keranjang akun mungkin berbeda dari yang dipakai ERP                     | Cek Settings (KF-06, KF-19); bandingkan per akun lewat drill-down                                                        |
| 13  | **Dana dalam pencairan berbeda dari register:** jurnal pencairan belum diposting                                                                                       | Peringatan `REC_TRANSIT` (8.3.4)                                                                                         |
| 14  | **Arus kas per sub-baris berbeda dari laporan Arus Kas ERP:** jurnal campuran (alokasi proporsional) dan baris tak terpetakan                                          | Panel rekonsiliasi di halaman Cash Flow (8.4.4)                                                                          |
| 15  | **Utang berbeda dari AP Aging ERP:** `payment_status` tidak dipercaya, pembayaran belum dialokasikan mengurangi utang, dua bug ERP tidak ditiru                        | 8.7.5; peringatan `REC_AP` bila selisih dengan GL                                                                        |
| 16  | **Overdue di Summary lebih besar dari "Total lewat jatuh tempo" di Payables**                                                                                          | Kartu = tagihan positif; halaman = neto kredit dan pembayaran (KF-39)                                                    |
| 17  | **Piutang berbeda dari AR Aging ERP:** pembayaran pelanggan tanpa alokasi diabaikan seperti ERP; retur langsung yang sudah dipakai pelunasan tidak dihitung lagi (D51) | `AR_PAYMENT_UNALLOC` (8.8), D51                                                                                          |
| 18  | **Anggaran tampak jauh di atas realisasi pada bulan berjalan:** anggaran bulan penuh vs realisasi sampai hari ini                                                      | 8.6.3, KF-36                                                                                                             |
| 19  | **Account Mapping baru diubah:** semua cache dikosongkan, snapshot kas dibangun ulang pada siklus berikutnya                                                           | Tunggu satu siklus atau tekan "Perbarui sekarang"                                                                        |
| 20  | **Pembulatan:** folder Revenue bisa berbeda beberapa sen dari total bila ERP menyimpan lebih dari 2 desimal                                                            | 8.2.4                                                                                                                    |

**Cara cepat menelusuri satu angka:** buka halaman → klik angka untuk drill-down sampai baris jurnal → cocokkan nomor jurnal dengan ERP. Bila nomor jurnal ada di ERP tetapi tidak muncul di drill-down, periksa status (draft), periode, dan entitasnya.

---

## 12. Tabel pusat konfirmasi

### 12.1 Cara mengisi

- **Prioritas:** **T** (tinggi) = memengaruhi angka utama atau keputusan besar; **S** (sedang) = definisi/istilah yang bisa membuat angka berbeda di kondisi tertentu; **R** (rendah) = tampilan atau istilah.
- **Status:** `Belum` (default), `Ditanyakan` (sudah disampaikan ke finance), `Dikonfirmasi` (sesuai default), `Berubah` (jawaban berbeda: perlu pekerjaan kode), `Ditolak/Tidak berlaku`.
- **Jawaban finance** dan **Tanggal** diisi oleh pemilik proyek saat finance menjawab. Setelah jawaban berubah menjadi perubahan kode, catat di [bab 14](#14-riwayat-perubahan) dan perbarui sub-bab terkait.
- Penanda ⚠️ di sub-bab merujuk ke kode `KF-nn` di tabel ini. Nomor `KF` **tidak dipakai ulang**; item yang selesai diberi status, tidak dihapus.

### 12.2 Daftar konfirmasi

| Kode  | P   | Halaman / bab | Pertanyaan (ringkas)                                                                                                                                                                                                                                                                | Default program sekarang                                                                                           | Status                                      | Jawaban finance | Tanggal |
| ----- | --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------- | ------- |
| KF-01 | S   | 5             | "Data as of …" utang/piutang bisa tertinggal sampai 10 menit (perubahan tagihan lama sampai 1 jam kecuali "Perbarui sekarang"): dapat diterima?                                                                                                                                     | Diterima                                                                                                           | Belum                                       |                 |         |
| KF-02 | S   | 5             | Edit angka di dalam jurnal periode Closed lama tanpa mengubah jumlah jurnal hanya terdeteksi lewat bangun ulang (24 jam untuk 2 periode terbaru, manual untuk lainnya): mungkinkah terjadi di ERP klien?                                                                            | Diterima dengan risiko                                                                                             | Belum                                       |                 |         |
| KF-03 | R   | 5             | Bila admin ERP membuka ulang periode lama, perlukah finance diberi tahu?                                                                                                                                                                                                            | Tidak ada pemberitahuan                                                                                            | Belum                                       |                 |         |
| KF-04 | T   | 6.1           | Pembanding periode berjalan (bulan ini, kuartal ini, YTD, 12 bulan) dengan periode lalu **penuh** atau dipotong sampai tanggal yang sama?                                                                                                                                           | Pembanding penuh                                                                                                   | Belum                                       |                 |         |
| KF-05 | S   | 6.4           | Segmen Lokasi NBAL: apakah saldo kas dan utang per entitas masuk akal / ada pencatatan lintas rekening antar entitas (O3)?                                                                                                                                                          | Diabaikan                                                                                                          | Belum                                       |                 |         |
| KF-06 | T   | 6.6           | Isi keranjang Kas, Bank, Deposito, Dana dalam pencairan, Biaya Tetap di Settings sudah benar?                                                                                                                                                                                       | Sesuai pilihan admin                                                                                               | Belum                                       |                 |         |
| KF-07 | T   | 6.10          | Konsolidasi **tanpa eliminasi antar-entitas**: adakah penjualan, pinjaman, atau akun pihak berelasi (1133, 1135, 2102, 2112) antar entitas yang menggelembungkan angka gabungan?                                                                                                    | Tanpa eliminasi (D2)                                                                                               | Belum                                       |                 |         |
| KF-08 | T   | 7.4           | Jurnal draft memang tidak boleh masuk angka dashboard?                                                                                                                                                                                                                              | Tidak dihitung                                                                                                     | Belum                                       |                 |         |
| KF-09 | T   | 7.4           | Angka dashboard sama dengan Neraca/Buku Besar/Laba Rugi ERP pada tanggal dan entitas yang sama (termasuk saat ada periode Open)?                                                                                                                                                    | Dirancang sama, belum dicocokkan                                                                                   | Belum                                       |                 |         |
| KF-10 | S   | 8.0.1         | Nilai `sysuser.user_status` mana yang berarti aktif di ERP klien (program mengizinkan 0, 1, 2)? 🔵 DB demo: 0 = 655 akun, 1 = 144, 2 = 560                                                                                                                                          | 0, 1, 2                                                                                                            | Belum                                       |                 |         |
| KF-11 | T   | 8.2           | Semua pendapatan usaha ada di akun grup Revenue? Retur dan diskon penjualan di grup Revenue (neto) atau grup lain (bruto)?                                                                                                                                                          | Neto                                                                                                               | Belum                                       |                 |         |
| KF-12 | S   | 8.2           | Other Revenue (jasa giro, pendapatan lain-lain) memang tidak ikut Revenue?                                                                                                                                                                                                          | Tidak ikut                                                                                                         | Belum                                       |                 |         |
| KF-13 | S   | 8.2           | Pendapatan tanpa lokasi ("Tanpa entitas"): ada di data klien? bagaimana menanganinya?                                                                                                                                                                                               | Ditampilkan apa adanya                                                                                             | Belum                                       |                 |         |
| KF-14 | S   | 8.2           | Folder pendapatan yang tampil (otomatis dari pohon akun) sesuai pengelompokan finance? Ada akun Revenue yang induknya bercampur grup lain?                                                                                                                                          | Otomatis dari pohon                                                                                                | Belum                                       |                 |         |
| KF-15 | R   | 8.2           | Periode 13 batang terpisah atau digabung ke Desember?                                                                                                                                                                                                                               | Digabung ke bulan mulai                                                                                            | Belum                                       |                 |         |
| KF-16 | R   | 8.2           | Kartu "Top Location" di tampilan Inggris diberi nama "Top Entity"?                                                                                                                                                                                                                  | Top Location                                                                                                       | Belum                                       |                 |         |
| KF-17 | R   | 8.2, 8.12     | Nomor jurnal, jenis, dan keterangan di drill-down cukup untuk menelusuri selisih ke ERP?                                                                                                                                                                                            | Cukup                                                                                                              | Belum                                       |                 |         |
| KF-18 | T   | 8.3           | Isi keranjang Kas/Bank/Deposito/Transit benar (sama dengan KF-06 untuk halaman ini)?                                                                                                                                                                                                | Sesuai Settings                                                                                                    | Belum                                       |                 |         |
| KF-19 | T   | 8.3           | Cash Position **tanpa Deposito**; Deposito dan giro/cek beredar masuk "kas yang bisa dipakai" (O15)?                                                                                                                                                                                | Hanya Kas + Bank; giro informasi                                                                                   | Belum                                       |                 |         |
| KF-20 | S   | 8.3           | Dana dalam pencairan = saldo GL, register `bank_payment` hanya rincian/rekonsiliasi: sinkron di data klien?                                                                                                                                                                         | GL utama                                                                                                           | Belum                                       |                 |         |
| KF-21 | S   | 8.3           | Dokumen kas yang belum diposting tidak dihitung: saldo bisa lebih kecil dari kas riil. Diterima?                                                                                                                                                                                    | Diterima                                                                                                           | Belum                                       |                 |         |
| KF-22 | S   | 8.3           | Ambang umur dana belum cair 3 hari sesuai kebiasaan pencairan klien (rutin ±10 hari di satu klien)?                                                                                                                                                                                 | 3 hari                                                                                                             | Belum                                       |                 |         |
| KF-23 | S   | 8.3           | Pembayaran non-PO (`bank_payment` tipe 5, 6, 8) juga memakai alur giro belum cair (O17)?                                                                                                                                                                                            | Belum dihitung                                                                                                     | Belum                                       |                 |         |
| KF-24 | T   | 8.4.7         | **Tanda `ap_ar_card_detail.amount` pada kartu pembayaran:** 🔵 di DB demo alokasi kartu bayar tipe 9/10 negatif (Sep 2025: −Rp53,6 M); total Expense Paid kini menegasikannya sama dengan drill-down. Mohon lihat apakah total "Pembayaran tagihan AP" kini masuk akal bagi finance | Diperbaiki di kode 2026-11-05                                                                                      | Dikonfirmasi (kode); angka menunggu finance |                 |         |
| KF-25 | S   | 8.4           | Jurnal campuran: hanya bagian kas dihitung (alokasi proporsional). Sesuai?                                                                                                                                                                                                          | Alokasi proporsional (disetujui user)                                                                              | Belum                                       |                 |         |
| KF-26 | T   | 8.4           | Celah `cash_flow_setup` klien (O13): grup tanpa pemetaan, pinjaman bank di OPERATING, akun wakil Biaya Dibayar Dimuka. Apakah setup dilengkapi?                                                                                                                                     | Mengikuti setup                                                                                                    | Belum                                       |                 |         |
| KF-27 | S   | 8.4.6         | Burn = rata-rata arus kas bersih **semua laci**; Runway memakai Kas + Bank sedangkan arus kas termasuk Deposito: wajar?                                                                                                                                                             | Semua laci                                                                                                         | Belum                                       |                 |         |
| KF-28 | S   | 8.4.6         | Current Ratio = Liquid Assets ÷ Current Liabilities (termasuk hutang bank jangka panjang di folder tertentu): sesuai definisi finance?                                                                                                                                              | Seperti rumus                                                                                                      | Belum                                       |                 |         |
| KF-29 | S   | 8.4.7         | Expense Paid: pembayaran langsung tanpa tagihan dengan lawan Beban/HPP semua dihitung (O6)? Giro dihitung di tanggal pencatatan?                                                                                                                                                    | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-30 | T   | 8.5           | Acuan Laba Rugi = versi "generate" ERP, tanpa jurnal draft (O14)?                                                                                                                                                                                                                   | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-31 | S   | 8.5           | Akun OCI klien (O4): sebutkan akun/kode induk agar fitur OCI bisa diaktifkan lagi                                                                                                                                                                                                   | OCI nonaktif                                                                                                       | Belum                                       |                 |         |
| KF-32 | S   | 8.5           | Isi grup Other Expense (bunga, kurs, pajak, penyusutan?) dan apakah penyusutan mengurangi Laba Usaha (O19)?                                                                                                                                                                         | Di luar Laba Usaha                                                                                                 | Belum                                       |                 |         |
| KF-33 | S   | 8.5           | HPP (Cost Of Sales) diposting ke buku besar klien?                                                                                                                                                                                                                                  | Mengikuti data                                                                                                     | Belum                                       |                 |         |
| KF-34 | S   | 8.5           | Keranjang Biaya Tetap: akun apa; "Variabel" = sisa akun Expense sesuai definisi?                                                                                                                                                                                                    | Sesuai Settings                                                                                                    | Belum                                       |                 |         |
| KF-35 | S   | 8.6           | `coa_budget.segment1_id` berarti Lokasi (O5)?                                                                                                                                                                                                                                       | Lokasi                                                                                                             | Belum                                       |                 |         |
| KF-36 | T   | 8.6           | Anggaran periode berjalan: bulan penuh atau dipotong proporsional?                                                                                                                                                                                                                  | Bulan penuh                                                                                                        | Belum                                       |                 |         |
| KF-37 | R   | 8.6           | `budget_type = 2` (Target Operasional) perlu ditampilkan (D28)? 🔵 DB demo: tipe 1 = 445.068 baris, tipe 2 = 26.904 baris                                                                                                                                                           | Tidak ditampilkan                                                                                                  | Belum                                       |                 |         |
| KF-38 | T   | 8.7           | Total Payables sama dengan AP Aging ERP?                                                                                                                                                                                                                                            | Dirancang sama                                                                                                     | Belum                                       |                 |         |
| KF-39 | T   | 8.7           | Overdue kartu Summary (tagihan positif) vs Payables (neto): sesuai?                                                                                                                                                                                                                 | Dua definisi                                                                                                       | Belum                                       |                 |         |
| KF-40 | S   | 8.7           | Tagihan yang sudah masuk Pengakuan Biaya tetapi belum dibayar tetap utang?                                                                                                                                                                                                          | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-41 | S   | 8.7           | Pembayaran vendor belum dialokasikan dalam jumlah besar? Siapa menanganinya?                                                                                                                                                                                                        | Pengurang utang                                                                                                    | Belum                                       |                 |         |
| KF-42 | S   | 8.7           | 77 tagihan non-dagang lama "lunas tanpa pembayaran" (O12): sudah dibersihkan lewat jurnal atau masih utang?                                                                                                                                                                         | Dihitung utang                                                                                                     | Belum                                       |                 |         |
| KF-43 | R   | 8.7           | `due_date` sebelum tanggal transaksi: perlu diperbaiki di ERP?                                                                                                                                                                                                                      | Apa adanya                                                                                                         | Belum                                       |                 |         |
| KF-44 | R   | 8.7           | Pembanding Payables dilewati bila tanggalnya di luar snapshot dan riwayat: diterima?                                                                                                                                                                                                | Dilewati                                                                                                           | Belum                                       |                 |         |
| KF-45 | S   | 8.8           | Total Receivables sama dengan AR Aging ERP? Pembayaran pelanggan tanpa alokasi diabaikan seperti ERP (kini dilaporkan data check AR_PAYMENT_UNALLOC): ingin dikurangkan?                                                                                                            | Diabaikan (D25)                                                                                                    | Belum                                       |                 |         |
| KF-46 | S   | 8.8           | Piutang non-dagang (tipe 3) tetap dalam total atau dipisah?                                                                                                                                                                                                                         | Tetap termasuk                                                                                                     | Belum                                       |                 |         |
| KF-47 | R   | 8.9           | Label status rencana bayar sudah sesuai istilah finance (O16)?                                                                                                                                                                                                                      | Mengikuti menu ERP                                                                                                 | Belum                                       |                 |         |
| KF-48 | S   | 8.9           | Kas awal Payment Plan = Kas + Bank hari ini, tanpa Deposito dan tanpa giro: sesuai (O15)?                                                                                                                                                                                           | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-49 | R   | 8.9           | Tagihan sangat lama (> 180 hari) perlu ditandai/ditinjau terpisah?                                                                                                                                                                                                                  | Tanpa penandaan                                                                                                    | Belum                                       |                 |         |
| KF-50 | R   | 8.9           | Proyeksi penerimaan memakai jatuh tempo piutang dan rata-rata lama cair 90 hari: sesuai pola pembayaran pelanggan?                                                                                                                                                                  | Jatuh tempo                                                                                                        | Belum                                       |                 |         |
| KF-51 | S   | 8.10          | Siapa yang boleh mengubah Account Mapping dan menekan "Perbarui sekarang" (saat ini semua akun yang bisa login)?                                                                                                                                                                    | Semua akun                                                                                                         | Belum                                       |                 |         |
| KF-52 | R   | 8.11          | Temuan `UNPOSTED` perlu lebih menonjol?                                                                                                                                                                                                                                             | Seperti sekarang                                                                                                   | Belum                                       |                 |         |
| KF-53 | R   | 8.12          | Baris agregat (P&L, Budget, vendor/customer) perlu keterangan entitas (O18)?                                                                                                                                                                                                        | Tidak                                                                                                              | Belum                                       |                 |         |
| KF-54 | T   | 8.1           | Cash Position (Kas + Bank, tanpa Deposito) dan keranjangnya benar?                                                                                                                                                                                                                  | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-55 | T   | 8.1           | Total Payables dan Cash Position sama dengan laporan ERP pada tanggal yang sama?                                                                                                                                                                                                    | Belum dicocokkan                                                                                                   | Belum                                       |                 |         |
| KF-56 | S   | 8.1           | Definisi Overdue kartu dan isi tabel tagihan (tagihan lama ditandai?)                                                                                                                                                                                                               | Seperti 8.1.6                                                                                                      | Belum                                       |                 |         |
| KF-57 | S   | 8.1           | Isi tab Expense donut (HPP + Beban Operasional, tanpa Other Expense) sesuai?                                                                                                                                                                                                        | Ya                                                                                                                 | Belum                                       |                 |         |
| KF-58 | S   | 8.1           | Kartu Cash Position mengikuti filter periode (saldo akhir periode), bukan selalu hari ini: sesuai?                                                                                                                                                                                  | Mengikuti filter                                                                                                   | Belum                                       |                 |         |
| KF-59 | S   | 10            | Database mana (dari ±72 database server kantor) yang dipakai untuk holding ini (O10)?                                                                                                                                                                                               | Dari `DATABASE_URL`                                                                                                | Belum                                       |                 |         |
| KF-60 | S   | 10            | Indeks tambahan `docs/sql/dashboard-indexes.sql` (O11) sudah dipasang di database klien? Ada read replica? (Rebuild snapshot tidak bergantung padanya, tetapi query langsung akan jauh lebih cepat.)                                                                                | Belum diketahui                                                                                                    | Belum                                       |                 |         |
| KF-61 | S   | 6.9           | Versi **server** database klien memang MySQL 5.7.44 (`SELECT VERSION();`)? Angka 5.7.44 yang diketahui berasal dari program klien `mysql --version` (O9).                                                                                                                           | MySQL 5.7.44                                                                                                       | Belum                                       |                 |         |
| KF-62 | T   | 8.8           | Apakah total AR Aging ERP mengurangi retur langsung yang sudah dipakai pelunasan (kartu pelunasan yang menunjuk kartu retur)?                                                                                                                                                       | Ya, dikurangi (cocok dengan layar AR Aging ERP pada data uji lokal 🟣; Client 1: 225 retur / 121,6 juta terdampak) | Belum                                       |                 |         |
| KF-63 | S   | 8.7           | Retur atau memo yang terpakai melebihi nilainya sehingga sisanya positif (sekitar 18 retur / +1,43 miliar di Client 1; kini tampil sebagai "tagihan belum dibayar"): salah input, atau memang kelebihan?                                                                            | Dihitung apa adanya                                                                                                | Belum                                       |                 |         |
| KF-64 | S   | 8.9           | 337 vendor dengan kredit persis sama dengan tagihan (sekitar 10,48 miliar di Client 1): kenapa tidak dipasangkan di ERP?                                                                                                                                                            | Belum dipasangkan                                                                                                  | Belum                                       |                 |         |
| KF-65 | S   | 8.7           | Kredit vendor yang sangat lama (79% lebih dari 90 hari; di luar retur sekitar 30,4 miliar; hutang aset tipe 3 dibayar berlebih sekitar 10,5 miliar dari 2 item di Client 1): diklaim, dihapus, atau dibiarkan?                                                                      | Dihitung sebagai kredit vendor yang mengurangi utang                                                               | Belum                                       |                 |         |
| KF-66 | S   | 8.9           | Dokumen Pengakuan Biaya berstatus Not Posted yang berumur tahunan: masih berlaku atau draf mati? (memengaruhi label "Diseleksi")                                                                                                                                                    | Dihitung sebagai Diseleksi                                                                                         | Belum                                       |                 |         |
| KF-67 | T   | 8.9           | Setujukah finance bila Payment Plan AP mengurangi kredit vendor otomatis (aturan kolam D53)?                                                                                                                                                                                        | Mengurangi tagihan terawal                                                                                         | Belum                                       |                 |         |
| KF-68 | S   | 8.9           | Setujukah finance bila proyeksi penerimaan piutang dikurangi kredit pelanggan (retur langsung dan memo kredit), hanya pada faktur yang jatuh tempo dari hari ini sampai akhir horizon?                                                                                              | Dikurangi, faktur lewat jatuh tempo tidak menyerap kredit (D54)                                                    | Belum                                       |                 |         |

### 12.3 Hasil pengecekan ke database lokal (2026-11-05)

Pengecekan memakai **tujuh query `SELECT` (hanya baca)** ke database lokal `demo` (MariaDB 10.4, **bukan data klien**), dijalankan lewat skrip sementara di luar repositori yang menolak berjalan bila host database bukan lokal dan tidak mencetak string koneksi. Izin diberikan pemilik proyek di chat. Isi `.env` tidak dibaca oleh Claude. Kolom `password` tidak pernah diambil.

| No   | Pemeriksaan                                                                  | Hasil                                                                                                                                                                                                                                                                                                                                                                                                                 | Dampak ke dokumen                                                        |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| DB-1 | Kolom tabel `dash_*` (`information_schema`)                                  | **83 kolom di 11 tabel**: 10 tabel `dash_snap_*` dan `dash_migrations` (catatan migrasi dari migrator, kolom `id`, `hash`, `created_at`). Nama, urutan, dan tipe kolom **sama** dengan `schema.ts` dan migrasi 0000–0006                                                                                                                                                                                              | Bab 5.3 🔵                                                               |
| DB-2 | `dash_snap_meta` dan jumlah baris                                            | `ap_ar`: status `ok`, dibangun 2026-11-05 02:44 UTC, diperiksa 03:11 UTC, tanggal 2026-11-05, **164.518 baris** (164.332 tagihan terbuka + 186 belum dialokasikan), lama bangun **69,4 detik**. Riwayat: **13 akhir bulan**, `hist_open` **2.136.308** baris, `hist_unallocated` 2.416. GL: **46 periode**, `dash_snap_gl_monthly` **192.668** baris. Kas: **46 periode**, `dash_snap_cash_lines` **5.091.937** baris | Bab 5.2 dan 5.3 🔵                                                       |
| DB-3 | `periode` per status                                                         | Tipe 0 (reguler): **46 Closed** (Des 2021 – Sep 2025), **12 Pre Closed** (Okt 2025 – Okt 2026), **1 Open** (Nov 2026). Ditambah 1 periode tipe 3 berstatus Pre Closed (Nov 2021). Jumlah periode Closed (46) sama dengan baris `dash_snap_gl_periods` dan `dash_snap_cash_periods`                                                                                                                                    | Bab 2.6, 5.5, 7.3 🔵                                                     |
| DB-4 | Tanda `ap_ar_card_detail.amount` kartu bayar AP tipe 9/10/14, September 2025 | Tipe 10, `in_out = −1`: 70.825 kartu, min −2.379.332.240, maks +438.701.243, **jumlah −53.630.947.132,29**. Tipe 9, `in_out = −1`: 2 kartu, jumlah −1.402.017. Tipe 10, `in_out = +1`: 34 kartu, jumlah +243.546.364,43. Tidak ada tipe 14                                                                                                                                                                            | **KF-24** (8.4.7) 🔵, diperbaiki di kode                                 |
| DB-5 | `sysuser` per `user_status`                                                  | `0` = 655, `1` = 144, `2` = 560                                                                                                                                                                                                                                                                                                                                                                                       | **KF-10** (8.0.1) 🔵                                                     |
| DB-6 | `cash_flow_setup` vs `coa`                                                   | **10 baris setup, 0 akunnya ada di `coa`**                                                                                                                                                                                                                                                                                                                                                                            | Di database demo selalu dipakai **aturan cadangan** Cash Flow (8.4.4) 🔵 |
| DB-7 | `coa_budget` per `budget_type`                                               | Tipe 1 = 445.068 baris; tipe 2 = 26.904 baris                                                                                                                                                                                                                                                                                                                                                                         | **KF-37** (8.6) 🔵                                                       |

**Catatan hasil:**

- Data transaksi demo berakhir sekitar Oktober 2025 (`docs/data-model.md`), sedangkan tanggal "hari ini" aplikasi saat pengecekan 2026-11-05. Bila `APP_TODAY` tidak diisi, pilihan "Bulan ini" menunjuk November 2026 (periode Open yang kosong). Untuk uji dengan data demo isi `APP_TODAY` (tes integrasi memakai `TEST_TODAY` bawaan 2025-10-15).
- Semua pengecekan hanya membuktikan **struktur dan keadaan database lokal**. Kecocokan angka dengan laporan ERP klien (🟣) belum dilakukan.
- Pengecekan yang belum dilakukan: kecocokan hasil query dengan MySQL 5.7 (database lokal MariaDB 10.4), kecocokan angka dashboard dengan laporan ERP, dan pengecekan ke database klien.

---

## 13. Rujukan ke dokumen lain

| Dokumen                                                                        | Isi                                                                                   | Kapan dibuka                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------- |
| `docs/decisions.md`                                                            | Keputusan bernomor (D#, F#, S#, U#, T#) dan pertanyaan terbuka (O#), dengan alasannya | Menelusuri "kenapa begini"    |
| `docs/data-model.md`                                                           | Kolom demi kolom tabel ERP, arti kode, rumus lengkap per metrik, temuan kualitas data | Detail teknis tabel dan rumus |
| `docs/progress.md`                                                             | Catatan kerja per langkah                                                             | Riwayat pengerjaan            |
| `docs/project-structure.md`                                                    | Di mana tiap jenis file ditaruh di `src/`                                             | Developer menambah file       |
| `docs/performance-measurement.md`                                              | Pengukuran performa dan hasil fase 0–6                                                | Menelusuri performa           |
| `docs/design/neraca-ui/`                                                       | Design system "Neraca UI" (token, komponen, aturan merek)                             | Menulis tampilan              |
| `docs/sql/dashboard-indexes.sql`, `docs/sql/transit-reconciliation-checks.sql` | Skrip indeks dan pengecekan rekonsiliasi; **dijalankan manual oleh pemilik proyek**   | Tim DBA / pemilik proyek      |
| `schema/columns.csv`, `schema/ap_lunas_tanpa_pembayaran.csv`                   | Daftar kolom ERP dan daftar item AP "lunas tanpa pembayaran"                          | Rujukan data                  |
| `plans/README.md` dan `plans/00_phase*.md`                                     | Aturan emas G1–G38 dan rencana fase performa (folder lokal, tidak di git)             | Developer                     |
| `CLAUDE.md`                                                                    | Aturan kerja proyek untuk Claude Code                                                 | Developer dan AI              |

---

## 14. Riwayat perubahan

| Tanggal    | Perubahan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 | Retur langsung AR yang sudah dipakai pelunasan tidak lagi dihitung (sisa = -nominal + detail yang menunjuk ke retur) di snapshot hari ini, riwayat akhir bulan, dan query langsung; riwayat dibangun ulang otomatis lewat kolom formula_version (bagian 5.3.4, 5.6, 8.7.4, 8.8; D51, KF-62).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-05 | **Dokumen dibuat.** Menggantikan `summary-page.md`, `summary-queries.md`, `revenue-page.md`, dan `revenue-queries.md` (dihapus). Memuat dasar akuntansi, glosarium, tabel ERP dan `dash_*`, aturan umum, katalog query, penjelasan semua halaman, cache, operasional, FAQ selisih, dan tabel konfirmasi `KF-01…KF-61`. Isi dibaca dari kode (penanda ✅) dan dicek ke database lokal `demo` dengan tujuh `SELECT` hanya-baca (penanda 🔵, bab 12.3). Temuan baru: tanda `detailSum` pada Expense Paid kemungkinan terbalik (KF-24, terbukti dari data demo: alokasi pembayaran bernilai negatif); `budget_type = 2` tidak dibaca kode (KF-37); batas status login 0/1/2 (KF-10); `cash_flow_setup` database demo seluruhnya tidak cocok dengan `coa` sehingga aturan cadangan dipakai (8.4.4). |
| 2026-11-05 | Expense Paid: `ap_ar_card_detail.amount` pada kartu pembayaran bernilai negatif, jadi total "Pembayaran tagihan AP" dan angka per entitas kini menegasikannya (`expense-paid.ts`, `expense-paid.service.ts`); sebelumnya tampil negatif dan berbeda dari drill-down (KF-24). Bagian 8.4.7 dan bab 12 diperbarui; tes unit disesuaikan. Angka Expense Paid berubah tanda dibanding versi sebelumnya.                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-05 | Format angka singkat (kartu, sumbu grafik) kini menulis angka negatif dalam kurung seperti tabel, mis. "IDR (29.19B)", bukan dengan tanda minus (`src/lib/format/number.ts`). Bab 6.8 diperbarui. Contoh angka negatif di dokumen ini sebagian masih memakai tanda minus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-06 | Istilah "Retur langsung" (AR) menggantikan "belum dialokasikan"; data check AR_UNALLOC diganti AR_PAYMENT_UNALLOC dan DIRECT_RETURN_OPEN (level info baru); teks pendamping Retur langsung di kartu Payables/Receivables; hasil agregat directReturns/directReturnCount (bagian 3, 5.3.3, 8.7, 8.8, 8.11; D52, KF-63, KF-65).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-07 | Phase 3 Payment Plan AP: kredit vendor (retur, memo, kelebihan bayar) mengurangi tagihan jatuh tempo terawal dalam vendor dan entitas yang sama (aturan kolam D53); baris kredit negatif tampil di tabel tagihan dan drill-down hari; companion hint creditsApplied di kartu Total planned outflows; KF-64, KF-66, KF-67, O20.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-07 | Payment Plan AP: pembacaan tagihan pasangan berkredit tanpa filter entitas memakai satu pemindaian kunci utama (query C2, bagian 8.9.2), 5,6 detik menjadi 0,4 detik pada data demo; teks query C1 dan C2 disamakan dengan kode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-07 | Phase 4 Payment Plan AR: proyeksi penerimaan piutang dikurangi kredit pelanggan (retur langsung dan memo kredit) pada faktur yang jatuh tempo dari hari ini sampai akhir horizon, dengan Notice info di halaman Payment Plan (bagian 8.9.2 query C3, 8.9.3, 8.9.4, 8.9.5; D54, KF-68).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-07 | Pemeriksaan periode tertutup lama membaca hitungan jurnal banyak periode dengan satu query per tabel GL (glPeriodStatsOfTable, bagian 5.6 B6); angka tidak berubah.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-08 | Refactor pembangun query (creditableBillsQuery memakai objek opsi; query unallocated dipindah ke unallocated-sql.ts); SQL dan angka tidak berubah.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 14.1 Riwayat ringkas dokumen yang digantikan

Riwayat berikut disalin ringkas dari catatan perubahan dokumen lama supaya jejaknya tidak hilang.

**Halaman Summary (`summary-page.md`, `summary-queries.md`), 2026-10-30 s.d. 2026-11-05:**

- 2026-10-30: dokumen dibuat dari pembacaan kode; contoh kasus Cash Position; rencana gelombang 2 (filter `canceled_date` opsional, register dana pencairan untuk tanggal lampau, margin rasio desimal, giro beredar, tab tagihan jatuh tempo dan terlambat, overdue kotor, ambang umur transit, istilah Pengakuan Biaya; D31–D38); fitur OCI dinonaktifkan (D39); kartu Revenue by Entity (D40); struktur halaman dipisah ke komponen.
- 2026-10-31: keterangan entitas pada tabel tagihan (D41); tabel tagihan dipercepat.
- 2026-11-03: donut Composition: tab Expense = HPP + Beban Operasional, tab Fixed Cost, irisan negatif tidak digambar (D42); penataan folder `src` (hanya lokasi berkas).
- 2026-11-04: fase 1A, 1B, dan 2 (D43–D45); default `METRIC_STALE_SECONDS` dari 600 ke 180 detik.
- 2026-11-05: fase 4 (D47), 5 (D48), perapian mesin refresh periode (D49), fase 6 (D50).

**Halaman Revenue (`revenue-page.md`, `revenue-queries.md`), 2026-11-04:**

- Dokumen dibuat dari pembacaan kode; fase 1A (sidik jari periode) dan fase 2 (SWR); default `METRIC_STALE_SECONDS` 180 detik.
