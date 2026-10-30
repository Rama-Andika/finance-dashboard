# Model Data & Rumus Metrik — Finance Dashboard

> Status: **draft untuk review** · 28 Oktober 2026
> Dokumen pendamping: [`decisions.md`](./decisions.md) · [`plans/README.md`](../plans/README.md)

Dokumen ini menjelaskan:
1. Konsep akuntansi dasar yang dipakai (dengan bahasa sederhana)
2. Tabel ERP yang dibaca dashboard (dan ditiru DB lokal dalam versi ramping)
3. Arti kode-kode di dalam tabel
4. Aturan umum: jurnal mana yang dihitung, cara memisah per entitas, pohon CoA
5. Settings › Account Mapping
6. **Rumus setiap metrik**
7. Script seed DB lokal (data dummy)
8. Daftar unit test wajib
9. Arsitektur akses database, keamanan & login

> 🔒 Dokumen ini sengaja **tidak** memuat nomor rekening, nomor pinjaman, nama pemegang saham, atau nama perusahaan klien. Contoh nama akun yang dipakai bersifat generik.

---

## 1. Konsep Dasar

### 1.1 Debit & Kredit

Setiap transaksi dicatat **minimal dua baris**: dari mana dan ke mana. **Total debit selalu = total kredit.**

| Jenis akun | Bertambah di… | Contoh |
|---|---|---|
| Harta (aset) | **Debit** | Kas, Bank, Piutang, Persediaan |
| Beban | **Debit** | Gaji, Sewa, HPP |
| Utang | **Kredit** | Hutang usaha, Hutang bank |
| Modal | **Kredit** | Modal disetor, Laba ditahan |
| Pendapatan | **Kredit** | Penjualan |

> Jembatan keledai: **"Harta & Biaya → Debit. Utang, Modal & Pendapatan → Kredit."**

Contoh jual tunai Rp100:

| Akun | Debit | Kredit |
|---|---|---|
| Kas | 100 | |
| Pendapatan Penjualan | | 100 |

### 1.2 Flow ("video") vs Snapshot ("foto")

| Jenis | Arti | Metrik | Arti filter periode |
|---|---|---|---|
| **Flow** | Yang terjadi *selama* periode | Revenue, P&L, Cash Flow, Expense Paid, Fixed Cost, Budget vs Actual | Jumlah dari tanggal awal s.d. tanggal akhir |
| **Snapshot** | Kondisi *pada satu tanggal* | Cash Position, Dana pencairan, Outstanding Liability, AR Aging, rasio | Kondisi **per tanggal akhir** periode |

> **Tanggal akhir** (`asOf`) = akhir preset, tetapi **tidak boleh melewati hari ini**. Contoh: preset "Bulan ini" pada 28 Okt → `asOf` = 28 Okt.

### 1.3 Accrual vs Kas

Jualan kredit tgl 5 Okt, dibayar 20 Nov:
- **P&L** mencatat pendapatan di **Oktober** (saat invoice terbit).
- **Cash Flow** mencatat uang masuk di **November** (saat uang benar-benar masuk).

Jadi wajar kalau "untung tapi kas tipis". Dashboard menampilkan tooltip penjelas untuk ini.

---

## 2. Tabel yang Dibaca Dashboard

Dashboard membaca tabel ERP asli lewat server function (Drizzle). DB lokal untuk development memakai **nama tabel & kolom yang sama**, tetapi hanya kolom di bawah ini yang dibuat dan diisi script seed.

### 2.1 Diagram relasi

```
pos_location ◄── segment_detail ◄── gl_detail.segment1_id
   (entitas)        (nilai segmen)        │
                                          ├── gl_id ──► gl (kepala jurnal)
                                          └── coa_id ─► coa ◄── coa.acc_ref_id (induk, pohon)

coa ◄── coa_opening_balance (saldo awal per periode)
coa ◄── cash_flow_setup ──► cash_flow_group (OPERATING/INVESTING/FUNDING)
coa ◄── coa_budget (anggaran per bulan)

ap_ar_card (tagihan & pembayaran AP/AR) ◄── ap_ar_card_detail (alokasi bayar → invoice)
   ├── owner_id ─► vendor (AP) / customer (AR)
   ├── location_id ─► pos_location
   └── gl_id ─► gl

periode (status open/closed) · company (profil & tahun buku)
system_main (baris DASHBOARD_ACCOUNT_MAPPING) → keranjang akun Settings
sysuser → login dashboard
```

### 2.2 Daftar tabel & kolom

#### `company` — profil perusahaan (1 baris)
| Kolom | Dipakai untuk |
|---|---|
| `company_id`, `name` | Judul laporan |
| `fiscal_year`, `end_fiscal_month` | Batas tahun buku (Jan–Des) |
| `booking_currency_id` | Mata uang dasar (IDR) |

#### `pos_location` — **entitas**
| Kolom | Dipakai untuk |
|---|---|
| `location_id` | ID entitas |
| `code`, `name` | Tampilan & token URL (kode pendek) |
| `is_active`, `inactive_date` | Entitas nonaktif tetap bisa dipilih untuk periode lampau |
| `ref_id`, `loc_level` | (Cadangan) hierarki entitas → outlet bila nanti dibutuhkan |

#### `segment` & `segment_detail` — jembatan jurnal → entitas
| Tabel.Kolom | Isi |
|---|---|
| `segment.column_name` | `segment1_id` = **"Lokasi"**, `segment2_id` = "Business Type" |
| `segment.count` | Nomor urut segmen. ERP memilih segmen entitas dengan **`count = 1`** (bukan nama kolom yang di-hardcode) → dashboard melakukan hal yang sama |
| `segment_detail.ref_id` | Untuk segmen ke-2 dst.: menunjuk `segment_detail` induknya (Business Type berada di bawah Lokasi) |
| `segment_detail.segment_detail_id` | Nilai yang tersimpan di `gl_detail.segment1_id` |
| `segment_detail.location_id` | → `pos_location.location_id` |

#### `periode`
| Kolom | Dipakai untuk |
|---|---|
| `periode_id`, `name`, `start_date`, `end_date` | Periode bulanan |
| `status` | `'Open'` · `'Pre Closed'` · `'Closed'` (teks). `Closed` = sudah tutup buku → angkanya **tidak berubah lagi** (boleh di-cache) |
| `type` | `0` reguler · `1` **Periode 13** (periode penyesuaian akhir tahun/audit) · `2` pre-closed · `3` (ada 1 baris di DB `demo`, arti belum diketahui) |
| `table_name` | Tabel GL tempat jurnal periode ini disimpan: `gl` (aktif) atau arsip `gl_2015` … `gl_2020` (+ `gl_detail_20xx`). Dashboard **wajib** membaca tabel sesuai kolom ini (seperti `SessGeneratePNL`). DB `demo`: semua periode = `gl` |

> Periode dibuat jauh ke depan (DB `demo` sudah punya periode s.d. Nov 2026). Jangan menganggap periode terakhir = bulan berjalan; pakai tanggal hari ini.

#### `coa` — daftar akun (pohon)
| Kolom | Dipakai untuk |
|---|---|
| `coa_id` | ID akun (kunci penyimpanan Settings) |
| `acc_ref_id` | **Induk** (`0` = akar) |
| `code`, `name` | Tampilan; `code` untuk urutan |
| `status` | `HEADER` (folder) / `POSTABLE` (akun daun, menerima jurnal) |
| `level` | Kedalaman di pohon (akar = 1). **Terverifikasi = kedalaman nyata** (630/630 akun di DB `demo`); menentukan kolom `coa_level{level}_id` yang dipakai untuk menjumlah HEADER |
| `account_group` | Penggolongan laporan (lihat §3.5) |
| `sub_account_group` | Sub-golongan; `Cash` dipakai sebagai default Settings |
| `saldo_normal` | `DEBET` / `CREDIT` (lihat catatan §4.4) |
| `account_level` | `Ledger` / `Sub Ledger` (info) |

#### `coa_opening_balance_location` — saldo awal **per periode, per akun, per lokasi**
| Kolom | Dipakai untuk |
|---|---|
| `periode_id`, `coa_id`, `segment1_id` | Kunci: periode × akun × lokasi |
| `opening_balance` | Saldo awal akun pada **awal periode itu**, bertanda sesuai sisi `account_group` (disimpulkan dari cara Neraca ERP langsung menjumlahkannya dengan mutasi bertanda grup) |
| `coa_level1_id` … `coa_level7_id` | Leluhur akun (ber-index) → menjumlah HEADER tanpa rekursi |

> Inilah sumber saldo awal yang dipakai laporan **Neraca** ERP (`neracabysegment.jsp`). Diisi saat proses tutup buku, untuk setiap periode (DB `demo`: 47 periode × 96 lokasi). Tabel lama `coa_opening_balance` (tanpa lokasi) **tidak dipakai**.

#### ~~`department`~~ — **tidak dipakai** (info user)
Tabel `department` dan semua kolom `department_id` (`gl_detail`, `coa_budget`, `acc_link`) diabaikan. Dashboard **tidak** punya dimensi/breakdown departemen; rincian biaya memakai **pohon CoA** (folder akun) dan **entitas/lokasi** (decisions.md D9).

#### `gl` — kepala jurnal
| Kolom | Dipakai untuk |
|---|---|
| `gl_id` | ID jurnal |
| `journal_number`, `ref_number`, `memo` | Tampilan di side sheet |
| `trans_date` | **Tanggal transaksi** (tanggal yang dipakai semua metrik) |
| `period_id` | Periode akuntansi |
| `journal_type` | Sumber jurnal (lihat §3.4) |
| `posted_status` | Hanya yang sudah diposting yang dihitung |
| `canceled_date` | Jurnal batal **tidak dihitung**. Kolom ini tidak ada di semua versi ERP: filternya dipasang hanya bila kolom itu ada di tabel `gl` (D31) |
| `is_reversal`, `ref_journal_number` | Penanda jurnal pembalik (info) |

#### `gl_detail` — baris debit/kredit
| Kolom | Dipakai untuk |
|---|---|
| `gl_detail_id`, `gl_id` | Relasi ke kepala jurnal |
| `coa_id` | Akun |
| `debet`, `credit` | Nominal (**sudah IDR**) |
| `segment1_id` | **Lokasi → entitas** |
| `coa_level1_id` … `coa_level7_id` | Leluhur akun baris ini per tingkat (ber-index). Total HEADER ber-`level` L = `WHERE coa_level{L}_id = header.coa_id` — cara yang dipakai Neraca ERP |
| `customer_id` | Info lawan transaksi |
| `memo` | Keterangan baris |
| `foreign_currency_id`, `foreign_currency_amount`, `booked_rate` | Info valas (tidak dipakai untuk total) |

#### `ap_ar_card` — kartu utang & piutang (tagihan **dan** pembayaran)

> Dipelajari langsung dari DB `demo` (MariaDB 10.4, ±1,9 juta baris, data Des 2021 – Okt 2025). Detail temuan: §3.1, §4.7, §6.6.

Satu tabel berisi **dua peran**:
- **Item** = sesuatu yang punya saldo (tagihan, retur, memo).
- **Kartu pelunasan** = pembayaran/penyesuaian yang "memakan" item lewat `ap_ar_card_detail`.

| Kolom | Tipe | Dipakai untuk |
|---|---|---|
| `ap_ar_card_id` | BIGINT (PK) | ID (string di JS) |
| `module_type` | INT | `0` = AP (utang), `1` = AR (piutang) |
| `transaction_type` | INT | Jenis dokumen (§3.1) |
| `in_out` | INT | `1` menambah saldo · `-1` mengurangi · `0` penanda bernilai 0 (abaikan) |
| `amount` | DECIMAL(22,2) | Nominal, **selalu positif** (arah dari `in_out`) |
| `transaction_date` | **DATETIME** | Tanggal dokumen (pakai `DATE()` untuk perbandingan tanggal) |
| `due_date` | DATE | **Jatuh tempo** (aging & payment plan); kosong pada pembayaran AR |
| `owner_id` | BIGINT | `vendor.vendor_id` (AP) / `customer.customer_id` (AR) |
| `location_id` | BIGINT | **Entitas** (`pos_location`), selalu terisi |
| `transaction_number`, `invoice_number` | VARCHAR | Tampilan & pencarian |
| `payment_status` | INT | `0` belum · `1` sebagian · `2` lunas — **status saat ini**, diisi juga pada kartu pelunasan |
| `coa_id`, `gl_id` | BIGINT | Akun kontrol & jurnal. ⚠️ `gl_id = 0` pada mayoritas tagihan dagang (lihat §4.7) |

Index yang ada: `owner_id`, `transaction_type`, `coa_id`, `transaction_date`, `due_date`, `gl_id`, `transaction_number`, `transaction_id`. **Tidak ada** index `module_type` / `location_id` (lihat decisions.md O11). Charset tabel `latin1`.

#### `ap_ar_card_detail` — alokasi pelunasan ke item
| Kolom | Dipakai untuk |
|---|---|
| `ap_ar_card_id` | **Kartu pelunasan** pemilik baris (mis. 1 pembayaran multi ≈ 43 baris detail) |
| `invoice_id` | `ap_ar_card_id` dari **item** yang dilunasi/dikurangi |
| `amount` | Nominal alokasi, **bertanda berlawanan** dengan `in_out` item: melunasi tagihan (`+1`) → negatif; memakai retur/memo kredit (`-1`) → positif |

**Aturan yang terbukti di data:**
```
Σ detail.amount (per kartu pelunasan)   = kartu.amount × kartu.in_out
sisa(item)                              = item.amount × item.in_out + Σ detail.amount (detail.invoice_id = item)
```
Contoh: tagihan Rp100 (`in_out=1`) + retur Rp20 (`in_out=-1`) dibayar sekaligus Rp80 → detail: −100 (ke tagihan), +20 (ke retur); kartu bayar `amount=80, in_out=-1` → Σ detail = −80 ✔️

> ⚠️ **`payment_status` tidak bisa dipercaya sebagai "sudah dibayar".** ERP mengisinya `2` (lunas) **begitu tagihan dimasukkan ke voucher pembayaran** (`bankpo_payment` type 0), sebelum uangnya benar-benar keluar. Satu-satunya bukti pembayaran adalah `ap_ar_card_detail` dari kartu pelunasan (type 7/8/9/10) — sama dengan rumus ERP sendiri (`DbApArCard.getInvoiceAdjAndPayment`).

#### `bank_payment` & `bank_payment_history` — register transaksi bank (terutama pencairan kartu/QRIS)

> Dipelajari dari `DbBankPayment.java` dan DB `demo` (±3,2 juta baris). Halaman ERP terkait: `fin/transactionact/cardrelease.jsp`, `bankpayment_release.jsp`, `freport/outstanding_list.jsp`.

**Satu baris = satu transaksi bank yang menunggu/selesai dicairkan.** Di DB `demo` hampir seluruhnya **type 1**: setiap pembayaran **non-tunai di kasir/POS** (kartu kredit/debit, QRIS, GoPay/Grab, voucher) dicatat di sini sebagai piutang ke bank/penyedia pembayaran, lalu ditandai lunas saat dananya masuk rekening.

| Kolom | Isi |
|---|---|
| `type` | `1` kartu kredit (dipakai untuk **semua** pembayaran non-tunai POS) · `2` kartu debit · `0/3/4/7` Bank Payment PO (biasa/grup/cek/e-banking) · `5/6/8` Bank Payment Non-PO (biasa/cek/e-banking) · `9` lain · `10` voucher. DB `demo`: type 1 = 3,44 juta baris, type 0 = 1 baris, lainnya tidak ada |
| `status` | `0` **belum cair** · `1` sudah cair |
| `coa_id` | Akun piutang **channel** (1132 EDC kartu, 1138 QRIS/Grab/voucher) — sama dengan keranjang **Dana dalam pencairan** |
| `coa_payment_id` | Akun bank tujuan pencairan |
| `amount` | Nilai transaksi (bruto) |
| `transaction_date` | Tanggal transaksi di kasir |
| `payment_date` | **Tanggal dana benar-benar cair** (status 1) |
| `due_date` | Selalu sama dengan `transaction_date` di DB `demo` → **tidak** dipakai untuk estimasi |
| `segment1_id` | Lokasi/entitas (selalu terisi; 68 lokasi pada data belum cair) |
| `merchant_id`, `payment_method_id`, `bank_id` | Info channel |
| `piutang`, `expense`, `persen_expense`, `persen_discount` | Rincian bersih & biaya MDR — ⚠️ **kosong sejak ±Sep 2025** → tidak dipakai |
| `bank_payment_history.bank_payment_id` (UNIQUE), `gl_id`, `date` | Satu baris per transaksi yang sudah cair: **jurnal pencairan** (Bank ← Piutang channel) & tanggal posting jurnal |

**Pola di DB `demo`** (transaksi sejak Jul 2025): dana cair rata-rata **±1 hari** setelah transaksi (kartu kredit Mandiri/BRI/BCA 1,0–1,2 hari; QRIS 0,9–1,0; Grab 1,0; BPD ±2,8; voucher 0). Data belum cair (status 0): 9.980 transaksi Okt 2025 (±Rp1,76 M) + 9 baris janggal (§4.7 Q9).

**Dipakai dashboard untuk:**
- Rincian **Dana dalam proses pencairan** per channel, lokasi, dan tanggal transaksi (§6.2), termasuk **umur** dana yang belum cair.
- **Estimasi tanggal cair** per channel untuk Daily Payment Plan (§6.9).
- Type keluar (Bank Payment PO/Non-PO, cek, e-banking) dengan status 0 **tidak dipakai di DB `demo`**; bila klien lain memakainya, bisa menjadi sumber "pembayaran bank yang sudah dijadwalkan" — dicek ulang saat itu.

#### `bankpo_payment` & `bankpo_payment_detail` — alur pembayaran AP (Bank Payment PO)

Alur di ERP (`DbBankpoPayment.java`) dan di DB `demo`:

```
Tagihan AP (ap_ar_card)
   │  1. dimasukkan ke VOUCHER  → bankpo_payment type 0 "Pengakuan Biaya"
   │       status: Not Posted (draft) → Posted (disetujui, menunggu bayar)
   │       ⚠️ di titik ini payment_status tagihan sudah diisi 2
   │  2. uang keluar            → bankpo_payment type 1 "Pembayaran Bank" (ref_id → voucher), status Paid
   │       (atau type 3 "Pembayaran Direct" tanpa voucher)
   │  3. saat diposting         → ERP membuat kartu ap_ar_card type 10 + ap_ar_card_detail
   ▼     voucher type 0 berubah menjadi Partialy Paid / Paid
```

| Tabel.Kolom | Isi |
|---|---|
| `bankpo_payment.type` | `0` **Pengakuan Biaya** (di dokumen ini juga disebut "voucher"; dibuat lewat menu Seleksi Invoice) · `1` Pembayaran Bank · `2` Non-trade · `3` Pembayaran langsung. Nama konstanta di ERP: `TYPE_PENGAKUAN_BIAYA`, `TYPE_PEMBAYARAN_BANK`, `TYPE_NON_TRADE`, `TYPE_PEMBAYARAN_DIRECT` |
| `bankpo_payment.status` | `Not Posted` · `Posted` · `Partialy Paid` · `Paid` |
| `bankpo_payment.ref_id` | Pada type 1: voucher type 0 yang dibayar |
| `bankpo_payment.trans_date`, `date` | Tanggal dokumen |
| `bankpo_payment_detail.invoice_id` | → `ap_ar_card.ap_ar_card_id` (tagihan) |
| `bankpo_payment_detail.payment_by_inv_currency_amount` | Nominal yang diajukan/dibayar untuk tagihan itu |

**Dipakai dashboard untuk:**
- ❌ **Bukan** untuk menghitung sisa utang — pembayaran yang sudah terjadi pasti juga tercatat di `ap_ar_card_detail` (DB `demo`, Agu 2025: 76.003 tagihan ada di kedua sumber, 75.551 nominalnya identik → **menjumlah keduanya = hitung ganda**).
- ✅ **Status rencana bayar** di Daily Payment Plan & Outstanding (§6.6, §6.9): tagihan yang masih punya sisa dan berada di voucher type 0 `Not Posted` = **"Diajukan"**, `Posted` = **"Disetujui, menunggu bayar"**.

#### `vendor`, `customer`
| Kolom | Dipakai untuk |
|---|---|
| `vendor_id`/`customer_id`, `code`, `name` | Tampilan & breakdown |
| `due_date`/`jatuh_tempo` (default termin) | Script seed (termin tagihan dummy) |

#### `cash_flow_group` & `cash_flow_setup`
| Tabel.Kolom | Isi |
|---|---|
| `cash_flow_group.NAME`, `description`, `sequence` | `OPERATING` (Operasional), `INVESTING` (Investasi), `FUNDING` (Pendanaan) |
| `cash_flow_setup.sub_group`, `sequence_sub_group` | Sub-baris laporan, mis. "Penerimaan dari pelanggan", "Pembayaran dari supplier", "Pembelian asset" (10 baris di DB `demo`) |
| `cash_flow_setup.coa_id` | Akun **wakil**: ERP tidak memakai akunnya langsung, tetapi **`account_group` + `sub_account_group`** akun itu (`DbCashFlowSetup.cashFlow()`) — semua akun lawan dengan pasangan grup yang sama ikut masuk sub-baris ini |
| `cash_flow_setup.value_displayed` | Arah yang dihitung bila sub-baris hanya punya **satu** baris setup: `1` = Σ **debit** akun lawan (uang keluar, ditampilkan dalam kurung & mengurangi) · `0` = Σ **kredit** akun lawan (uang masuk, menambah). Bila satu sub-baris punya **dua** baris setup (0 dan 1) untuk grup yang sama → dihitung **neto** Σ(kredit − debit) |

**Contoh setup klien** (dikirim user; `coa_id`-nya valid di CoA klien):

| Laci | Sub-baris | Akun wakil → grup | Baris setup |
|---|---|---|---|
| OPERATING | Arus Kas dari Piutang | `113` → Liquid Assets / Account Receivable | 0 + 1 → neto |
| | Pembayaran Kewajiban | `2 Kewajiban` → Current Liabilities / Account Payable | 0 + 1 → neto |
| | Biaya Dibayar Dimuka | `504404772253463511` → *(belum terlihat di sampel CoA; kemungkinan Liquid Assets / Account Receivable Other)* | 0 + 1 → neto |
| | Pendapatan Usaha | `4101` → Revenue / Revenue | 0 + 1 → neto |
| | Pembayaran Biaya Usaha | `6101` → Expense / Expense | 0 + 1 → neto |
| | Pembayaran Bunga dan Administrasi Bank | `8101` → Other Expense / Expense | 0 + 1 → neto |
| | Penerimaan dari Pendapatan Lain-lain | `7101` → Other Revenue / Revenue | 0 + 1 → neto |
| INVESTING | Pembelian Asset | `1211` → Fixed Assets / Fixed Asset | 1 → debit saja |
| | Penjualan Asset | `1211` → Fixed Assets / Fixed Asset | 0 → kredit saja |
| FUNDING | Setoran Modal | `3 Modal` → Equity / Equity | 0 → kredit saja |

**Celah pada setup ini** (dicatat untuk tim finance, decisions.md O13):
- Grup yang **tidak dipetakan** sama sekali: `Liquid Assets / Inventory`, `Long Term Liabilities / Account Payable Other` (leasing, hutang investasi), `Other Assets`, `Cost Of Sales`, serta **debit** `Equity` (dividen, prive).
- **Pinjaman bank** (`2161`/`2162`) ber-grup Current Liabilities / Account Payable → ikut "Pembayaran Kewajiban" (**OPERATING**), bukan FUNDING.

> ⚠️ DB `demo`: `coa_id` di `cash_flow_setup`-nya **tidak ada** di tabel `coa` → di DB itu dashboard memakai aturan cadangan (§6.3).

#### `coa_budget`
| Kolom | Dipakai untuk |
|---|---|
| `coa_id`, `bgt_year`, `amount` | Anggaran per akun per bulan |
| `bgt_month` | ⚠️ **0 – 11 (Januari = 0, Desember = 11)**, mengikuti `Date.getMonth()` Java. Terverifikasi di DB `demo` (2023–2025) |
| `budget_type` | `1` **Accounting** (semua akun P&L — dipakai Budget vs Actual) · `2` **Operasional** (hanya akun Revenue — target operasional) |
| `segment1_id` | Lokasi/entitas — **selalu terisi** di DB `demo` |
| `department_id` | Tidak dipakai (selalu 0 di DB `demo`) |

> `coa_id` yang **tidak ada** di `coa` (3 akun, 2.448 baris di DB `demo`) adalah target KPI khusus (mis. jumlah struk/*basket* per bulan) — diabaikan oleh Budget vs Actual.

#### `balance_gl` — cache Laba Rugi buatan ERP
| Kolom | Isi |
|---|---|
| `period_id`, `coa_id`, `coa_level_1_id` … `coa_level_7_id`, `segment_1_id` …, `amount`, `balance_type` | Ringkasan P&L per periode × akun × lokasi hasil tombol "Generate" (`SessGeneratePNL.generatePNL`, hanya jurnal posted) |

> DB `demo`: ±213 ribu baris, 47 periode. Dashboard **tidak** memakainya sebagai sumber (bisa basi bila jurnal berubah setelah di-generate), tetapi bisa dipakai untuk **cek rekonsiliasi** P&L dengan layar ERP.

#### `system_main` — pengaturan *key-value* ERP (dipakai untuk Settings dashboard)
| Kolom | Dipakai untuk |
|---|---|
| `sysmain_id` | ID baris |
| `name` | Kunci, mis. `DASHBOARD_ACCOUNT_MAPPING` |
| `valueprop` (TEXT) | Isi JSON Settings (§5.2) |
| `valtype`, `groupprop`, `distype`, `company_id` | **Konvensi (dikonfirmasi user):** `groupprop='Application'`, `valtype='STRING'`, `distype=''`, `company_id=0` |
| `name` | Ber-index **UNIQUE** → aman untuk `INSERT … ON DUPLICATE KEY UPDATE` |
| `company_id`, `active`, `note` | Pemilik & status baris |

> `system_main` adalah tabel **System Property** ERP (`DbSystemProperty`). Kunci yang relevan untuk laporan: `CODE_LABA_TAHUN_BERJALAN` (`3100-00-003`), `CODE_LABA_TAHUN_LALU` (`3100-00-002`), `CODE_MODAL` & `CODE_LABA_INDUK_1` (`30000`), `START_DATE_IPO` (bila ada: batas awal daftar periode; tidak ada di DB `demo`).

#### `sysuser` — akun ERP untuk login dashboard
| Kolom | Dipakai untuk |
|---|---|
| `user_id` | ID user (disimpan di session) |
| `login_id` | Username |
| `password` | ⚠️ **Plain text** (legacy) — hanya dibandingkan di server, **tidak pernah** dikirim/di-log (§9.3) |
| `full_name`, `email` | Tampilan profil |
| `user_status` | Hanya user aktif yang boleh login |
| `last_login_date`, `last_login_ip` | **Tidak** diubah dashboard (DB user read-only) |

---

## 3. Arti Kode

### 3.1 `ap_ar_card.transaction_type`

Kolom "Di data" = pemakaian nyata di DB `demo` (Des 2021 – Okt 2025).

**AP (`module_type = 0`)**

| Kode | Arti | Peran | Di data |
|---|---|---|---|
| 0 | Hutang dagang (trade) | **Item** (`in_out=1`; sedikit `-1`) | ±1,89 juta — mayoritas. Termasuk hutang **konsinyasi dari penjualan** (nomor `…/SLS/…`) |
| 1 | Hutang non-dagang | Item | 86 — **hampir tidak dipakai** (biaya non-dagang dibayar langsung, lihat §6.5 b) |
| 2 | Retur | Item kredit (`-1`) | ±62 ribu |
| 3 | Hutang aset | Item (**bukan** biaya operasional) | ±540 |
| 4 | AP memo | Item, dua arah (`+1` / `-1`) | ±88 ribu |
| 5, 6, 11, 12, 13, 14 | BG, sementara, uang muka, memo, AP sales, bank payment | — | **Tidak ada** di data |
| 7 | Incoming adjustment by qty | **Kartu pelunasan** (menyesuaikan tagihan) | ±230 |
| 8 | Incoming adjustment by value | **Kartu pelunasan** | ±12,8 ribu |
| 9 | Payment single | **Kartu pelunasan (bayar)** | 9 — jarang |
| 10 | Payment multi | **Kartu pelunasan (bayar)** — cara bayar utama | ±43,8 ribu (`-1`), 542 (`+1`, retur > tagihan), 5.724 (`0`, bernilai 0) |

**AR (`module_type = 1`)**

| Kode | Arti | Peran | Di data |
|---|---|---|---|
| 0 | Piutang penjualan | Item (`+1`) | ±1.300 |
| 1 | Pembayaran piutang | **Kartu pelunasan** (`due_date` kosong) | ±4.100 |
| 2 | Retur | **Kartu pelunasan** bila punya detail; bila tidak → saldo kredit tersendiri (§6.7 bagian B) | ±70 |
| 3 | Piutang non-dagang | Item (`+1`; sedikit `-1`) | ±6.500 |
| 4 | Delivery order | — | **Tidak ada** di data |
| 5 | AR memo | Item, dua arah | ±830 |

### 3.2 `ap_ar_card.in_out` & `payment_status`

| Kolom | Nilai | Arti |
|---|---|---|
| `in_out` | `1` | Menambah saldo utang/piutang |
| | `-1` | Mengurangi (bayar, retur) |
| | `0` | Penanda bernilai 0 (hanya AP type 10, sejak Okt 2024, 1 vendor) → **abaikan** |
| `payment_status` | `0` / `1` / `2` | Belum / sebagian / lunas (status **saat ini**) |

### 3.3 `coa.status`

| Nilai | Arti |
|---|---|
| `HEADER` | Folder. Tidak menerima jurnal. Saldonya = jumlah saldo seluruh isinya |
| `POSTABLE` | Akun daun. Tempat jurnal dicatat |

### 3.4 `gl.journal_type` (dikelompokkan untuk label drill-down)

| Kelompok | Kode |
|---|---|
| Uang masuk | 0 Cash Receive, 3 Bank Deposit, 15 Pelunasan Tunai, 24 Credit Payment, 30 Giro Masuk, 41 AR Payment, 42 AR Bank Payment |
| Uang keluar | 1 Petty Cash Payment, 2 Petty Cash Replenishment, 4 Bank Payment PO, 5 Bank Payment Non-PO, 16 Kasbon, 22 Bank Payment, 28 Pemakaian Kasbon, 31 Giro Keluar, 36 Bank Payment Group |
| Penjualan & piutang | 8 Invoice, 9 Sales, 23 Retur, 25 AR Memo, 32 Piutang Card, 55 Delivery Order, 56 AR Non Trade |
| Pembelian & utang | 6 Purchase Order, 21 AP Memo, 37 AP Clearance, 39 Non Trade, 40 Non Trade Clearance, 43 Retur Clearance, 57 Down Payment |
| Pinjaman | 11 Pinjaman Koperasi, 12 Pinjaman Bank, 13 Bayar Pinjaman Koperasi, 14 Bayar Pinjaman Bank |
| Aset tetap | 44 Fixed Asset, 45 Incoming Fixed Asset, 49 Disposal, 50 Sales Asset, 51 Adjustment Asset |
| Penyesuaian non-kas | 7 General Ledger, 10 Akrual, 17 Auto Reverse (kurs), 18 Backdated, 19 Adjustment, 20 Costing (HPP), 26 Reverse, 27 Copy, 29 Repack, 33 Selisih Kasir, 34 General Affair, 35 Cash Back, 38 Advance Reverse, 46 Adjustment Value, 47 Depresiasi, 48 Amortisasi |
| Bank sampah | 52, 53, 54 |

> `journal_type` hanya untuk **label & breakdown**. Penggolongan Cash Flow tetap memakai `cash_flow_setup` (§6.3).

### 3.5 `coa.account_group`

| Laporan | `account_group` | Sisi bertambah |
|---|---|---|
| Neraca – Harta | Liquid Assets, Fixed Assets, Other Assets | Debit |
| Neraca – Utang | Current Liabilities, Long Term Liabilities | Kredit |
| Neraca – Modal | Equity | Kredit |
| P&L | Revenue, Other Revenue | Kredit |
| P&L | Cost Of Sales, Expense, Other Expense | Debit |

> `coa.account_class` (selalu 0) dan `coa.type` (kosong) **tidak dipakai**.

---

## 4. Aturan Umum

### 4.1 Jurnal yang dihitung

```
gl.posted_status = 1          -- POSTED (konstanta DbGl.POSTED = 1; NOT_POSTED = 0) ✔️ terkonfirmasi dari kode ERP
AND gl.canceled_date IS NULL  -- pengaman; hanya bila tabel gl punya kolom ini (D31); di DB demo tidak ada jurnal yang terisi canceled_date
```

- Laporan resmi ERP (Neraca, Laba Rugi, Buku Besar mode "POSTED") **hanya** memfilter `posted_status = 1`. Di DB `demo`: 1,48 juta jurnal posted, 145 draft, 0 batal, 0 reversal.
- **Jurnal pembalik** (`journal_type` 26/17, `is_reversal`) **ikut dihitung** bersama jurnal aslinya → keduanya saling meniadakan. **Jangan membuang salah satunya saja.**
- Mode "ALL/NOT POSTED" di Buku Besar ERP juga menampilkan **dokumen sumber yang belum dijurnal** (`cash_receive`, `pettycash_payment`, `bank_deposit`, `bankpo_payment`, `banknonpo_payment` dengan `posted_status = 0`). Dashboard **tidak** menghitungnya, tetapi bisa menampilkan indikator "N dokumen belum diposting" agar pengguna tahu angka belum final.
- Data tahun lama ada di tabel arsip `gl_20XX` / `gl_detail_20XX` → backend asli perlu `UNION`. Di prototype tidak relevan.

### 4.2 Filter entitas

```
gl_detail.segment1_id → segment_detail.location_id ∈ {entitas terpilih}
```

- **Konsolidasi** = menjumlahkan semua baris dari entitas terpilih. **Tanpa eliminasi.**
- Baris `gl_detail` tanpa `segment1_id` → masuk entitas khusus **"Tanpa lokasi"** (muncul di daftar entitas bila ada).
- ⚠️ Segment Lokasi bertipe **NBAL** (*non-balancing*): sistem tidak memaksa jurnal seimbang per lokasi. Untuk **P&L per entitas** aman; untuk **saldo kas/utang per entitas** bisa janggal di data asli (contoh: tagihan Anak A dibayar dari rekening kantor pusat). Data dummy dibuat seimbang per lokasi.

### 4.3 Pohon CoA

1. Induk = `acc_ref_id` (`0` = akar). **Kode akun tidak dijadikan patokan struktur** — pola kodenya tidak beraturan (contoh: folder Bank langsung di bawah "1 Harta" tanpa folder "112"; folder Piutang & Persediaan berdiri sebagai akar sendiri). `level` **konsisten** dengan kedalaman pohon (terverifikasi di DB `demo`) dan dipakai untuk menjumlah (poin 5).
2. Anak diurutkan berdasarkan `code`.
3. `acc_ref_id` menunjuk akun yang tidak ada → taruh di folder virtual **"⚠️ Akun tanpa induk"**.
4. Deteksi **siklus** (A→B→A) → putus & tandai.
5. Saldo HEADER = Σ saldo POSTABLE di bawahnya. Jurnal hanya ada di POSTABLE. Di SQL tidak perlu rekursi: pakai kolom leluhur yang sudah tersimpan, `gl_detail.coa_level{L}_id = header.coa_id` (L = `header.level`), sama seperti Neraca ERP.

```ts
type CoaNode = {
  coaId: string; parentId: string | null; code: string; name: string;
  status: 'HEADER' | 'POSTABLE'; accountGroup: AccountGroup;
  subAccountGroup: string; saldoNormal: 'DEBET' | 'CREDIT';
  children: CoaNode[]; isOrphan?: boolean;
}
```

### 4.4 Tanda (+/−) saldo

Di data asli ada akun **lawan** (*contra*) yang `saldo_normal`-nya tidak konsisten — contoh: akun **Akumulasi Penyusutan** tercatat `DEBET` padahal sifatnya mengurangi aset; **Cadangan Piutang Ragu-ragu** `CREDIT` di dalam grup Liquid Assets.

**Aturan:** tanda dihitung berdasarkan **sisi alami `account_group`** (§3.5), **bukan** `saldo_normal` per akun.

```
sisiDebit(account_group)  → nilai = Σ debet − Σ credit
sisiKredit(account_group) → nilai = Σ credit − Σ debet
```

Dengan aturan ini, akun lawan otomatis bernilai negatif dan mengurangi total grupnya. ✔️

### 4.5 Saldo per tanggal (snapshot) — mengikuti algoritma ERP

**Akhir periode** (dipakai Neraca ERP, `neracabysegment.jsp`):
```
saldo(akun, akhir periode P) = coa_opening_balance_location(P, akun, lokasi)
                             + Σ mutasi posted dengan gl.period_id = P
```

**Tanggal sembarang** `asOf` (dipakai Buku Besar ERP, `DbGlDetail.getGLOpeningBalanceLocation`):
```
C  = periode berstatus 'Closed' terakhir yang berakhir sebelum asOf
P* = periode pertama setelah C
saldo(akun, asOf) = coa_opening_balance_location(P*, akun, lokasi)
                  + Σ mutasi posted dengan trans_date ∈ (akhir C, asOf]
```
> Catatan: versi ERP untuk bagian mutasi ini **tidak** memfilter `posted_status`; dashboard **memfilter** `posted_status = 1` supaya konsisten dengan Neraca.

- "mutasi" bertanda sesuai sisi `account_group` (§4.4) — sama persis dengan ERP.
- **Laba tahun berjalan** di Neraca ERP: akun `CODE_LABA_TAHUN_BERJALAN` (dan induknya `CODE_LABA_INDUK_*`, `CODE_MODAL`) ditambah *(Σ pendapatan − Σ beban)* periode itu, karena laba belum dipindahkan ke modal sampai tutup tahun.

**Cara ketiga — Neraca Saldo / Trial Balance ERP** (`tb_report.jsp` → `SessTbReport`): per akun ditampilkan *saldo awal · mutasi debit · mutasi kredit · saldo akhir*, dengan
```
saldo awal = Σ mutasi posted dengan trans_date < awal periode   (seluruh riwayat, tanpa tabel saldo awal)
mutasi     = Σ debit / Σ kredit posted dengan gl.period_id = periode
```

**Verifikasi di DB `demo` (periode Juni 2025, semua lokasi):**

| Akun | Tabel `coa_opening_balance_location` | Σ GL sebelum periode | Σ GL tahun berjalan (Jan–Mei) |
|---|---|---|---|
| Kas Penjualan Tunai (Liquid Assets) | 1.797.700.383 | 1.797.700.383 ✔️ sama persis | — |
| Pendapatan FOOD (Revenue) | 530.202.454.761 | 581.760.274.562 ❌ | 111.579.082.732 ❌ |
| Gaji (Expense) | 16.375.444.228 | 17.898.314.220 ❌ | 3.507.962.135 ❌ |

→ Untuk **akun neraca**, tabel saldo awal dan Σ GL **cocok** — dashboard memakai tabel saldo awal (lebih cepat) dan metode Σ GL sebagai **cek rekonsiliasi / cadangan** bila periode belum punya baris saldo awal.
→ Untuk **akun P&L**, saldo awal di tabel **tidak bisa dipakai** — P&L selalu dihitung dari mutasi periode (§6.4).

### 4.6 Periode akuntansi vs tanggal transaksi

| Kebutuhan | Kunci waktu | Alasan |
|---|---|---|
| Angka **bulanan** (P&L, Cash Flow, Budget vs Actual, Fixed Cost, Neraca) | **`gl.period_id`** | Sama dengan laporan resmi ERP; jurnal backdated (`journal_type 18`) & **Periode 13** masuk ke periode akuntansinya |
| Angka **harian/rentang hari** (tren harian, MTD, Payment Plan, drill-down transaksi) | **`gl.trans_date`** | Granularitas hari |

- Preset "Bulan ini/Bulan lalu/Kuartal/YTD/12 bulan" diterjemahkan menjadi **daftar `period_id`** (tipe reguler). **Periode 13** ikut dihitung pada YTD/12 bulan bila jatuh dalam rentang, dan bisa disaring dengan toggle "Termasuk penyesuaian akhir tahun".
- ⚡ **Performa:** `gl` ±1,48 juta & `gl_detail` ±13,6 juta baris. Query per `period_id` memakai index `gl.period`; jumlah HEADER memakai index `gl_detail.coa_levelN`. Hasil agregat untuk periode **`Closed`** tidak akan berubah → **di-cache** (per periode × lokasi × akun); hanya periode `Open`/`Pre Closed` yang dihitung ulang.

### 4.7 Kualitas data `ap_ar_card` (temuan DB `demo`)

| # | Temuan | Jumlah | Penanganan |
|---|---|---|---|
| Q1 | Item AP berstatus **lunas** (`payment_status=2`) **tanpa** baris pelunasan di `ap_ar_card_detail` | 40.011 item, sisa hitungan ±Rp13,9 M; **22.902 dari Sep 2025**. Mayoritas hutang konsinyasi `…/SLS/…` (±26 ribu), sisanya `IN…`, `APM/…`, `RT…` | ✅ **Terjawab:** item ini berada di **voucher pembayaran** (`bankpo_payment` type 0) yang masih `Not Posted`/`Posted` → uangnya **belum keluar**; ERP sudah mengisi `payment_status = 2` saat voucher dibuat. **Tetap dihitung sebagai utang** (rumus §6.6), diberi label status voucher. Daftar: `schema/ap_lunas_tanpa_pembayaran.csv` |
| Q1b | Tagihan AP **non-dagang** (type 1) lunas tanpa catatan pelunasan di mana pun | 77 item, 2021–2024, tanpa `gl_id` | Kemungkinan dibersihkan lewat jurnal GL *non-trade clearance* (journal_type 39/40). Dihitung sesuai rumus §6.6 (muncul sebagai utang lama) + tampil di panel "Data perlu dicek" |
| Q2 | Tagihan dagang tanpa jurnal (`gl_id = 0`) | ±1,59 juta dari 1,89 juta | `ap_ar_card` diperlakukan sebagai sumber **mandiri** untuk AP; jangan wajibkan join ke `gl` |
| Q3 | `due_date` **sebelum** `transaction_date` | ±5 ribu tagihan dagang | Aging tetap pakai `due_date` apa adanya (langsung terhitung lewat jatuh tempo) |
| Q4 | `in_out = 0` bernilai 0 | 5.724 | Diabaikan |
| Q5 | Nominal negatif | ±24 baris | Dihitung apa adanya (`amount × in_out`) |
| Q6 | Baris rusak (`in_out`/tanggal NULL, `location_id = 0`) | 1 | Dibuang (`WHERE in_out IS NOT NULL AND transaction_date IS NOT NULL`) |
| Q7 | `owner_id` tidak ada di master | 2 vendor, 1 customer | Tampil sebagai "(Vendor tidak dikenal)" |
| Q8 | 87 `location_id` berbeda di AP (1 tidak ada di `pos_location`) | — | **1 lokasi = 1 entitas**; lokasi tak dikenal tampil sebagai "(Lokasi tidak dikenal)" |
| Q9 | `bank_payment` type 1 belum cair yang janggal: 2 baris 2023–2024 (tak pernah cair), 3 baris Jul–Sep 2025, 4 baris bertanggal **di masa depan** (2026) | 9 baris, nilai ±0 | Tetap dihitung; tampil di panel "Data perlu dicek" (dana belum cair > 7 hari / tanggal di masa depan) |

### 4.8 Uang, pembulatan & ID

- Nilai `DECIMAL` dari database dibaca sebagai **teks**, lalu diproses dengan `decimal.js`; pembulatan **hanya** saat ditampilkan.
- Total yang dihitung SQL (`SUM`) juga dibaca sebagai teks — jangan diubah ke `Number` sebelum diformat.
- **Semua ID adalah string.** `coa_id` seperti `504404509311573860` melebihi batas aman `Number` JavaScript (±9×10¹⁵) sehingga digit terakhirnya bisa berubah. Atur `mysql2` dengan `supportBigNumbers: true, bigNumberStrings: true`, dan di Drizzle pakai `bigint({ mode: 'string' })`.

---

## 5. Settings › Account Mapping

### 5.1 Keranjang

| Key | Nama | Dipakai di | Default (klien ini) |
|---|---|---|---|
| `cash` | Kas | Cash Position (angka utama), Cash Flow, Runway, Payment Plan | 📁 111 |
| `bank` | Bank | Cash Position (angka utama), Cash Flow, Runway, Payment Plan | 📁 1121 |
| `deposit` | Deposito | Cash Position (baris terpisah) | 📁 1122 |
| `inTransit` | Dana dalam pencairan | Kartu terpisah; inflow Payment Plan (toggle) | 📁 1132 + akun QRIS/e-wallet/Cash Sales in Transit di 📁 1138 |
| `fixedCost` | Biaya Tetap | Monthly Fixed Cost | 📁 Fixed Cost (Adm & Umum) + 📁 Fixed Cost (Operasional) |

**Default klien baru:** semua akun `sub_account_group = 'Cash'` tercentang di keranjang `cash`; keranjang lain kosong. Banner "Selesaikan pengaturan akun" tampil sampai admin menyimpan.

### 5.2 Format penyimpanan

Disimpan sebagai **satu baris** di `system_main`:

| Kolom | Nilai |
|---|---|
| `name` | `DASHBOARD_ACCOUNT_MAPPING` |
| `groupprop` | `Application` |
| `valtype` | `STRING` (isinya teks JSON) |
| `distype` | `''` (string kosong) |
| `company_id` | `0` |
| `active` | `1` |
| `valueprop` | JSON di bawah ini |

```json
{
  "version": 1,
  "updatedAt": "2026-10-28T10:00:00+08:00",
  "baskets": {
    "cash":      { "include": ["<coa_id HEADER 111>"] },
    "bank":      { "include": ["<coa_id HEADER 1121>"] },
    "deposit":   { "include": ["<coa_id HEADER 1122>"] },
    "inTransit": { "include": ["<coa_id HEADER 1132>", "<coa_id QRIS…>", "…"] },
    "fixedCost": { "include": ["<coa_id HEADER fixed adm>", "<coa_id HEADER fixed ops>"] }
  }
}
```

### 5.3 Cara membaca keranjang (resolver)

```
resolve(keranjang) = untuk setiap coa_id di include:
                       jika HEADER  → semua POSTABLE keturunannya (termasuk akun baru)
                       jika POSTABLE → akun itu sendiri
                     lalu buang duplikat
```

- UI pohon: ☑ penuh = HEADER disimpan (akun baru ikut otomatis). ◐ sebagian = yang disimpan adalah anak-anak yang dicentang (akun baru **tidak** ikut) → tampil keterangan kecil.
- **Validasi sebelum simpan:**
  - Akun yang sama tidak boleh ada di dua keranjang dari kelompok `cash`/`bank`/`deposit`/`inTransit` → tombol Simpan nonaktif + daftar bentrok.
  - Keranjang `cash`+`bank` kosong → peringatan (Cash Position = 0).
  - `coa_id` yang sudah tidak ada di CoA → ditandai "akun dihapus", diabaikan saat hitung.
- **Preview langsung:** daftar akun hasil resolve + saldo per hari ini.

### 5.4 Server function

| Server function | Isi |
|---|---|
| `getAccountMapping()` | Baca baris `system_main`; bila belum ada → default (§5.1) + flag `isDefault` |
| `saveAccountMapping(data)` | Validasi Zod + aturan §5.3 → `INSERT … ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop)` pada `system_main` (`name` UNIQUE; sintaks `VALUES()` kompatibel MySQL 5.7) |
| `getCoaTree({ asOf, entities })` | Pohon CoA + saldo per `asOf` (untuk preview) |

- Semua server function memeriksa **session login** lebih dulu.
- `valueprop` divalidasi ulang saat dibaca (bisa saja diubah manual lewat ERP/DB) → JSON rusak = pakai default + peringatan.
- Setelah simpan berhasil → invalidasi semua query metrik (TanStack Query) / `router.invalidate()`.

---

## 6. Rumus Metrik

> **Implementasi:** setiap rumus diterjemahkan menjadi **query SQL agregat** (Drizzle) di server function — penjumlahan, `GROUP BY` bulan/akun/entitas, dan filter dilakukan di database. JavaScript hanya menyusun hasil akhir (selisih, margin, pohon). Contoh Revenue per bulan:
>
> ```sql
> SELECT DATE_FORMAT(g.trans_date, '%Y-%m') AS bulan,
>        SUM(d.credit - d.debet)            AS revenue
> FROM gl g
> JOIN gl_detail d       ON d.gl_id = g.gl_id
> JOIN coa c             ON c.coa_id = d.coa_id
> JOIN segment_detail sd ON sd.segment_detail_id = d.segment1_id
> WHERE g.posted_status = 1
>   AND g.canceled_date IS NULL
>   AND c.account_group = 'Revenue'
>   AND c.status = 'POSTABLE'
>   AND g.trans_date BETWEEN ? AND ?
>   AND sd.location_id IN (?)
> GROUP BY bulan
> ORDER BY bulan;
> ```

**Notasi**

```
E        = himpunan entitas terpilih
[d1, d2] = periode (d2 = asOf)
L        = baris gl_detail valid (§4.1) dengan entitas ∈ E (§4.2)
mutasi(A, d1, d2) = Σ (debet − credit) baris L dengan coa ∈ A dan trans_date ∈ [d1, d2]
saldo(A, asOf)    = opening + mutasi s.d. asOf (§4.5)
basket(k)         = hasil resolve keranjang k (§5.3)
grup(g)           = semua POSTABLE dengan account_group = g
```

### 6.1 Revenue (flow)

```
Revenue = − mutasi(grup('Revenue'), d1, d2)        -- sisi kredit → dibalik
```

- **Tidak termasuk** Other Revenue (masuk P&L, bukan Revenue utama).
- **Chart:** tren per bulan (bar), komposisi per folder akun (mis. Retail vs Grosir → kategori produk).
- **Drill-down:** Folder pendapatan → akun (kategori produk) → entitas → daftar jurnal.

### 6.2 Cash Position & Dana dalam Pencairan (snapshot)

```
Kas         = saldo(basket('cash'), asOf)
Bank        = saldo(basket('bank'), asOf)
CashPosition = Kas + Bank                         ← angka utama
Deposito    = saldo(basket('deposit'), asOf)      ← baris terpisah, tidak masuk angka utama
DanaTransit = saldo(basket('inTransit'), asOf)    ← kartu terpisah
```

- **Drill-down Cash Position:** Kas/Bank → folder (Kas Besar, Kas Kecil, …) → akun → mutasi.
- **Drill-down Dana Transit:** per channel/akun (QRIS, EDC, GoPay, …) → lokasi → tanggal transaksi → daftar transaksi belum cair, dari `bank_payment` (`type IN (1,2)` dan belum cair pada `asOf`, yaitu `status = 0` ATAU (`status = 1` DAN `payment_date` > `asOf`) (D32), `coa_id ∈ basket('inTransit')`).
- **Umur dana belum cair** (`hari ini − transaction_date`): normalnya 0–2 hari; di atas ambang `IN_TRANSIT_ALERT_DAYS` (bawaan 3 hari, D38) ditandai ⚠️ (kemungkinan belum direkonsiliasi / gagal settlement).
- **Cek rekonsiliasi (info):** saldo GL keranjang `inTransit` ≈ Σ `bank_payment.amount` yang belum cair untuk akun-akun yang sama. Selisih → ⚠️ "GL & register pencairan tidak sinkron" (mis. jurnal pencairan belum diposting).
- **Edge case:** saldo kas **negatif** di satu entitas (efek NBAL) → tampilkan apa adanya + ikon ⓘ.
- **Giro/cek beredar (informasi, tidak masuk angka utama; D35):** pembayaran hutang dengan BG, cek tangguh, atau e-banking mengkredit akun Hutang Giro dan baru mengurangi bank saat dicairkan (`bank_payment.status` 0 → 1 dan jurnal Giro Keluar). Dashboard menjumlahkan `bank_payment.amount` untuk `type IN (0, 4, 7)` yang belum cair pada `asOf` (aturan sama dengan register Dana dalam pencairan) dan menampilkannya sebagai baris tambahan di kartu Cash Position. Pembayaran non-PO (`type` 5, 6, 8) belum dihitung.

> **Referensi ERP:** `web/fin/freport/cashflow_report.jsp`. ERP mengambil setiap jurnal di periode yang menyentuh akun **`Liquid Assets` + `sub_account_group = 'Cash'`**, lalu menjumlahkan **baris lawan** di jurnal itu berdasarkan `account_group` + `sub_account_group` yang dipetakan di `cash_flow_setup` (§2.2). Dashboard memakai **pemetaan yang sama**, dengan dua perbaikan yang disetujui user: **alokasi proporsional ke kas** dan **baris "Belum terklasifikasi"** (decisions.md D27).

**Kas & setara kas** = akun di keranjang `cash` ∪ `bank` ∪ `deposit` (default = `sub_account_group 'Cash'`, sama dengan ERP). Perpindahan antar-akun kas (Kas → Bank, Bank → Deposito) adalah **transfer internal** dan tidak dihitung.

**Langkah 1 — alokasi kas ke akun lawan (proporsional):**
```
untuk setiap jurnal posted (gl.period_id ∈ periode, atau trans_date ∈ [d1, d2] untuk harian)
yang punya ≥ 1 baris akun kas & setara kas pada lokasi terpilih:
  netKas = Σ (debet − credit) baris kas            -- + = uang masuk, − = uang keluar
  lawan  = baris non-kas di jurnal yang sama
  jika lawan kosong → transfer internal, abaikan
  selainnya: porsi(lawan) = netKas × |debet − credit|(lawan) ÷ Σ |debet − credit|(semua lawan)
```
> Contoh jurnal campuran: *Kas 100 + Piutang EDC 50 → Pendapatan 150*. ERP menghitung uang masuk **150** (seluruh baris lawan); dashboard **100** (hanya bagian kas). Akibatnya angka per sub-baris bisa sedikit berbeda dari layar ERP, tetapi `kas awal + arus kas = kas akhir` selalu cocok.

**Langkah 2 — klasifikasi tiap porsi**, memakai `cash_flow_setup` (sumber utama):
```
setup = baris cash_flow_setup yang akun wakilnya punya (account_group, sub_account_group)
        sama dengan akun lawan
jika sub-baris setup punya baris 0 dan 1           → masuk sub-baris itu, apa pun arahnya (neto)
jika hanya baris value_displayed = 1 (arah keluar) → masuk bila porsi < 0 (uang keluar)
jika hanya baris value_displayed = 0 (arah masuk)  → masuk bila porsi > 0 (uang masuk)
selain itu                                         → "Belum terklasifikasi" ⚠️ (di laci OPERATING)
```

- **"Belum terklasifikasi"** tampil sebagai baris tersendiri dengan ikon ⚠️ dan drill-down ke akun lawannya, supaya tim finance tahu pemetaan mana yang perlu dilengkapi. Dengan setup klien saat ini, yang masuk ke sini antara lain: pembelian persediaan tunai, cicilan leasing/hutang investasi, investasi (Other Assets), pembayaran dividen/prive (§2.2 "Celah pada setup ini").
- **Pinjaman bank** mengikuti setup klien (masuk "Pembayaran Kewajiban", OPERATING) supaya konsisten dengan ERP; usulan memindahkannya ke FUNDING dicatat di decisions.md O13.

**Aturan cadangan** — hanya dipakai bila `cash_flow_setup` **kosong atau tidak valid** (seluruh `coa_id`-nya tidak ditemukan di `coa`, seperti DB `demo`). Dicek berurutan; yang pertama cocok dipakai:

| # | Kondisi | Laci | Sub-baris (nama sama dengan `cash_flow_setup`) |
|---|---|---|---|
| 1 | `gl.journal_type ∈ {11, 12, 13, 14}` (pinjaman & cicilannya) | FUNDING | Pinjaman bank/koperasi |
| 2 | `gl.journal_type ∈ {44, 45, 49, 50, 51}` atau lawan `account_group ∈ {Fixed Assets, Other Assets}` | INVESTING | uang keluar → Pembelian asset · uang masuk → Penjualan asset |
| 3 | lawan `account_group = Equity` | FUNDING | uang masuk → Setoran modal · uang keluar → Pengambilan prive / Pembagian dividen (akun dividen `3100-00-007`) |
| 4 | lawan `account_group = Long Term Liabilities` | FUNDING | Pinjaman jangka panjang |
| 5 | lawan `account_group ∈ {Revenue}` atau `sub_account_group = Account Receivable` | OPERATING | Penerimaan dari pelanggan |
| 6 | lawan `sub_account_group ∈ {Account Payable}` (Current Liabilities) atau `Inventory` | OPERATING | Pembayaran ke supplier |
| 7 | lawan `account_group ∈ {Expense, Cost Of Sales}` atau `sub_account_group = Account Receivable Other` | OPERATING | Pembayaran biaya operasional dan karyawan |
| 8 | lawan `account_group = Other Expense` | OPERATING | Pembayaran bunga dan administrasi |
| 9 | lawan `account_group = Other Revenue` | OPERATING | Penerimaan dari jasa giro dan pendapatan lain-lain |
| 10 | lainnya | OPERATING | **Belum terklasifikasi** ⚠️ |

- Dashboard menampilkan label kecil **"Sumber klasifikasi: setup ERP"** atau **"Sumber klasifikasi: aturan bawaan"** supaya jelas mana yang sedang dipakai.
- **Kas awal periode** = saldo kas & setara kas per awal periode (§4.5). ERP menghitungnya dari seluruh GL sebelum tanggal awal (termasuk jurnal draft); dashboard hanya jurnal posted.
- **Cek wajib (unit test):** `Kas awal + NetCashFlow = Kas akhir` — harus **sama persis** dengan saldo kas & setara kas di akhir periode. (ERP tidak mengecek ini: kas akhir ERP = kas awal + arus kas terklasifikasi saja, sehingga bisa meleset bila ada baris yang tidak terpetakan atau jurnal campuran.)
- **Rekonsiliasi dengan ERP (info):** panel kecil menampilkan selisih total per laci antara dashboard dan cara hitung ERP, dengan penjelasan "jurnal campuran" dan "belum terklasifikasi".
- **Chart:** waterfall (kas awal → operasi → investasi → pendanaan → kas akhir) + tren bulanan masuk vs keluar.
- **Drill-down:** laci → sub-baris → akun lawan → jurnal.

### 6.4 Profit & Loss (flow)

```
Revenue          = − mutasi(grup('Revenue'))
COGS             =   mutasi(grup('Cost Of Sales'))
Laba Kotor       = Revenue − COGS
OPEX             =   mutasi(grup('Expense'))
Laba Usaha       = Laba Kotor − OPEX                  ⓘ belum dikurangi depresiasi
OtherRev         = − mutasi(grup('Other Revenue') − OCI)
OtherExp         =   mutasi(grup('Other Expense'))     -- termasuk depresiasi, bunga, pajak
Laba Bersih      = Laba Usaha + OtherRev − OtherExp
OCI              = − mutasi(akun OCI)                  -- klien ini: subtree akun "9"
Total Laba Kompr = Laba Bersih + OCI
```

- Margin % ditampilkan di samping Laba Kotor, Laba Usaha, Laba Bersih (`÷ Revenue`; Revenue = 0 → "—").
- Penanda akun OCI = konfigurasi kode (`PNL_OCI_ROOT_CODES = ['9']`), lihat decisions.md O4.
- **Drill-down:** baris P&L → folder akun → akun → entitas → jurnal.

**Perbandingan dengan laporan Laba Rugi ERP** (ada ±10 versi di menu; dipelajari: `profitloss_segment.jsp`, `profitlosssegment_v02.jsp`, `profitlosssegmentmtd_v01/v02.jsp`, `profitloss_segmentgen.jsp`):

| Aspek | ERP | Dashboard |
|---|---|---|
| Struktur | `Revenue − COGS − Expense + Other Revenue − Other Expense = Net Income` (tanpa subtotal Laba Kotor/Usaha; OCI ikut Other Revenue) | Sama, ditambah subtotal Laba Kotor & Laba Usaha, OCI dipisah (decisions.md) |
| Jurnal yang dihitung | Versi "generate" (`SessGeneratePNL`): **posted saja**. Versi lain (`DbCoa.getCoaBalancePNLMTD`): **semua status termasuk draft** | **Posted saja** (= versi generate) |
| Bulanan | per `gl.period_id` | Sama |
| YTD | Versi generate (`getAmountLTB`): **Σ bulan Jan s.d. bulan terpilih** ✔️. Versi lain (`getCoaBalancePNLYTD`): saldo awal `coa_opening_balance_location` + bulan berjalan — ⚠️ di DB `demo` saldo awal P&L di tabel itu **tidak cocok** dengan GL | **Σ bulan** (= versi generate) |
| Tabel arsip | Mengikuti `periode.table_name` | Sama |

→ Angka dashboard harus cocok dengan **`profitloss_segmentgen.jsp` (Laba Rugi "generate")** — **acuan resmi, dikonfirmasi user** (decisions.md D26, O14). Selisih kecil dengan versi lain wajar karena jurnal draft.

### 6.5 Expense Paid (flow, sisi kas)

Biaya operasional yang **benar-benar dibayar** dalam periode. Dua sumber:

**(a) Pembayaran tagihan AP** (`ap_ar_card`)
```
kartu bayar : module_type = 0, transaction_type ∈ {9, 10, 14}, in_out = −1,
              DATE(transaction_date) ∈ [d1, d2]
alokasi     : ap_ar_card_detail (detail.ap_ar_card_id = kartu bayar)
              → item = ap_ar_card (item.ap_ar_card_id = detail.invoice_id)
dibayar     = Σ (− detail.amount) untuk item.transaction_type ∈ {0, 1, 2, 4, 5, 6, 12}
              -- tagihan dagang & non-dagang, dikurangi retur & memo yang dipakai
              -- BUKAN item type 3 (hutang aset → masuk INVESTING)
            + Σ (− amount × in_out) kartu bayar yang TIDAK punya detail
              -- "pembayaran belum dialokasikan" (§6.6 bagian B); tampil sebagai kategori tersendiri
```
> Kartu type 7/8 (incoming adjustment) **bukan** uang keluar — hanya menyesuaikan nilai tagihan.
> Kartu bayar dibuat ERP saat pembayaran diposting: type **9** (Payment single) untuk **Pembayaran Bank** (`bankpo_payment` type 1, alur Seleksi Invoice) dan type **10** (Payment multi) untuk **Pembayaran langsung** (type 3), jadi tanggal kartu = tanggal uang keluar. **Jangan** memakai voucher `bankpo_payment` type 0 sebagai Expense Paid — itu baru rencana bayar.
>
> ⚠️ Untuk pembayaran dengan **BG, cek tangguh, atau e-banking**, tanggal kartu adalah tanggal pembayaran dicatat, sedangkan uang keluar dari bank baru saat giro dicairkan. Selama belum cair, kreditnya berada di akun Hutang Giro.
> Kartu type 10 dengan `in_out = +1` (retur melebihi tagihan → vendor berutang ke kita) dihitung sebagai **pengurang** Expense Paid.

**(b) Pembayaran langsung tanpa tagihan** (petty cash, bank non-PO, dll.)
```
jurnal yang mengkredit akun kas/bank
DAN akun lawannya ber-account_group ∈ {Cost Of Sales, Expense, Other Expense}
DAN akun lawan BUKAN akun penyusutan/amortisasi/bunga pinjaman/pajak penghasilan
```

```
ExpensePaid = (a) + (b)
```

- **Tidak termasuk:** cicilan pokok pinjaman (journal_type 13/14), pembelian aset (44/45, AP type 3), dividen, uang muka (AP type 11) sampai uang mukanya dipakai.
- **Drill-down:** kategori (folder akun beban) → entitas → vendor → pembayaran.
- ⚠️ Definisi (b) perlu divalidasi dengan data asli (decisions.md O6).

### 6.6 Outstanding Liability — AP (snapshot)

> **Mengikuti laporan AP Aging ERP** (`web/fin/freport/ap_aging.jsp` → `SessApArCard.listAgingAp`) supaya totalnya sama dengan yang dilihat tim finance (decisions.md D17, D24).

**Dua jenis baris yang membentuk saldo utang per tanggal `asOf`:**

| Bagian | Baris `ap_ar_card` (`module_type = 0`, `DATE(transaction_date) ≤ asOf`) | Nilai |
|---|---|---|
| **A. Item** | `transaction_type ∈ {0, 1, 2, 3, 4, 5, 6, 12}` (tagihan dagang/non-dagang, retur, aset, AP memo, BG, sementara, memo) | `amount × in_out` **+** Σ `ap_ar_card_detail.amount` yang `invoice_id` = item **dan** kartu pemilik detail ber-`transaction_type ∈ {7, 8, 9, 10, 11, 13, 14}` bertanggal ≤ `asOf` |
| **B. Pembayaran belum dialokasikan** | `transaction_type ∈ {7, 8, 9, 10, 11, 13, 14}` yang **tidak punya** baris `ap_ar_card_detail` sama sekali | `amount × in_out` (umumnya negatif = mengurangi utang) |

Baris dengan nilai ≠ 0 masuk laporan, dikelompokkan per vendor (`owner_id`) dan per kartu.

> DB `demo`: bagian B berisi **53 kartu bayar type 10 senilai ±Rp4,27 M** (2023–2024) — pembayaran ke vendor yang belum dicocokkan ke tagihan. Tanpa bagian B, total utang dashboard akan lebih besar dari ERP.

```sql
-- Bagian A — item (kerangka; asOf & lokasi sebagai parameter; kompatibel MySQL 5.7)
SELECT i.ap_ar_card_id, i.owner_id, i.location_id, i.transaction_type,
       i.transaction_number, DATE(i.transaction_date) AS tgl, i.due_date,
       i.amount * i.in_out
         + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS saldo
FROM ap_ar_card i
LEFT JOIN ap_ar_card_detail d ON d.invoice_id = i.ap_ar_card_id
LEFT JOIN ap_ar_card p        ON p.ap_ar_card_id = d.ap_ar_card_id
                              AND p.module_type = 0
                              AND p.transaction_type IN (7,8,9,10,11,13,14)
                              AND p.transaction_date < :asOf_plus_1_day
WHERE i.module_type = 0
  AND i.transaction_type IN (0,1,2,3,4,5,6,12)
  AND i.transaction_date < :asOf_plus_1_day
  AND i.location_id IN (:lokasi)
GROUP BY i.ap_ar_card_id, i.owner_id, i.location_id, i.transaction_type,
         i.transaction_number, i.transaction_date, i.due_date, i.amount, i.in_out
HAVING saldo <> 0;

-- Bagian B — pembayaran belum dialokasikan
SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.transaction_type,
       p.transaction_number, DATE(p.transaction_date) AS tgl, p.due_date,
       p.amount * p.in_out AS saldo
FROM ap_ar_card p
LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
WHERE p.module_type = 0
  AND p.transaction_type IN (7,8,9,10,11,13,14)
  AND p.transaction_date < :asOf_plus_1_day
  AND p.location_id IN (:lokasi)
  AND d.ap_ar_card_detail_id IS NULL
  AND p.amount * p.in_out <> 0;
```

**Angka yang ditampilkan:**

```
Outstanding Liability (angka utama) = Σ saldo (A + B)         ← NETO, sama dengan total "Saldo" AP Aging ERP
  ├ Tagihan belum lunas             = Σ saldo A yang > 0
  ├ Kredit vendor                   = Σ saldo A yang < 0      (retur/memo belum dipakai)
  └ Pembayaran belum dialokasikan   = Σ saldo B
```

**Bucket umur** (sama dengan ERP; hitungan dalam **hari kalender**, perbandingan tanggal saja tanpa jam):

```
selisih = asOf − due_date   (hari)
```

| Kelompok | Bucket (default) | Syarat |
|---|---|---|
| **Sudah jatuh tempo** | 0 – 30 hari | `0 ≤ selisih ≤ 30` — **jatuh tempo hari ini termasuk di sini** |
| | 31 – 60 hari | `31 ≤ selisih ≤ 60` |
| | 61 – 90 hari | `61 ≤ selisih ≤ 90` |
| | > 90 hari | `selisih > 90` |
| | *Subtotal "Sampai saat ini"* | Σ semua bucket di atas |
| **Akan jatuh tempo** | 1 – 30 hari lagi | `−30 ≤ selisih ≤ −1` |
| | 31 – 60 hari lagi | `−60 ≤ selisih ≤ −31` |
| | 61 – 90 hari lagi | `−90 ≤ selisih ≤ −61` |
| | > 90 hari lagi | `selisih < −90` |

- ERP membolehkan jumlah bucket diatur (lampau 1–3 × 30 hari, mendatang 1–4 × 30 hari). Dashboard memakai default di atas (3 lampau + bucket sisa, 3 mendatang + bucket sisa).
- ERP AP Aging **tidak** memfilter lokasi (seluruh perusahaan). Dashboard menambahkan filter lokasi lewat `ap_ar_card.location_id` (D8); dengan semua lokasi terpilih, totalnya harus sama dengan ERP.
- Filter/breakdown tambahan seperti di ERP: **akun kontrol AP** (`ap_ar_card.coa_id`; daftar akun dari `acc_link.type = 'Account Payable (Subledger)'`) dan **vendor**.

**Perbedaan sengaja dari kode ERP** (bug yang tidak ikut ditiru):
1. Query ERP melakukan `LEFT JOIN ap_ar_card_detail acd ON ac.ap_ar_card_id = acd.ap_ar_card_id` pada item; bila sebuah item kebetulan juga punya baris detail sebagai pemilik, saldonya **terhitung berlipat**. Di DB `demo` hanya 1 baris rusak yang terkena (§4.7 Q6) → dashboard tidak memakai join itu.
2. Batas bucket ERP memakai jam saat laporan dibuka; tagihan yang jatuh tempo tepat 30/60/90 hari lalu bisa bergeser bucket. Dashboard membandingkan **tanggal saja**.

**Aturan lain:**
- ⚠️ **Jangan memakai `payment_status`** — kolom itu status **hari ini** dan sudah bernilai 2 begitu tagihan masuk voucher pembayaran (§2.2, §4.7 Q1). ERP AP Aging juga tidak memakainya.
- **Kolom status rencana bayar** per tagihan yang masih bersisa: `Belum diajukan` · `Diajukan` (voucher type 0 `Not Posted`) · `Disetujui, menunggu bayar` (voucher type 0 `Posted`/`Partialy Paid`) — tambahan dashboard (D22).
- ⚡ Performa: pakai index `idx_dash_apar_mod_loc_date` & `idx_dash_apar_mod_loc_due` ([`docs/sql/dashboard-indexes.sql`](./sql/dashboard-indexes.sql)); `ap_ar_card_detail` sudah ber-index `invoice_id` & `ap_ar_card_id`.
- **Cek rekonsiliasi (info, bukan blocker):** Σ saldo AP ≈ saldo akun kontrol Hutang Usaha di GL. Selisih → ikon ⚠️ "Subledger & GL tidak sinkron".
- **Drill-down:** bucket → vendor → kartu (tagihan/retur/memo/pembayaran belum dialokasikan) → riwayat pelunasan.

### 6.7 AR Aging (snapshot)

> **Mengikuti laporan AR Aging ERP** (`web/fin/ar/ar_aging.jsp` → `SessApArCard.listAgingAr`), decisions.md D25. Polanya sama dengan AP (§6.6), **dengan tiga perbedaan** yang ditandai ⚠️.

| Bagian | Baris `ap_ar_card` (`module_type = 1`, `DATE(transaction_date) ≤ asOf`) | Nilai |
|---|---|---|
| **A. Item** | `transaction_type ∈ {0, 3, 4, 5}` (penjualan, non-dagang, delivery order, AR memo) | `amount × in_out` **+** Σ `ap_ar_card_detail.amount` yang `invoice_id` = item **dan** kartu pemilik detail ber-`transaction_type ∈ {1, 2}` (pembayaran, retur) bertanggal ≤ `asOf` |
| **B. Retur belum dialokasikan** | `transaction_type = 2` (retur) yang **tidak punya** baris `ap_ar_card_detail` | `amount × in_out` (negatif) |

- ⚠️ **Retur (type 2) punya dua peran:** bila punya detail → menjadi **kartu pelunasan** (memotong tagihan); bila tidak → masuk bagian B. Retur **bukan** item di bagian A.
- ⚠️ **Pembayaran pelanggan (type 1) yang belum dialokasikan TIDAK dihitung** oleh ERP (berbeda dengan AP bagian B). DB `demo`: tidak ada baris seperti ini, jadi belum berdampak — tetapi bila muncul di klien lain, dashboard menampilkannya di panel "Data perlu dicek", **tidak** memasukkannya ke saldo (supaya total tetap sama dengan ERP).
- ⚠️ **ERP AR Aging punya filter lokasi** (`ap_ar_card.location_id`, daftar dari tabel `location` tanpa tipe *in transit*/*WIP*) — sejalan dengan filter entitas dashboard (D8).
- Bucket umur, perlakuan saldo neto per pelanggan, dan dua bug ERP yang tidak ditiru: **sama dengan §6.6**.
- Filter/breakdown tambahan seperti di ERP: **akun kontrol AR** (`acc_link.type = 'Account Receivable (Subledger)'`) dan **pelanggan** (`customer`).

**Angka yang ditampilkan:**

```
AR Outstanding (angka utama) = Σ saldo (A + B)           ← NETO, sama dengan total AR Aging ERP
  ├ Piutang belum lunas      = Σ saldo A yang > 0
  ├ Kredit pelanggan         = Σ saldo A yang < 0        (AR memo kredit, kelebihan bayar)
  └ Retur belum dialokasikan = Σ saldo B
```

> DB `demo` (semua tanggal, sebelum filter saldo ≠ 0): penjualan type 0 ±Rp348 jt, **non-dagang type 3 ±Rp24,7 M** (komponen terbesar), AR memo type 5 −Rp3,2 M, retur belum dialokasikan −Rp35 jt (41 baris). Piutang non-dagang perlu tampil sebagai kategori sendiri karena nilainya jauh lebih besar daripada piutang dagang.

**Kerangka SQL** sama dengan §6.6, dengan pengganti:
- bagian A: `i.module_type = 1 AND i.transaction_type IN (0,3,4,5)`; kartu pelunasan `p.module_type = 1 AND p.transaction_type IN (1,2)`
- bagian B: `p.module_type = 1 AND p.transaction_type = 2` tanpa detail

### 6.8 Monthly Fixed Cost (flow, per bulan)

```
FixedCost(bulan)    = mutasi(basket('fixedCost'), awal bulan, akhir bulan)
VariableCost(bulan) = mutasi(grup('Expense') − basket('fixedCost'), …)
```

- **Chart:** stacked bar Fixed vs Variable per bulan + rata-rata fixed cost.
- **Drill-down:** folder (Gaji & Tunjangan, Sewa, BPJS, …) → akun → entitas → jurnal.
- Keranjang kosong → empty state "Atur akun Biaya Tetap di Settings".

### 6.9 Daily Payment Plan (ke depan: 7/14/30 hari)

```
SaldoAwal(hari ke-0) = CashPosition(hari ini)
Baris "Overdue"      = Σ sisa AP dengan due_date < hari ini     (ditampilkan paling atas, dibebankan di hari ke-0)

untuk setiap hari h dalam horizon:
  Keluar(h) = Σ sisa AP dengan due_date = h
  Masuk(h)  = 0                                           (default, konservatif)
  jika toggle "Sertakan proyeksi penerimaan":
     Masuk(h) = Σ sisa AR dengan due_date = h
              + Σ bank_payment belum cair dengan estimasiCair = h
                -- estimasiCair = transaction_date + lag(channel), minimal besok
                -- lag(channel) = rata-rata (payment_date − transaction_date) 90 hari terakhir
                --               per coa_id, dibulatkan ke atas; default 1 hari
  SaldoAkhir(h) = SaldoAwal(h) + Masuk(h) − Keluar(h)
  SaldoAwal(h+1) = SaldoAkhir(h)
  SaldoAkhir(h) < 0 → 🔴
```

- Tampilan: tabel/kalender harian + chart garis saldo proyeksi.
- **Drill-down:** hari → daftar tagihan (vendor, nomor, sisa, jatuh tempo, **status rencana bayar**).
- **Status rencana bayar** (dari voucher `bankpo_payment` type 0, §2.2): setiap tagihan diberi label `Belum diajukan` / `Diajukan` / `Disetujui, menunggu bayar`, dan ada ringkasan "Total sudah disetujui untuk dibayar" vs "Belum diajukan" per hari. Ini membantu finance melihat tagihan jatuh tempo yang **belum** masuk antrean bayar.

### 6.10 Budget vs Actual (flow)

> **Referensi ERP:** `profitloss_budgetgen.jsp` / `profitloss_budgetgen2.jsp` (`SessBudgetComparisson`) dan `budgetreport_month.jsp` (`DbCoaBudget`).

```
Budget(akun, bulan) = Σ coa_budget.amount
                      WHERE budget_type = 1 (Accounting)
                        AND bgt_year = tahun
                        AND bgt_month = bulan − 1      ⚠️ bgt_month 0-based (Jan = 0)
                        AND segment1_id ∈ lokasi terpilih
Budget HEADER       = Σ budget akun POSTABLE di bawahnya (seperti getBudgetHeader ERP)
Budget YTD          = Σ budget bgt_month 0 … (bulan − 1)      (seperti getBudgetYTD ERP)
Actual(akun, bulan) = P&L bulanan akun itu (§6.4, posted, per period_id)
Variance            = Actual − Budget
Variance %          = Variance ÷ Budget            (Budget = 0 → "—")
```

- **Warna mengikuti jenis akun:** Revenue & Other Revenue → Actual > Budget = 🟢. Beban (COGS/Expense/Other Expense) → Actual > Budget = 🔴.
- Ditampilkan per baris P&L dan per folder akun.
- `budget_type = 2` (Operasional, hanya Revenue) bisa ditampilkan sebagai **"Target Operasional"** terpisah — tidak dicampur dengan budget Accounting.
- Baris budget dengan `coa_id` yang tidak ada di `coa` (target KPI seperti jumlah struk) diabaikan.

### 6.11 Cash Runway & Rasio (snapshot)

```
NetBurn(bulan) = NetCashFlow(bulan)                          -- dari §6.3
AvgBurn        = rata-rata NetBurn 3 bulan penuh terakhir
Runway         = AvgBurn < 0 ? CashPosition ÷ |AvgBurn| bulan
                             : "Arus kas positif"

GrossMargin    = Laba Kotor ÷ Revenue
NetMargin      = Laba Bersih ÷ Revenue
CurrentRatio   = saldo(grup('Liquid Assets')) ÷ saldo(grup('Current Liabilities'))
```

- Pembagi = 0 → "—".
- ⚠️ Di data asli, grup Current Liabilities juga memuat folder **Hutang Bank Jangka Panjang** → Current Ratio bisa terlihat lebih buruk. Ditandai ⓘ.

---

## 7. Script Seed DB Lokal (Data Dummy)

### 7.1 Prinsip

- **Target:** MySQL/MariaDB **lokal di laptop** (decisions.md D3), database terpisah mis. `finance_dashboard_dev`. Script **menolak berjalan** bila `DATABASE_URL` bukan host lokal (`localhost`/`127.0.0.1`) — pengaman supaya tidak pernah menulis ke DB kantor.
- **Struktur tabel:** DDL ramping dengan nama tabel & kolom sama seperti ERP (§2.2), tipe ID `BIGINT`, nominal `DECIMAL`.
- **Deterministik:** faker dengan seed tetap → isi DB selalu sama setiap kali `seed` dijalankan ulang (drop → create → insert).
- **Volume:** ±24 entitas × 24 bulan; insert per batch (mis. 1.000 baris) dalam transaksi.
- **Seimbang:** setiap `gl_id` harus Σ debet = Σ credit (divalidasi sebelum insert; gagal → script berhenti).
- **Tanpa transaksi antar entitas** (decisions.md D2).
- **Tanpa data sensitif:** nama bank/vendor/customer generik dari faker; tidak ada nomor rekening asli.
- **Akun demo login** dibuat di `sysuser` lokal (kredensial ditulis di `.env.example`/README seed, bukan di kode).
- **Index** dibuat di DB lokal: `gl(trans_date)`, `gl_detail(gl_id)`, `gl_detail(coa_id, segment1_id)`, `ap_ar_card(module_type, due_date)`, `coa(acc_ref_id)`.

### 7.2 Master data

| Tabel | Isi dummy |
|---|---|
| `pos_location` | ±24 entitas, nama generik (mis. "PT Contoh Ritel 01"); 1–2 nonaktif |
| `segment`/`segment_detail` | `segment1_id` = Lokasi, satu `segment_detail` per entitas |
| `coa` | Meniru **struktur** klien: 111 Kas (Kas Besar, Kas Modal, Kas Penjualan Tunai, Kas Kecil per unit kerja (hanya nama akun)), 1121 Bank (±8 rekening generik), 1122 Deposito, 113 Piutang (incl. 1132 EDC, 1138 QRIS/e-wallet/Cash in Transit), 116 Persediaan, 1211 Aset Tetap (+ akumulasi penyusutan), 2 Kewajiban (Hutang Usaha, Hutang Biaya, Hutang Bank, Hutang Pajak), 3 Modal, 4 Pendapatan (Retail/Grosir per kategori), 5 HPP, 6 Beban (Fixed/Variable), 7 Pendapatan Lain, 8 Beban Lain (Penyusutan, Bunga, Pajak), 9 OCI. **Termasuk keanehan struktur** (Bank langsung di bawah "1", Piutang sebagai akar, akun lawan dengan `saldo_normal` janggal, 1 akun orphan) supaya pembangun pohon teruji |
| `vendor` / `customer` | ±60 / ±40, termin 14–60 hari |
| `cash_flow_group`/`setup` | 3 grup; mapping akun lawan; **sengaja 1–2 akun tidak dipetakan** |
| `periode` | Bulanan; bulan-bulan lampau `Closed`, bulan berjalan `Open` |
| `coa_budget` | Actual "normal" × (0.9–1.1), per akun P&L per bulan per entitas |
| `coa_opening_balance` | Saldo awal tahun buku untuk akun neraca |

### 7.3 Pola transaksi per entitas per bulan

| Kejadian | Frekuensi | `journal_type` | Jurnal (debit → kredit) |
|---|---|---|---|
| Penjualan harian | tiap hari | 9 | Kas Penjualan Tunai / Piutang EDC / Piutang QRIS → Pendapatan (per kategori) |
| HPP | tiap hari | 20 | HPP → Persediaan |
| Pencairan EDC/QRIS | H+1/H+2 | 3 | Bank → Piutang EDC/QRIS |
| Setor kas ke bank | 2–3×/minggu | 3 | Bank → Kas Penjualan Tunai (transfer internal) |
| Penjualan kredit (grosir) | mingguan | 8 | Piutang Usaha → Pendapatan + `ap_ar_card` AR |
| Terima pembayaran piutang | sesuai termin, sebagian telat | 41/42 | Bank → Piutang Usaha + kartu AR bayar |
| Pembelian barang dagang | beberapa kali/minggu | 6 | Persediaan → Hutang Usaha + item AP type 0 (`IN…`), termin 7–30 hari |
| Hutang konsinyasi dari penjualan | harian | — | Item AP type 0 bernomor `…/SLS/…` per penjualan barang titipan (tanpa `gl_id`, seperti data asli) |
| Retur & memo ke supplier | sesekali | 23/21 | Item AP type 2 (`RT…`, `in_out=-1`) & type 4 (`APM/…`, dua arah) |
| Penyesuaian nilai tagihan | sesekali | — | Kartu pelunasan AP type 8 + detail ke tagihan |
| Tagihan biaya (listrik, sewa, dll.) | bulanan | 5/22 | **Dibayar langsung** Beban → Bank (sesuai data asli, AP non-dagang hampir tidak dipakai) |
| Bayar tagihan AP | mingguan, sebagian telat/sebagian | 4/22 | Hutang → Bank + kartu AP **type 10** (`in_out=-1`) + detail: −tagihan, +retur/memo yang dipakai |
| Petty cash | 2–4×/minggu | 1 | Beban → Kas Kecil |
| Gaji & tunjangan (fixed) | akhir bulan | 22 | Beban Gaji → Bank |
| Depresiasi | akhir bulan | 47 | Beban Penyusutan → Akumulasi Penyusutan |
| Cicilan pinjaman bank | bulanan | 14 | Hutang Bank + Beban Bunga → Bank |
| Beli aset (jarang) | 0–1×/kuartal | 44 | Aset Tetap → Bank / Hutang (AP type 3) |
| Pencairan pinjaman (jarang) | 0–1×/tahun | 12 | Bank → Hutang Bank |
| **Edge case** | sesekali | 26 / batal | 1 jurnal + jurnal reverse; 1 jurnal `canceled_date` terisi; 1 jurnal draft (`posted_status = 0`) |

Pola musiman: penjualan naik di akhir pekan, Desember, dan masa liburan; satu–dua entitas dibuat **merugi** dan satu dibuat **kasnya tipis** supaya alert & Payment Plan merah bisa didemokan.

---

## 8. Unit Test Wajib (Vitest)

| Area | Kasus |
|---|---|
| Script seed | Setiap `gl_id` seimbang; seed sama → data sama; menolak berjalan ke host non-lokal |
| Filter jurnal | Draft & batal tidak dihitung; jurnal + reverse = 0 |
| Tanda saldo | Akun lawan (akumulasi penyusutan, cadangan piutang) mengurangi total grup |
| Pohon CoA | Struktur dari `acc_ref_id`; orphan masuk folder khusus; siklus terdeteksi; urut per kode |
| Resolver keranjang | HEADER → semua POSTABLE keturunan (incl. akun baru); deteksi bentrok; `coa_id` hilang diabaikan |
| Cash Flow | **Kas awal + net = kas akhir = Cash Position**; transfer Kas→Bank tidak dihitung; akun tak terpetakan → "Belum terklasifikasi" |
| P&L | Laba Bersih tidak memuat OCI; margin dengan Revenue 0 → "—" |
| Aging | Bucket tepat di batas hari (0, 30, 31, 60, 61, 90, 91); `asOf` lampau tidak memakai `payment_status` |
| Sisa AP/AR | `Σ detail = kartu.amount × in_out`; tagihan + retur dibayar sekaligus → sisa 0; pembayaran setelah `asOf` tidak mengurangi sisa; `in_out=0` diabaikan; tagihan ber-`payment_status=2` di voucher yang belum dibayar **tetap** dihitung sebagai utang & berlabel "Disetujui, menunggu bayar"; pembayaran yang ada di `ap_ar_card_detail` dan `bankpo_payment_detail` **tidak** dihitung dua kali |
| Payment Plan | Overdue di hari ke-0; toggle penerimaan; saldo negatif ditandai |
| Expense Paid | Hutang aset & cicilan pokok tidak dihitung; petty cash dihitung |
| Budget vs Actual | Arah warna Revenue vs Beban; Budget 0 → "—" |
| Runway | Net burn positif → "Arus kas positif" |
| Format | Singkatan ID (Rb/Jt/M/T) vs EN (K/M/B/T); CSV `,`/`.` vs `;`/`,` + BOM |
| ID besar | `coa_id` 18 digit tetap utuh dari DB → UI → Settings → DB |
| Query metrik | Dijalankan ke DB lokal hasil seed → hasil sama dengan angka yang diharapkan |
| Settings | JSON rusak di `system_main` → default + peringatan; simpan → baca ulang identik |
| Login | User nonaktif ditolak; password salah ditolak; respons tidak pernah memuat kolom `password` |

---

## 9. Arsitektur Akses Database, Keamanan & Login

### 9.1 Lapisan

```
Halaman (route, SSR)
  └─ loader / useQuery  ──►  server function (createServerFn)   ← cek session + validasi input (Zod)
                                └─ repository (src/server/repo/*)   ← satu-satunya tempat query SQL (Drizzle)
                                      └─ MySQL/MariaDB (lokal saat dev · DB ERP saat produksi)
```

- Komponen UI **tidak pernah** mengimpor Drizzle/`mysql2`; hanya memanggil server function.
- Kode server berada di folder khusus server supaya tidak ikut ter-bundle ke browser.

### 9.2 Koneksi & hak akses

| Hal | Aturan |
|---|---|
| Kredensial | `DATABASE_URL` hanya di env server; `.env` di-`.gitignore`; sediakan `.env.example` tanpa nilai rahasia |
| User DB dashboard | `SELECT` pada tabel yang dipakai (§2.2) + `INSERT, UPDATE` **hanya** pada `system_main` |
| Drizzle | Skema dihasilkan dengan `drizzle-kit introspect`/`pull`. **Dilarang** `push`/`migrate` ke DB ERP |
| Versi DB | Klien memakai **MySQL 5.7.44** (decisions.md D23) — lihat §9.2.1 |
| Index | Index tambahan untuk dashboard: [`docs/sql/dashboard-indexes.sql`](./sql/dashboard-indexes.sql) — online DDL, dijalankan manual (decisions.md O11) |

#### 9.2.1 Batasan kompatibilitas MySQL 5.7

DB lokal `demo` adalah MariaDB 10.4 yang menerima beberapa sintaks yang **tidak** ada di MySQL 5.7. Aturan berikut memastikan query yang lolos di laptop juga jalan di server klien:

| Area | Aturan | Alasan |
|---|---|---|
| SQL — fitur | **Dilarang:** CTE (`WITH`, termasuk rekursif), window function (`OVER`, `ROW_NUMBER`, `LAG`…), `LATERAL`, `REGEXP_REPLACE`/`REGEXP_SUBSTR` | Baru ada di MySQL 8.0 (MariaDB 10.2+ sudah punya → jebakan) |
| SQL — `GROUP BY` | Selalu cantumkan semua kolom non-agregat (atau kolom yang bergantung pada PRIMARY KEY yang di-`GROUP BY`) | `ONLY_FULL_GROUP_BY` aktif secara default di 5.7 |
| SQL — upsert | `INSERT … ON DUPLICATE KEY UPDATE col = VALUES(col)`; jangan pakai alias `AS new` | Alias baru di 8.0.19 |
| SQL — subquery besar | Utamakan `JOIN`/tabel turunan daripada subquery berkorelasi di tabel jutaan baris | Tetap lebih cepat di 5.7 |
| SQL — fungsi JSON | Boleh (`JSON_OBJECT`, `JSON_ARRAYAGG` ada sejak 5.7.22), tapi tidak dibutuhkan; JSON Settings disimpan sebagai teks | — |
| Drizzle | Utamakan **core query builder** (`db.select().from()…`) dan `sql\`…\``. Bila memakai relational query API (`db.query…with`), set `mode: 'planetscale'` | Mode default relational API memakai `LATERAL` join (MySQL 8.0.14+) |
| Drizzle — skema | `drizzle-kit pull` dijalankan ke **DB lokal** (struktur sama), bukan ke server produksi | Tidak menyentuh server klien; hasil sama |
| Koneksi — charset | `utf8mb4` (default `mysql2`) aman; tabel ERP ber-charset `latin1`, dikonversi otomatis oleh server | — |
| Koneksi — TLS | MySQL 5.7.44 mendukung TLS 1.2 → aktifkan TLS bila koneksi melewati jaringan publik | — |
| Tipe data | `DECIMAL` dibaca sebagai string (aturan §4.8); `DATETIME` tanpa pecahan detik di tabel ERP | — |
| Pengujian | Query metrik yang kritis dites juga di **MySQL 5.7** (mis. container Docker `mysql:5.7.44`) sebelum rilis ke klien | MariaDB 10.4 menerima CTE/window function yang ditolak 5.7 |
| Query | Selalu berparameter (Drizzle / placeholder `?`), tidak pernah menyambung string input user |
| Beban DB | Agregasi di SQL; batasi rentang tanggal sesuai preset; idealnya membaca dari *read replica* (decisions.md O11) |
| Pool koneksi | Satu pool per proses server, batas koneksi kecil (mis. 5–10) |

### 9.3 Login dengan `sysuser` (password plain text)

Karena password di `sysuser` tersimpan **tanpa hash**, pengaman berikut **wajib**:

1. **Verifikasi hanya di server.** Ambil baris berdasarkan `login_id` saja, lalu bandingkan password dengan **perbandingan waktu-konstan** (`crypto.timingSafeEqual`), bukan `===`. Dengan begitu lama proses tidak membocorkan berapa karakter yang benar.
2. **Kolom `password` tidak pernah** dikembalikan ke browser, di-log, dimasukkan ke pesan error, atau di-cache. Query login memilih kolom secara eksplisit (tidak `SELECT *`).
3. Pesan gagal **selalu sama** ("Username atau password salah") — tidak membedakan user tidak ada vs password salah.
4. Hanya `user_status` aktif yang boleh masuk.
5. **Rate limit** percobaan login (mis. 5×/menit per IP + per username).
6. Session: cookie terenkripsi bawaan TanStack Start, `httpOnly`, `secure`, `SameSite=Lax`, masa berlaku terbatas (mis. 8 jam). Isi session hanya `user_id` & nama — **bukan password**.
7. **Rekomendasi untuk tim ERP (di luar scope prototype):** pindah ke password ber-hash (bcrypt/argon2), atau setidaknya sediakan *stored function* `verify_login(login_id, password)` supaya user DB dashboard tidak perlu hak baca kolom `password` (decisions.md O8).
