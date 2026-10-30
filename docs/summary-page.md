# Halaman Summary — Data, Query & Rumus

> **Tujuan:** bahan konfirmasi ke tim finance. Menjelaskan untuk setiap kartu di halaman Summary: data apa yang diambil, query apa yang berjalan, bagaimana angka dihitung, dan hal yang perlu dipastikan.
>
> **Status dokumen:** disusun dari membaca kode dan `docs/data-model.md` / `docs/decisions.md`. **Belum diverifikasi** dengan menjalankan query ke database. Bila ada selisih dengan `decisions.md` / `data-model.md`, dokumen itu yang menang.
>
> **Aturan pemeliharaan:** dokumen ini **harus diperbarui setiap kali halaman Summary berubah** (kartu baru, rumus berubah, sumber data berubah, kartu dihapus). Tambahkan baris di [Riwayat Perubahan](#riwayat-perubahan) dan perbarui tanggal di bawah.
>
> **Query SQL lengkap untuk developer:** lihat [`summary-queries.md`](./summary-queries.md). Kedua dokumen harus diperbarui bersamaan.
>
> **Terakhir diperbarui:** 2026-10-30

## Daftar isi

1. [Aturan umum](#1-aturan-umum)
2. [Cash Position](#2-cash-position-kartu-hijau)
3. [Revenue](#3-revenue)
4. [Net Profit](#4-net-profit)
5. [Payables](#5-payables)
6. [Cash Flow (grafik bulanan)](#6-cash-flow-grafik-batang-bulanan)
7. [Composition (donut)](#7-composition-donut)
8. [Tabel tagihan: jatuh tempo ≤ 7 hari dan lewat jatuh tempo](#8-tabel-tagihan-jatuh-tempo--7-hari-dan-lewat-jatuh-tempo)
9. [Kartu mini: Runway, Margin, Current Ratio](#9-kartu-mini)
10. [Lima hal terpenting untuk dikonfirmasi](#10-lima-hal-terpenting-untuk-dikonfirmasi)
11. [Catatan developer](#11-catatan-developer-bukan-untuk-finance)
12. [Riwayat Perubahan](#riwayat-perubahan)

---

## 1. Aturan umum

Berlaku untuk semua kartu di Summary.

**Tanggal acuan (`asOf`) ditentukan filter periode:**

| Pilihan periode | Tanggal acuan |
|---|---|
| Bulan ini, Kuartal ini, YTD, 12 bulan | Hari ini |
| Bulan lalu | Akhir bulan lalu |
| Rentang kustom | Akhir bulan terakhir yang dipilih (maksimal hari ini) |

**Filter entitas** menentukan lokasi (`pos_location`) mana yang dijumlahkan. Penjumlahan biasa, **tanpa eliminasi antar-entitas**.

**Aturan akuntansi:**
- Hanya jurnal `posted_status = 1` (dan `canceled_date` kosong, bila tabel `gl` punya kolom itu). Jurnal draft **tidak** dihitung.
- Jurnal pembalik ikut dihitung bersama jurnal aslinya (saling meniadakan).
- Tanda angka mengikuti sisi alami kelompok akun (`account_group`), bukan `coa.saldo_normal`:
  - Harta, Harga Pokok Penjualan (HPP), Beban → debit − kredit.
  - Utang, Modal, Pendapatan → kredit − debit.
- Angka **bulanan** memakai `gl.period_id`; angka **per tanggal** (saldo kas) memakai `gl.trans_date`.
- Daftar akun Kas, Bank, Deposito, Dana transit, Biaya Tetap **tidak ditulis mati di kode**. Diambil dari Settings › Account Mapping (`system_main`, baris `DASHBOARD_ACCOUNT_MAPPING`).
- Periode berstatus **Closed** dibaca dari tabel salinan `dash_snap_gl_monthly` bila sudah dibangun. Periode Open / Pre Closed selalu dibaca langsung dari ERP.
- Banner peringatan muncul bila rentang memuat periode Open / Pre Closed, atau ada bulan tanpa baris periode.

**Peta isi halaman:**

| Komponen | Layanan (service) | Sumber data utama |
|---|---|---|
| Cash Position | `cash-position.service.ts` | `coa`, `system_main`, `periode`, `coa_opening_balance_location`, `gl`, `gl_detail`, `bank_payment` |
| Revenue | `revenue.service.ts` | `gl`, `gl_detail`, `coa` |
| Net Profit | `pnl.service.ts` | `gl`, `gl_detail`, `coa` |
| Payables | `ap-aging.service.ts` | `ap_ar_card`, `ap_ar_card_detail`, `vendor` (via snapshot `dash_*`) |
| Cash Flow | `cash-flow.service.ts` | `gl`, `gl_detail`, `cash_flow_setup`, `cash_flow_group` |
| Composition | `revenue.service.ts`, `fixed-cost.service.ts` | `gl`, `gl_detail`, `coa`, `system_main` |
| Revenue by Entity | `revenue.service.ts` | `gl`, `gl_detail`, `coa`, `segment_detail`, `pos_location` |
| Tabel tagihan (dua tab) | `payment-plan.service.ts` | AP open invoices, `bankpo_payment`, `bankpo_payment_detail`, `vendor` |
| Runway, Margin, Current Ratio | `runway.service.ts` | Cash Position + arus kas + P&L + saldo akun |

Orkestrator: `src/server/services/summary.service.ts`. Halaman: `src/routes/_authed/summary.tsx`.

---

## 2. Cash Position (kartu hijau)

**Yang ditampilkan:** angka besar = **Kas + Bank**. Di bawahnya: Kas, Bank, lalu (dipisah garis) Deposito dan Dana dalam pencairan. Dua baris terakhir **tidak** masuk angka besar.

### Data yang diambil

| Data | Tabel ERP | Dipakai untuk |
|---|---|---|
| Daftar akun | `coa` (kode, nama, HEADER/POSTABLE, `account_group`) | Membentuk pohon akun |
| Pengaturan keranjang akun | `system_main` | Akun mana yang dihitung sebagai Kas, Bank, Deposito, Transit |
| Periode | `periode` (tanggal, status, tabel GL) | Memilih saldo awal dan tabel GL arsip |
| Entitas | `pos_location`, `segment`, `segment_detail` | Filter lokasi |
| Saldo awal | `coa_opening_balance_location` | Titik awal saldo |
| Mutasi | `gl` + `gl_detail` | Transaksi setelah saldo awal |
| Dana belum cair dan giro/cek beredar | `bank_payment` | Rekonsiliasi dana pencairan; giro/cek beredar tampil sebagai baris tambahan di kartu |

### Query yang berjalan (bahasa biasa)

1. Ambil seluruh daftar akun dan periode (cache 10 menit) dan pengaturan keranjang (cache 2 menit).
2. **Saldo awal:** jumlah `opening_balance` per akun untuk satu periode, untuk akun di keranjang dan entitas terpilih.
3. **Mutasi:** jumlah debet dan jumlah kredit per akun dari jurnal posted dengan `trans_date` antara hari setelah akhir periode Closed terakhir dan `asOf`.
4. **Dana belum cair:** dari `bank_payment` (`type` 1 atau 2, akun transit, `transaction_date` ≤ `asOf`) yang belum cair pada `asOf`: `status` 0, atau `status` 1 tetapi `payment_date` sesudah `asOf` (supaya tanggal lampau benar). Dikelompokkan per akun, entitas, tanggal.
5. **Saldo pembanding** (periode sebelumnya). Query ini ikut berjalan tetapi kartu Summary tidak menampilkannya.

### Cara hitung saldo satu akun pada `asOf`

1. C = periode reguler berstatus Closed terakhir yang berakhir sebelum `asOf`.
2. P\* = periode tepat setelah C.
3. Saldo = saldo awal P\* + (debit − kredit) jurnal posted antara hari setelah akhir C dan `asOf`.
4. Bila P\* tidak punya baris saldo awal → cara cadangan: jumlah semua jurnal posted sejak awal data.

#### Contoh kasus

Sistem tidak menjumlahkan semua transaksi sejak awal. Ia memakai **saldo awal yang sudah tersimpan di ERP** sebagai titik mulai, lalu menambahkan transaksi sesudahnya. Analoginya buku tabungan: lihat saldo di awal halaman terakhir, lalu tambahkan transaksi sesudahnya.

**Hari ini (`asOf`) = 15 Oktober 2025.** Status periode di ERP:

| Periode | Status |
|---|---|
| Januari – Agustus 2025 | Closed |
| September 2025 | Pre Closed |
| Oktober 2025 | Open |

Akun yang dihitung: **Bank Operasional**.

1. **Cari C.** Periode Closed yang berakhir sebelum 15 Okt: Januari sampai Agustus. Yang terakhir adalah **Agustus**. September tidak dipakai karena belum Closed.
2. **Cari P\*.** Periode tepat setelah Agustus adalah **September**. Saldo awal September di `coa_opening_balance_location` untuk Bank Operasional = **Rp1.000 jt**. Angka ini sama dengan saldo akhir Agustus, jadi seluruh transaksi Januari–Agustus sudah terwakili.
3. **Tambahkan transaksi 1 September – 15 Oktober:**

| Tanggal | Keterangan | Debet (masuk) | Kredit (keluar) | Dihitung? |
|---|---|---|---|---|
| 5 Sep | Pelanggan membayar | 500 jt | | Ya |
| 12 Sep | Bayar supplier | | 300 jt | Ya |
| 30 Sep | Bayar gaji | | 200 jt | Ya |
| 3 Okt | Setoran penjualan | 400 jt | | Ya |
| 10 Okt | Bayar sewa | | 150 jt | Ya |
| 14 Okt | Bayar vendor (masih draft) | | 100 jt | **Tidak**: belum posted |
| 16 Okt | Pelanggan membayar | 250 jt | | **Tidak**: setelah `asOf` |
| 20 Agu | Bayar listrik | | 80 jt | **Tidak**: sudah termasuk di saldo awal September |

Total debet yang dihitung = 500 + 400 = **900 jt**. Total kredit yang dihitung = 300 + 200 + 150 = **650 jt**.

```
Saldo 15 Okt = saldo awal September + debet − kredit
             = 1.000 jt + 900 jt − 650 jt
             = 1.250 jt
```

Akun bank termasuk Harta (Liquid Assets), jadi debet menambah saldo dan kredit mengurangi.

**Variasi 1: bila September sudah Closed.** C = September dan P\* = Oktober. Saldo awal Oktober dipakai, lalu hanya mutasi 1–15 Oktober yang ditambahkan. Hasilnya tetap Rp1.250 jt.

**Variasi 2: "Bulan lalu" dengan `asOf` = 31 Agustus.** Agustus berakhir tepat di 31 Agustus, bukan *sebelum* tanggal itu, jadi Agustus bukan C. C = Juli dan P\* = Agustus. Saldo = saldo awal Agustus + mutasi 1–31 Agustus. Ini mengikuti Buku Besar ERP.

**Cara cadangan (langkah 4).** Bila P\* belum punya baris saldo awal, sistem menjumlahkan semua jurnal posted sejak data pertama sampai `asOf`. Misalnya total debet Rp50 miliar − total kredit Rp48,75 miliar = Rp1,25 miliar. Hasilnya seharusnya sama, hanya lebih lambat karena membaca seluruh riwayat jurnal.

**Tiga hal yang perlu diingat:**
1. Transaksi dicocokkan dengan **tanggal transaksi**, bukan periode pencatatan.
2. Hanya jurnal **posted** dan tidak dibatalkan yang dihitung (draft tidak masuk).
3. Bila satu entitas dipilih, saldo awal dan mutasi difilter ke entitas itu.

### Penjumlahan per keranjang

- Kas = Σ saldo akun di keranjang Kas.
- Bank = Σ saldo akun di keranjang Bank.
- **Cash Position = Kas + Bank.**
- Deposito dan Dana dalam pencairan dijumlah dengan cara yang sama untuk keranjangnya masing-masing.
- **Giro/cek beredar** (baris tambahan, muncul bila tidak nol; **tidak** masuk Cash Position): jumlah `bank_payment` `type` 0 (BG), 4 (cek tangguh), 7 (e-banking) yang belum cair pada `asOf`. Pembayaran dengan cara ini sudah mengurangi hutang, tetapi saldo bank baru turun saat giro dicairkan.

Default keranjang menurut dokumen: Kas = folder 111, Bank = 1121, Deposito = 1122, Transit = 1132 + akun QRIS/e-wallet di 1138. **Perlu dicek langsung di Settings.**

### Perlu dikonfirmasi ke finance

1. Isi keranjang Kas, Bank, Deposito, Transit sudah benar?
2. Cash Position memang **tanpa** Deposito? (Di Cash Flow dan Runway, Deposito dianggap setara kas.)
3. "Dana dalam pencairan" di kartu = **saldo buku besar** akun transit, bukan daftar `bank_payment`. Perbandingan keduanya hanya ada di halaman Cash Position. Apakah sinkron?
4. Dokumen kas yang belum diposting tidak dihitung, jadi saldo bisa lebih kecil dari kas riil. Bisa diterima?
5. Apakah angka sama dengan Neraca / Buku Besar ERP pada tanggal yang sama?
6. Kartu mengikuti filter periode (saldo akhir periode terpilih), bukan selalu hari ini. Sesuai harapan?
7. Saldo kas per entitas bisa janggal karena segmen Lokasi bersifat *non-balancing* (NBAL), misalnya tagihan satu entitas dibayar dari rekening entitas lain.
8. Apakah giro/cek beredar harus dikurangkan dari "kas yang bisa dipakai" (misalnya untuk Payment Plan)? Sekarang hanya ditampilkan sebagai informasi.

---

## 3. Revenue

- **Data:** akun grup *Revenue* yang POSTABLE (`coa`), periode terpilih (`periode`), jumlah debet/kredit dari `gl` + `gl_detail` per akun, per periode, per lokasi.
- **Rumus:** Revenue = Σ (kredit − debet) akun Revenue pada `period_id` terpilih. *Other Revenue* **tidak** termasuk.
- **Pembanding:** rumus yang sama untuk rentang sebelumnya dengan panjang yang sama.
- **Dipakai juga di:** donut Composition (tab Revenue) dan donut Revenue by Entity (bagian 7).

**Perlu dikonfirmasi:**
- Retur dan diskon sudah tercatat di akun Revenue sehingga angkanya neto?
- Untuk "Bulan ini", pembandingnya bulan lalu **penuh**, sedangkan angka berjalan baru sampai hari ini (tidak sebanding). Hal yang sama untuk Kuartal dan YTD.

---

## 4. Net Profit

- **Data:** semua akun laba-rugi dari satu query GL per periode: Revenue, Cost Of Sales, Expense, Other Revenue, Other Expense.
- **Rumus:**
  - Laba Kotor = Revenue − HPP
  - Laba Usaha = Laba Kotor − Beban Operasional
  - **Net Profit = Laba Usaha + Other Revenue − Other Expense**
  - OCI (penghasilan komprehensif lain) sedang **tidak dipisahkan**: akun apa pun, termasuk yang berkode "9", dihitung menurut grup akunnya (D39).
- **Net margin** = Net Profit ÷ Revenue (Revenue = 0 → "—"). Tampil sebagai teks kecil di bawah angka Net Profit, dan juga di kartu mini.

**Perlu dikonfirmasi:**
- Apakah klien punya akun OCI (revaluasi aset, selisih kurs penjabaran, dan sejenisnya)? Bila ada, sebutkan akun atau kode induknya agar fitur OCI bisa diaktifkan lagi (item O4).
- Acuan resmi = laporan Laba Rugi ERP versi "generate" (`profitloss_segmentgen.jsp`)? Menurut dokumen, ya.
- Jurnal draft tidak ikut dihitung.

---

## 5. Payables

- **Data:** `ap_ar_card` (modul AP) dan `ap_ar_card_detail`, nama vendor dari `vendor` (hanya id, kode, nama). Dibaca dari tabel salinan `dash_*` yang dibangun ulang berkala (status "Data as of …" di sidebar).
- **Bagian A, tagihan:** tipe transaksi 0–6 dan 12. Sisa = nominal × arah (`in_out`) + jumlah detail pelunasan dari kartu bayar (tipe 7–11, 13, 14) bertanggal ≤ `asOf`. Hanya sisa ≠ 0 yang masuk.
- **Bagian B, pembayaran belum dialokasikan:** kartu bayar tanpa baris detail. Nilainya negatif dan mengurangi utang.
- **Angka besar = A + B (neto)**, mengikuti laporan AP Aging ERP.
- **Overdue di kartu Summary** = jumlah saldo **positif** tagihan yang sudah jatuh tempo (D37). Halaman Payables menampilkan overdue **neto** per bucket (0–30, 31–60, 61–90, >90 hari), yaitu setelah kredit vendor dan pembayaran belum dialokasikan.
  - Umur = `asOf` − `due_date`. Jatuh tempo **hari ini** sudah masuk bucket 0–30.
  - `due_date` kosong → dipakai tanggal transaksi.
  - Pembayaran belum dialokasikan diumurkan berdasarkan tanggal transaksinya.
- `payment_status` sengaja **tidak** dipakai (sudah "lunas" begitu tagihan masuk dokumen Pengakuan Biaya, padahal uang belum keluar).

**Perlu dikonfirmasi:**
1. Total sama dengan AP Aging ERP pada tanggal yang sama?
2. Overdue di kartu Summary hanya menghitung tagihan positif (tidak dinetto dengan kredit vendor dan pembayaran belum dialokasikan). Sesuai?
3. Tagihan yang sudah masuk dokumen Pengakuan Biaya tetapi belum dibayar tetap dihitung sebagai utang.
4. Cek apakah ada pembayaran vendor belum dialokasikan dalam jumlah besar.

---

## 6. Cash Flow (grafik batang bulanan)

- **Data:** jurnal posted pada periode terpilih yang menyentuh akun Kas, Bank, atau Deposito; semua baris jurnal itu diambil, termasuk sisi lawannya.
- **Cash In** per bulan = jumlah bersih kas dari jurnal yang bersih kasnya positif.
- **Cash Out** per bulan = jumlah bersih kas dari jurnal yang bersih kasnya negatif.
- **Net** = In − Out.
- Jurnal yang hanya memindahkan antar akun kas/bank/deposito = transfer internal, diabaikan.
- Bulan ditentukan dari periode jurnal (`period_id`), bukan tanggal transaksi.

**Perlu dikonfirmasi:**
- Pada jurnal campuran (sebagian tunai, sebagian piutang), hanya bagian kasnya yang dihitung.
- Klasifikasi Operating / Investing / Funding tidak tampil di Summary. Ada celah pemetaan `cash_flow_setup` (item O13 di `decisions.md`).

---

## 7. Composition (donut)

- **Tab Revenue:** Revenue per folder akun (data sama dengan kartu Revenue).
- **Tab Expense:** hanya akun di keranjang **Biaya Tetap** (Fixed Cost), per folder, debit − kredit selama periode terpilih.
- Judulnya "Total Expense" padahal HPP dan biaya variabel tidak ikut. **Perlu konfirmasi:** sesuai harapan, atau sebaiknya semua Beban?

### Revenue by Entity (donut kedua)

- **Data:** sama dengan kartu Revenue: pembacaan mutasi yang sama (Q11 / Q12 dengan pengelompokan per lokasi `pos_location` lewat kolom segmen entitas). **Tidak ada query baru.**
- **Rumus:** Revenue per entitas = Σ (kredit − debet) akun Revenue entitas itu pada periode terpilih (rumus yang sama dengan bagian 3). *Other Revenue* tidak termasuk.
- **Tanpa entitas:** jurnal Revenue yang tidak punya lokasi (atau lokasinya tidak ada di daftar entitas) tidak masuk baris entitas mana pun. Selisihnya dihitung = Total Revenue − Σ semua entitas. Di halaman Revenue tampil sebagai baris "Tanpa entitas"; di donut digabung ke segmen "Lainnya" bila positif.
- **Yang digambar:** hanya entitas dengan Revenue > 0. Entitas bernilai nol atau negatif (mis. retur melebihi penjualan) tidak digambar; catatan kecil di bawah legenda menyebut jumlahnya, dan semuanya tetap tampil di tabel halaman Revenue. Karena itu angka di tengah donut bisa berbeda dari kartu Revenue bila ada entitas negatif atau baris "Tanpa entitas" negatif.
- **Persentase:** dari jumlah yang digambar, dibulatkan ke bilangan bulat dengan metode sisa terbesar sehingga total selalu 100. Nilai yang membulat ke 0 ditulis "<1%".
- **Segmen:** maksimal 10 entitas terbesar; entitas berikutnya dan "Tanpa entitas" digabung menjadi satu segmen "Lainnya" (selalu paling akhir). Legenda memuat 5 segmen terbesar (nama dan persen); sisanya dijumlah dalam satu baris "+N lainnya".
- **Interaksi:** arahkan kursor ke segmen atau baris legenda untuk nominal penuh. Klik segmen atau "Details ›" membuka halaman Revenue dengan filter yang sama, tempat tabel Revenue by Entity (entitas, total, porsi; ada export CSV).
- **Kapan kartu disembunyikan:** bila filter hanya memilih 1 entitas, atau bila kurang dari 2 entitas punya Revenue > 0. Saat disembunyikan, tata letak kembali seperti semula (Cash Flow 2/3 + Composition 1/3).
- **Tata letak bila tampil:** Cash Flow selebar penuh; di bawahnya Composition dan Revenue by Entity berdampingan 50/50.

**Perlu dikonfirmasi:** apakah Revenue tanpa lokasi (baris "Tanpa entitas") memang ada di data klien, dan bagaimana finance ingin menanganinya.

---

## 8. Tabel tagihan: jatuh tempo ≤ 7 hari dan lewat jatuh tempo

- **Data:** tagihan AP bagian A dengan sisa > 0, dalam dua tab. Tanggal acuan = hari ini (bukan filter periode); filter entitas tetap berlaku.
  - **Jatuh tempo ≤ 7 hari:** jatuh tempo dari hari ini sampai hari ini + 6 hari.
  - **Lewat jatuh tempo:** jatuh tempo (atau tanggal transaksi bila kosong) sebelum hari ini, seberapa pun lamanya.
- **Kolom:**
  - Vendor (`vendor`: id, kode, nama).
  - Nomor tagihan.
  - Jatuh tempo.
  - Sisa.
  - **Status rencana bayar** dari dokumen **Pengakuan Biaya** (`bankpo_payment` tipe 0, dibuat lewat menu Seleksi Invoice di ERP). Kolom ini disembunyikan bila tidak ada dokumen tipe 0 yang aktif:
    - *Disetujui, menunggu bayar* = Posted atau Partialy Paid.
    - *Diseleksi, belum disetujui* = Not Posted.
    - *Belum diseleksi* = tidak ada dokumen Pengakuan Biaya aktif.
- **Cara pakai tabel:**
  - Dua tab di atas tabel menampilkan jumlah baris masing-masing; berpindah tab mengembalikan tabel ke halaman 1.
  - Tabel bisa diurutkan (vendor, jatuh tempo, sisa, status) dan dibagi per halaman.
  - Tombol ekspor CSV memuat **seluruh** baris pada tab yang sedang dipilih, dengan urutan yang sedang tampil. Kolom status ikut diekspor hanya bila kolomnya tampil.
  - Mengklik baris membuka halaman Payment Plan.

**Perlu dikonfirmasi:**
- Tagihan yang sudah lewat jatuh tempo dipisah ke tab sendiri. Apakah tagihan yang sangat lama (mis. > 180 hari) perlu ditandai atau ditinjau terpisah?
- Hanya tagihan positif; kredit vendor tidak dinetto, jadi total tabel tidak akan sama dengan kartu Payables.

---

## 9. Kartu mini

| Kartu | Rumus | Catatan untuk finance |
|---|---|---|
| **Runway** | Cash Position ÷ \|rata-rata burn\| (bulan). Burn ≥ 0 → "arus kas positif". | Burn = rata-rata **arus kas bersih** 3 bulan penuh sebelum bulan `asOf` (semua laci: operasional, investasi, pendanaan, termasuk pinjaman masuk). Pembilang = Kas + Bank, sedangkan arus kas sudah termasuk Deposito. Wajar? |
| **Gross margin** | Laba Kotor ÷ Revenue | Dari perhitungan P&L yang sama. |
| **Net margin** | Net Profit ÷ Revenue | Dari perhitungan P&L yang sama. |
| **Current ratio** | Saldo seluruh akun grup *Liquid Assets* ÷ saldo seluruh akun grup *Current Liabilities*, pada `asOf` | Pembilang bukan hanya kas, tetapi semua akun bergrup Liquid Assets. Folder Hutang Bank Jangka Panjang ikut masuk Current Liabilities sehingga rasio bisa tampak lebih buruk. |

---

## 10. Lima hal terpenting untuk dikonfirmasi

1. Isi keranjang akun Kas, Bank, Deposito, Transit.
2. Apakah Deposito harus masuk Cash Position.
3. Apakah total Payables dan angka Cash Position sama dengan laporan ERP pada tanggal yang sama.
4. Definisi Overdue dan isi tabel tagihan (apakah tagihan lama perlu ditandai di tab "Lewat jatuh tempo").
5. Isi tab Expense di donut, dan pembanding periode berjalan vs bulan lalu penuh.

---

## 11. Catatan developer (bukan untuk finance)

- Margin (Gross, Operating, Net) dikirim server sebagai rasio desimal (mis. "0.4") dan diformat di klien dengan `formatPercent` (D33).
- Struktur halaman: `summary.tsx` hanya merangkai halaman; empat kartu atas ada di `components/summary/SummaryKpiRow.tsx`, grafik (Cash Flow, Composition, Revenue by Entity, termasuk state tab donut dan aturan menyembunyikan kartu entitas) di `components/summary/SummaryCharts.tsx`; tabel tagihan (tab, urut, halaman, ekspor) ada di `components/summary/BillsTable.tsx`, dan empat kartu mini di `components/summary/MiniMetricsBar.tsx`. Teks runway dibuat oleh `runwayLabel` (`lib/finance/cash/runway-label.ts`), dipakai juga oleh halaman Cash Position.
- Rekonsiliasi GL terhadap AP/AR memakai `reconcileAging` (`lib/finance/ap-ar/aging-reconciliation.ts`): selisih di bawah Rp1 dianggap pembulatan. Pembanding AP hanya dihitung bila snapshot atau riwayat bulan mencakup tanggalnya (`agingCompareIsAvailable`).
- Filter `canceled_date` diputuskan sekali per tabel GL dan di-cache 1 jam; semua tabel GL yang dipakai dicek paralel di awal (`prefetchCanceledDateColumns`).
- Teks "terposting sampai" sempat dibuat lalu dibatalkan (D34), jadi tidak ada di halaman.
- Dihitung di server tetapi tidak ditampilkan di Summary: pembanding Cash Position, saldo awal dan overdue Payment Plan 7 hari, pembanding AP, rekonsiliasi GL terhadap AP. Query-nya tetap berjalan.
- Untuk tanggal acuan masa lalu yang bukan akhir bulan, AP memakai query langsung ke ERP yang lambat.
- Donut Revenue by Entity: `computeRevenue` mengirim `byEntity` (dengan `id` lokasi) dan `entityUnassigned` (= total − Σ entitas); `computeSummary` meneruskannya. Pengelompokan segmen, persentase, dan baris tabel dihitung di `lib/finance/pnl/revenue-entity.ts`; persentase sisa-terbesar dan geometri cincin dipakai bersama dengan donut Composition lewat `lib/core/donut.ts`. Komponennya `components/neraca/EntityDonut.tsx`, dipanggil lewat `<DonutBreakdown variant="entity">`. Kartu disembunyikan di `components/summary/SummaryCharts.tsx` (`showEntityCard`, memakai `countEntitiesWithRevenue`).

---

## Riwayat Perubahan

| Tanggal | Perubahan |
|---|---|
| 2026-10-30 | Dokumen dibuat dari pembacaan kode Summary (belum ada perubahan pada halaman). |
| 2026-10-30 | Ditambah tautan ke `summary-queries.md` (katalog query SQL untuk developer). |
| 2026-10-30 | Bagian Cash Position: contoh kasus lengkap cara hitung saldo akun pada `asOf` (dua variasi dan cara cadangan). |
| 2026-10-30 | Rencana gelombang 2: filter canceled_date opsional; register dana pencairan untuk tanggal lampau; margin rasio desimal; giro beredar; tab tagihan jatuh tempo & terlambat; overdue kotor; ambang umur transit; istilah Pengakuan Biaya. Lihat D31–D38 di `decisions.md`. |
| 2026-10-30 | Fitur OCI dinonaktifkan sementara (D39): Net Profit dan margin menghitung semua akun menurut grupnya; tidak ada lagi baris OCI/Total Laba Komprehensif di P&L. Bagian 4 disesuaikan. |
| 2026-10-30 | Struktur halaman dirapikan tanpa mengubah angka: tabel tagihan dan kartu mini dipisah ke komponen; margin, runway, dan rekonsiliasi memakai fungsi bersama. Bagian 8 diganti judulnya menjadi tabel tagihan dua tab dan ditambah cara pakai tabel. |
| 2026-10-30 | Kartu baru Revenue by Entity (donut) di Summary, di sebelah Composition; Cash Flow menjadi selebar penuh saat kartu tampil. Bagian 1 (peta), 3, 7, dan 11 diperbarui. Tabel Revenue by Entity ditambahkan di halaman Revenue (D40). |
| 2026-10-30 | Struktur halaman dirapikan tanpa mengubah angka atau tampilan: empat kartu atas dan grafik dipindah ke `SummaryKpiRow` dan `SummaryCharts` (bagian 11). |
