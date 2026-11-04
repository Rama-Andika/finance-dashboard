# Halaman Revenue (Pendapatan) — Data, Query & Rumus

> **Tujuan:** bahan konfirmasi ke tim finance. Menjelaskan untuk setiap bagian di halaman Revenue: data apa yang diambil, query apa yang berjalan, bagaimana angka dihitung, dan hal yang perlu dipastikan.
>
> **Status dokumen:** disusun dari membaca kode dan `docs/data-model.md` / `docs/decisions.md`. **Belum diverifikasi** dengan menjalankan query ke database. Bila ada selisih dengan `decisions.md` / `data-model.md`, dokumen itu yang menang.
>
> **Aturan pemeliharaan:** dokumen ini **harus diperbarui setiap kali halaman Revenue berubah**, atau setiap kali ada perubahan di tempat lain yang mengubah angka atau query halaman ini (kartu baru, rumus berubah, sumber data berubah, aturan periode atau entitas berubah, drill-down berubah). Tambahkan baris di [Riwayat Perubahan](#riwayat-perubahan) dan perbarui tanggal di bawah. Perubahan di halaman Summary yang menyentuh Revenue (kartu Revenue, donut Composition tab Revenue, donut Revenue by Entity) juga harus tercatat di sini.
>
> **Query SQL lengkap untuk developer:** lihat [`revenue-queries.md`](./revenue-queries.md). Kedua dokumen harus diperbarui bersamaan. Aturan umum yang sama dengan Summary (tanggal acuan, entitas, jurnal posted) dijelaskan lagi di bagian 1 supaya dokumen ini bisa dibaca sendiri; penjelasan kartu Revenue di Summary ada di [`summary-page.md`](./summary-page.md) bagian 3 dan 7.
>
> **Terakhir diperbarui:** 2026-11-04

## Daftar isi

1. [Aturan umum](#1-aturan-umum)
2. [Peta isi halaman](#2-peta-isi-halaman)
3. [Kartu Revenue (angka utama dan pembanding)](#3-kartu-revenue)
4. [Kartu Top Category dan Top Entity](#4-kartu-top-category-dan-top-entity)
5. [Grafik tren bulanan](#5-grafik-tren-bulanan)
6. [Donut komposisi pendapatan](#6-donut-komposisi-pendapatan)
7. [Tabel Rincian Folder Pendapatan](#7-tabel-rincian-folder-pendapatan)
8. [Tabel Pendapatan per Entitas](#8-tabel-pendapatan-per-entitas)
9. [Drill-down (klik folder sampai baris jurnal)](#9-drill-down)
10. [Contoh kasus](#10-contoh-kasus)
11. [Hal terpenting untuk dikonfirmasi](#11-hal-terpenting-untuk-dikonfirmasi)
12. [Catatan developer](#12-catatan-developer-bukan-untuk-finance)
13. [Riwayat Perubahan](#riwayat-perubahan)

---

## 1. Aturan umum

**Revenue di halaman ini adalah pendapatan menurut pembukuan (buku besar), bukan uang yang sudah diterima.** Angkanya dari jurnal yang tercatat di akun-akun pendapatan, jadi penjualan kredit yang belum dibayar pelanggan tetap masuk.

**Periode.** Filter periode diubah menjadi daftar periode akuntansi (`periode`), satu periode reguler per bulan. Angka dijumlah per **`gl.period_id`** (periode pencatatan jurnal), **bukan** per tanggal transaksi. Jurnal yang tanggal transaksinya mundur tetapi dicatat di periode lain mengikuti periode pencatatannya, sama dengan laporan resmi ERP (data-model §4.6).

| Pilihan periode | Bulan yang dihitung | Pembanding (rentang yang dipakai sebagai "sebelumnya") |
|---|---|---|
| Bulan ini | Bulan berjalan (seluruh bulan, termasuk hari yang belum terjadi: belum ada jurnalnya, jadi sama dengan "sampai hari ini") | **Seluruh** bulan lalu |
| Bulan lalu | Bulan lalu penuh | Bulan sebelum itu, penuh |
| Kuartal ini | Awal kuartal sampai bulan berjalan | **Seluruh** kuartal lalu (3 bulan penuh) |
| YTD | Januari sampai bulan berjalan | Bulan yang sama (Januari sampai bulan itu, **penuh**) tahun lalu |
| 12 bulan | 12 bulan berakhir di bulan berjalan | 12 bulan sebelumnya (penuh) |
| Rentang kustom (maks. 60 bulan) | Bulan awal sampai bulan akhir yang dipilih | Rentang dengan panjang sama yang berakhir tepat sebelum bulan awal |

**Periode 13** (penyesuaian akhir tahun) ikut dihitung hanya bila toggle "Termasuk penyesuaian akhir tahun" aktif **dan** rentangnya YTD, 12 bulan, atau kustom. Periode 13 dihitung bila tanggal akhirnya jatuh di dalam rentang.

**Filter entitas** menentukan lokasi (`pos_location`) mana yang dijumlahkan. Penjumlahan biasa, **tanpa eliminasi antar-entitas**: penjualan antar-entitas dalam satu grup, bila dicatat sebagai pendapatan, ikut terhitung dua kali di total gabungan.

**Aturan akuntansi:**
- Hanya jurnal `posted_status = 1` (dan `canceled_date` kosong, bila tabel `gl` punya kolom itu). Jurnal draft **tidak** dihitung.
- Jurnal pembalik ikut dihitung bersama jurnal aslinya (saling meniadakan).
- Tanda angka mengikuti sisi alami kelompok akun: Pendapatan (grup *Revenue*) = **kredit − debet**. Penjualan menambah, retur dan diskon yang didebet pada akun pendapatan mengurangi.
- Hanya akun grup **Revenue** yang berstatus **POSTABLE** (akun yang bisa dijurnal, bukan folder). **Other Revenue (pendapatan lain-lain) tidak termasuk.**
- Saldo awal (`coa_opening_balance_location`) **tidak dipakai** untuk pendapatan. Akun laba-rugi dihitung dari mutasi periode saja; saldo awal tabel akun laba-rugi memang tidak cocok dengan jumlah buku besar (data-model §4.5).
- Periode berstatus **Closed** dibaca dari tabel salinan `dash_snap_gl_monthly` bila sudah dibangun (dan hasilnya diingat di memori server, dengan batas jumlah entri dan waktu). Salinan itu tidak dianggap final: bila admin membuka kembali lalu menutup ulang sebuah periode (atau jumlah jurnalnya berubah), salinan periode itu dibangun ulang otomatis di latar belakang dan hasil yang diingat untuk build lama tidak dipakai lagi. Periode **Open / Pre Closed** selalu dibaca langsung dari ERP dan tidak pernah diingat, karena angkanya masih bisa berubah.
- Banner peringatan di atas halaman muncul bila rentang memuat periode Open / Pre Closed ("angka bisa berubah"), atau ada bulan yang tidak punya baris periode reguler (daftar bulannya ditampilkan).

---

## 2. Peta isi halaman

Halaman: `src/routes/_authed/revenue.tsx`. Semua angka berasal dari **satu hasil server** (`getRevenueFn` → `computeRevenue`), kecuali drill-down yang membaca lagi saat diklik.

| Bagian di layar | Judul layar (ID / EN) | Diambil dari hasil | Sumber data utama |
|---|---|---|---|
| Kartu 1 | Pendapatan / Revenue | `total`, `compareTotal` | `gl`, `gl_detail`, `coa` |
| Kartu 2 | Kategori Terbesar / Top Category | `byFolder` | sama |
| Kartu 3 | Entitas Terbesar / Top Location | `byEntity` | + `segment_detail`, `pos_location` |
| Grafik batang | Tren Pendapatan Bulanan / Monthly Revenue Trend | `trend` | sama, per periode |
| Donut | Komposisi Pendapatan / Revenue Composition | `byFolder` | sama |
| Tabel 1 | Rincian Folder Pendapatan / Revenue by Folder | `byFolder` | sama |
| Tabel 2 | Pendapatan per Entitas / Revenue by Entity | `byEntity`, `entityUnassigned` | sama |
| Panel drill-down | (sheet samping) | dibaca saat klik | `gl`, `gl_detail`, `coa`, `pos_location` |

Server: `src/server/services/pnl/revenue.service.ts`. Logika hitung murni: `src/lib/finance/pnl/revenue.ts` dan `revenue-entity.ts`. Komponen: `src/components/revenue/`.

Hasil server di-cache 60 detik (per kombinasi filter). Mengganti entitas, periode, atau toggle Periode 13 memicu hitung ulang bila belum ada di cache.

---

## 3. Kartu Revenue

**Yang ditampilkan:** angka besar = total Revenue periode terpilih (singkat, mis. "1,26 M", dengan angka penuh saat kursor diarahkan). Di bawahnya: persentase perubahan dan teks pembanding.

### Data yang diambil

| Data | Tabel ERP | Dipakai untuk |
|---|---|---|
| Daftar akun | `coa` (kode, nama, HEADER/POSTABLE, `account_group`) | Menentukan akun mana yang termasuk Revenue dan membentuk folder |
| Periode | `periode` (tanggal, status, tabel GL, tipe) | Mengubah filter menjadi `period_id` dan memilih tabel GL arsip |
| Entitas | `pos_location`, `segment`, `segment_detail` | Filter lokasi dan pembagian per entitas |
| Mutasi pendapatan | `gl` + `gl_detail` | Debet dan kredit per akun, per periode, per lokasi |
| Mutasi periode pembanding | `gl` + `gl_detail` | Total pembanding |
| Pengaturan keranjang akun | `system_main` | Hanya ikut terbaca di jalur pembanding (lihat catatan developer); tidak memengaruhi angka Revenue |

### Query yang berjalan (bahasa biasa)

1. Ambil daftar akun, periode, dan entitas dari cache (10 menit).
2. **Mutasi periode terpilih:** satu query agregat per tabel GL: jumlah debet dan jumlah kredit untuk **akun Revenue saja**, dikelompokkan per akun, per periode, dan per lokasi, dari jurnal posted pada periode terpilih (dan hanya segmen entitas terpilih bila entitas difilter). Periode Closed yang sudah ada di snapshot dibaca dari snapshot (kecil dan cepat).
3. **Mutasi periode pembanding:** pembacaan bersama yang sama dengan halaman P&L: semua akun laba-rugi (bukan hanya Revenue) untuk periode pembanding, dikelompokkan per akun dan per periode. Akun Revenue disaring dari hasil ini di memori.

### Rumus

```
Revenue = Σ (kredit − debet)  semua baris akun Revenue POSTABLE pada periode terpilih
Pembanding = rumus yang sama pada periode pembanding (bagian 1)
Perubahan % = (Revenue − Pembanding) ÷ |Pembanding| × 100
```

- Pembanding = 0 → persentase tidak ditampilkan.
- Teks pembanding di bawah angka: "Bulan lalu", "Bulan sebelumnya", "Kuartal lalu", "Periode sama tahun lalu", "12 bulan sebelumnya", atau "Periode sebelumnya" (kustom), diikuti angka pembanding singkat.
- Warna perubahan: naik = baik (hijau), turun = buruk.
- Semua penjumlahan memakai `decimal.js` tanpa pembulatan di tengah; pembulatan 2 desimal dilakukan di akhir.

### Perlu dikonfirmasi ke finance

1. Apakah **semua** pendapatan usaha memang berada di akun grup *Revenue*? Terutama: apakah akun **retur penjualan** dan **diskon penjualan** berada di grup Revenue (sehingga angkanya neto)? Bila ada di grup *Expense* atau *Cost Of Sales*, Revenue di sini tampil bruto dan lebih besar dari laporan ERP.
2. Apakah **Other Revenue** (jasa giro, pendapatan lain-lain, dsb.) memang sengaja tidak ikut? Itu mengikuti definisi di `data-model` §6.1.
3. Untuk "Bulan ini", pembandingnya bulan lalu **penuh**, sedangkan angka berjalan baru sampai hari ini, jadi biasanya tampak turun di awal bulan. Hal yang sama untuk Kuartal, YTD, dan 12 bulan (pembanding selalu bulan penuh). Apakah ini yang diinginkan, atau pembandingnya dipotong sampai tanggal yang sama?
4. Penjualan antar-entitas dalam grup: apakah dicatat sebagai pendapatan di kedua sisi? Sekarang **tidak ada eliminasi**.
5. Apakah angka sama dengan laporan Laba Rugi ERP (versi "generate") untuk periode dan entitas yang sama?

---

## 4. Kartu Top Category dan Top Entity

- **Kategori Terbesar (Top Category):** folder pendapatan dengan jumlah terbesar (lihat bagian 7 untuk cara folder dibentuk). Angka = total folder itu; teks di bawah = nama folder. Tanpa persentase perubahan. **Klik kartu** membuka drill-down folder itu (bagian 9).
- **Entitas Terbesar (Top Location di tampilan Inggris):** entitas dengan Revenue terbesar. Angka = Revenue entitas itu; teks di bawah = nama entitas. **Tidak bisa diklik**, tanpa pembanding. Revenue yang tidak punya lokasi ("Tanpa entitas") tidak ikut dipilih.
- Bila daftar kosong, kartu menampilkan 0 dan teks "—".
- "Terbesar" = nilai tertinggi menurut angka (bukan nilai mutlak). Bila semua folder atau entitas bernilai negatif, yang tampil adalah yang paling mendekati nol.
- Kedua kartu mengikuti **filter entitas**: bila hanya satu entitas dipilih, Entitas Terbesar tentu entitas itu.

**Perlu dikonfirmasi:** apakah "Top Location" sebaiknya diberi nama "Top Entity" di tampilan Inggris (di Indonesia sudah "Entitas Terbesar")? Hanya soal istilah, bukan angka.

---

## 5. Grafik tren bulanan

- **Data:** sama dengan kartu Revenue, tetapi dikelompokkan per periode lalu dijumlah **per bulan kalender**: setiap periode dimasukkan ke bulan **tanggal mulainya**. Periode 13 (bila ikut) jatuh ke bulan tanggal mulainya.
- **Sumbu:** satu batang per bulan yang ada di filter (bulan tanpa jurnal tampil 0). Judul kartu menampilkan total periode (angka singkat), sama dengan kartu Revenue.
- **Tooltip:** nama bulan dan angka penuh.
- **Batang negatif:** bila total bulan negatif (retur lebih besar dari penjualan), batangnya digambar setinggi 0, tetapi tooltip tetap menampilkan angka sebenarnya. Hanya soal gambar.
- Tidak ada garis pembanding dan tidak ada tren harian: halaman ini memakai periode (bulanan), bukan tanggal transaksi.

**Perlu dikonfirmasi:** apakah Periode 13 sebaiknya muncul sebagai batang terpisah, atau digabung ke Desember seperti sekarang?

---

## 6. Donut komposisi pendapatan

- **Data:** sama dengan tabel folder (bagian 7), tanpa query tambahan. Nama di tengah: "Total pendapatan"; label periode = bulan dari tanggal acuan (`asOf`).
- **Aturan gambar** (sama dengan donut Composition di Summary, `summary-page.md` bagian 7):
  - 4 folder terbesar + satu segmen "Lainnya".
  - Folder bersaldo negatif tidak digambar dan dicatat dalam catatan kecil di bawah legenda; folder nol tidak digambar dan tidak dicatat.
  - Angka tengah tetap **neto** (total sebenarnya), sehingga bisa lebih kecil dari jumlah irisan yang terlihat.
  - Persentase dibulatkan dengan metode sisa terbesar, total selalu 100.
- **Klik irisan:** membuka drill-down folder itu.

---

## 7. Tabel Rincian Folder Pendapatan

- **Kolom:** Kategori / Folder dan Total (Rp), angka penuh, rata kanan, negatif dalam kurung. Klik baris membuka drill-down folder. Ada ekspor CSV dan cetak.
- **Rumus per folder:**
  ```
  Total folder = Σ (kredit − debet) semua akun Revenue POSTABLE di bawah folder itu
  ```
  Setiap akun ikut dalam hasil server (dengan kode dan nama) walau tabel hanya menampilkan folder; rinciannya dibuka lewat drill-down.

### Cara folder ditentukan (penting untuk finance)

Folder **tidak ditulis mati** di kode. Sistem membentuknya dari pohon akun (`coa`):

1. Ambil semua akun POSTABLE grup Revenue.
2. Untuk setiap akun, naik ke induknya selama **seluruh isi induk itu** (semua akun POSTABLE di bawahnya) berstatus grup Revenue. Berhenti di induk tertinggi yang masih "murni Revenue".
3. Bila hasilnya satu induk tunggal, **folder = anak langsung dari induk itu**. Bila induk itu tidak punya anak, induk itu sendiri menjadi satu-satunya folder.
4. Bila hasilnya beberapa induk berbeda, **setiap induk itu menjadi satu folder**.

Akibatnya: kalau akun di bawah folder "Pendapatan Usaha" ada yang bukan Revenue (misalnya akun diskon yang diset grup Expense), folder itu tidak murni, dan pembagian folder bisa berubah. Folder berganti nama atau akun dipindah induknya, tampilan halaman ikut berubah tanpa perubahan kode.

- Akun yatim (induk tidak dikenal) dikecualikan.
- Akun POSTABLE yang langsung di bawah induk murni ikut tampil sebagai "folder" tersendiri.
- Folder dan akun tanpa mutasi tetap tampil dengan 0.00 di tabel dan tidak digambar di donut.

**Perlu dikonfirmasi:**
1. Apakah daftar folder yang tampil sama dengan cara finance mengelompokkan pendapatan (mis. per kategori produk)?
2. Apakah ada akun Revenue yang induknya bercampur dengan grup lain? Bila ada, minta dirapikan di CoA agar folder stabil.

---

## 8. Tabel Pendapatan per Entitas

- **Data:** pembacaan mutasi yang sama dengan kartu Revenue; hanya pengelompokannya per **lokasi** (`pos_location`), lewat kolom segmen entitas pada baris jurnal (`gl_detail.segment1_id`) → `segment_detail.location_id`. **Tidak ada query tambahan.**
- **Kolom:** Entitas, Total (Rp), Porsi. Ekspor CSV memuat Entitas, Total, Porsi (dalam persen, 2 desimal). Tidak ada drill-down dari tabel ini.
- **Baris:** semua entitas yang masuk filter (bukan hanya yang punya pendapatan), dari yang terbesar. Urutan sama nilai: nama lalu id, supaya stabil.
- **Baris "Tanpa entitas":** pendapatan yang jurnalnya tidak punya lokasi (atau lokasinya tidak ada di daftar entitas). Dihitung sebagai `Total Revenue − Σ semua baris entitas`. Baris ini hanya tampil bila selisihnya tidak nol, dan selalu paling bawah.
- **Porsi:**
  ```
  basis = Σ (entitas bernilai > 0) + (Tanpa entitas bila > 0)
  porsi = nilai ÷ basis        (hanya untuk nilai > 0; selain itu "—")
  ```
  Entitas bernilai nol atau negatif tampil di tabel dengan porsi "—", tetapi tidak masuk basis, jadi porsi yang tampil selalu berjumlah 100% dari yang positif.
- **Perilaku bila filter hanya satu entitas:** tabel hanya berisi entitas itu. Pendapatan tanpa lokasi **tidak ikut sama sekali** (jurnal tanpa lokasi dikeluarkan oleh filter), jadi tidak ada baris "Tanpa entitas".

**Perlu dikonfirmasi:**
1. Apakah pendapatan **tanpa lokasi** memang ada di data klien? Bila ada, mengapa tidak diberi lokasi, dan bagaimana finance ingin menanganinya?
2. Segmen Lokasi bersifat *non-balancing* (NBAL), jadi pendapatan per entitas mengikuti lokasi yang dipilih operator di jurnal. Apakah lokasi pada jurnal penjualan sudah benar?

---

## 9. Drill-down

Klik folder (di tabel, donut, atau kartu Kategori Terbesar) membuka panel samping. Status drill-down disimpan di URL (`drill`), jadi bisa dibagikan. Semua level memakai **filter yang sama** dengan halaman (periode, entitas, jurnal posted).

| Level | Isi | Cara hitung |
|---|---|---|
| 1. Folder → akun | Daftar akun Revenue di bawah folder (kode, nama, jumlah) | Σ (kredit − debet) per akun; akun bernilai 0 tidak tampil; urut kode |
| 2. Akun → entitas | Jumlah akun itu per entitas | Sama, dikelompokkan per lokasi. Dilewati bila filter hanya satu entitas |
| 3. Entitas / akun → jurnal | Daftar baris jurnal: nomor jurnal, tanggal, jenis, keterangan, debet, kredit | Baris jurnal posted dari periode terpilih untuk akun (dan entitas) itu, terbaru dulu, 200 baris per halaman |

- Bila lebih dari 1 entitas ada di filter dan level jurnal dibuka, setiap baris diberi keterangan nama entitas kecil dan baris dipecah per entitas.
- Angka di drill-down tidak menyaring per tanggal transaksi, tetapi per periode pencatatan (`period_id`), sama dengan halaman.
- Jumlah baris di level jurnal adalah **per baris akun per jurnal**: satu jurnal yang menyentuh akun pendapatan dua kali dalam satu akun dijumlahkan jadi satu baris.

**Perlu dikonfirmasi:** apakah nomor jurnal, jenis jurnal, dan keterangan yang tampil cukup untuk menelusuri selisih ke ERP?

---

## 10. Contoh kasus

Angka di bawah hanya ilustrasi. **Periode = Oktober 2025**, semua entitas, tanggal acuan 31 Oktober 2025. Bulan September 2025 dipakai sebagai pembanding ("Bulan sebelumnya").

Akun pendapatan di CoA (semua grup Revenue):

| Folder | Akun | Debet | Kredit | Kredit − Debet |
|---|---|---|---|---|
| Penjualan Makanan | Penjualan Makanan | 0 | 900 jt | 900 jt |
| Penjualan Makanan | Retur Penjualan Makanan | 30 jt | 0 | **−30 jt** |
| Penjualan Minuman | Penjualan Minuman | 10 jt | 400 jt | 390 jt |

```
Folder Penjualan Makanan = 900 − 30 = 870 jt
Folder Penjualan Minuman = 390 jt
Revenue                  = 870 + 390 = 1.260 jt
```

Per entitas (lokasi dari baris jurnal):

| Entitas | Revenue |
|---|---|
| Cabang A | 700 jt |
| Cabang B | 500 jt |
| Tanpa lokasi di jurnal | (tidak ada barisnya) |

```
Σ entitas      = 700 + 500 = 1.200 jt
Tanpa entitas  = 1.260 − 1.200 = 60 jt
Porsi A = 700 ÷ (700 + 500 + 60) = 55,6%    Porsi B = 39,7%    Tanpa entitas = 4,8%
```

Pembanding (September 2025 penuh, bila Revenue-nya 1.000 jt):

```
Perubahan = (1.260 − 1.000) ÷ 1.000 = +26,00%   (tampil hijau)
```

**Hal yang tidak dihitung dalam contoh ini:** jurnal draft; jurnal yang periodenya di luar Oktober walau tanggal transaksinya Oktober; akun Other Revenue (mis. jasa giro).

**Kartu lain pada contoh yang sama:** Kategori Terbesar = Penjualan Makanan (870 jt). Entitas Terbesar = Cabang A (700 jt). Batang Oktober = 1.260 jt.

---

## 11. Hal terpenting untuk dikonfirmasi

1. Isi grup akun *Revenue* di CoA: retur dan diskon penjualan ada di dalamnya (neto) atau di grup lain (bruto)?
2. Other Revenue memang tidak masuk Revenue di halaman ini.
3. Pembanding periode berjalan (bulan, kuartal, YTD) memakai periode lalu **penuh**, bukan dipotong sampai tanggal yang sama.
4. Tidak ada eliminasi penjualan antar-entitas dalam total gabungan.
5. Pendapatan tanpa lokasi (baris "Tanpa entitas") dan cara menanganinya.
6. Angka sama dengan laporan Laba Rugi ERP untuk periode dan entitas yang sama, termasuk saat ada periode Open / Pre Closed.
7. Folder pendapatan yang tampil (dibentuk otomatis dari pohon akun) sesuai pengelompokan finance.

---

## 12. Catatan developer (bukan untuk finance)

- Alur: `revenue.tsx` (loader) → `revenueMetricOptions` (`queries/metrics.queries.ts`) → `getRevenueFn` (`functions/pnl/revenue.fn.ts`, `authMiddleware` + validator zod + `resolveFilter`) → `computeRevenue` (`server/services/pnl/revenue.service.ts`, dibungkus `memoMetric('revenue', …)`, 60 detik).
- `computeRevenue` melakukan dua pembacaan paralel: (1) `movementsByPeriods` dengan `coaIds` = POSTABLE grup Revenue, `byPeriod: true`, `byLocation: true`; (2) bila pembanding ada, `loadPlMovements(filter, compare.periodIds)` yang membaca **semua akun P&L + akun keranjang Biaya Tetap** per periode (tanpa `byLocation`) dan disaring ke akun Revenue di memori dengan `onlyAccounts`. Pembacaan (2) dibagi dengan halaman P&L, Fixed Cost, dan Budget lewat `memoMetric('plMovements', …)`; itu sebabnya Q5 (pengaturan keranjang) ikut terbaca di jalur pembanding. Bila `revenueCoaIds` kosong atau tidak ada periode, hasil kosong dikembalikan tanpa query (tren tetap berisi bulan dengan 0).
- Perhitungan murni di `lib/finance/pnl/revenue.ts`: `groupFolders` (pembentukan folder), `buildRevenueBreakdown` (folder + anak akun), `aggregateRevenue` (satu putaran: total, per akun, per periode, per lokasi), `sumNetRevenue` (pembanding), `revenueTrend`, `splitRevenueByEntity`. Tanda diambil dari `signedDecimal('Revenue', …)` di `lib/finance/coa/sign.ts` (grup sisi kredit → kredit − debet).
- Pembulatan: total dihitung dari baris mentah lalu `toFixed(2)` sekali. Angka per akun dibulatkan 2 desimal sebelum dijumlah menjadi folder, dan per lokasi dibulatkan sebelum "Tanpa entitas" dihitung sebagai selisih. Bila ERP menyimpan lebih dari 2 desimal, jumlah folder bisa berbeda beberapa sen dari total. Pada data berdesimal 2 digit, tidak ada selisih.
- `entityUnassigned` = `total − Σ byEntity`; nilai bisa negatif. `byEntity` memuat semua entitas dalam filter (`entitiesOfFilter`), termasuk yang bernilai 0.
- Baris jurnal tanpa lokasi: `LEFT JOIN segment_detail` menghasilkan `locationId = NULL`; `aggregateRevenue` hanya menambah `byLocation` bila `locationId` terisi, sehingga baris itu hanya masuk total (dan akhirnya "Tanpa entitas"). Di snapshot, kolom entitas yang kosong disimpan sebagai `segment_id = 0`, yang juga tidak punya `segment_detail`.
- Tabel entitas dan donut Revenue by Entity di Summary memakai `lib/finance/pnl/revenue-entity.ts` (`buildEntityTableRows`, `buildEntityShare`). Donut folder memakai `components/charts/DonutBreakdown.tsx` (`splitDrawableItems`, `buildDonutDisplayItems` dengan maks. 5 segmen termasuk "Lainnya").
- Kartu atas: `components/revenue/RevenueKpiRow.tsx`; `largestByAmount` (`lib/core/money.ts`) memilih nilai terbesar; persentase dari `computeChangePercent` (`lib/format/kpi.ts`, `decimal.js`, pembagi = |pembanding|).
- Grafik: `components/revenue/MonthlyTrendChart.tsx`. Recharts butuh angka JS untuk tinggi batang (`Number(...)` hanya untuk gambar, `Math.max(0, …)`); angka tooltip memakai string asli.
- Drill-down: `server/services/drill/gl-metrics.ts` (`glMetricDrill`) → `accountRows`, `entityRows`, `journalRows` di `server/services/drill/shared.ts`. Level jurnal memakai `journalLines` (`server/repo/gl/gl-journal.repo.ts`), 200 baris per halaman; bila periode tersebar di beberapa tabel GL, tiap tabel mengembalikan `offset + limit` baris lalu digabung.
- Header halaman (judul cetak, banner periode terbuka dan bulan kosong): `components/layout/MetricPageHeader.tsx`. Nama file ekspor: `exportFilename('revenue' | 'revenue-by-entity', filter)`.
- Revenue juga dipakai di: kartu Revenue dan donut Composition (tab Revenue) serta Revenue by Entity di Summary (`computeSummary` memanggil `computeRevenue`), Gross / Net margin (penyebut = Revenue dari P&L, bukan dari halaman ini: `pnl.service.ts`), dan Budget vs Actual (aktual Revenue dari pembacaan P&L bersama). **Perubahan rumus Revenue di `lib/finance/pnl/revenue.ts` harus dicatat di dokumen ini dan di `summary-page.md` / `summary-queries.md`.**

---

## Riwayat Perubahan

| Tanggal | Perubahan |
|---|---|
| 2026-11-04 | Dokumen dibuat dari pembacaan kode halaman Revenue (belum ada perubahan pada halaman). Dibuat bersama `revenue-queries.md`. |
| 2026-11-04 | Phase 1A performa: salinan `dash_snap_gl_monthly` kini dibangun ulang otomatis bila periode Closed dibuka dan ditutup ulang di ERP (sidik jari periode), dan hasil yang diingat di memori mengikuti versi build salinan itu. Penjelasan di Aturan akuntansi diperbarui. Tidak ada rumus atau angka yang berubah bila data ERP tidak berubah. |
