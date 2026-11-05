# Halaman Summary — Data, Query & Rumus

> **Tujuan:** bahan konfirmasi ke tim finance. Menjelaskan untuk setiap kartu di halaman Summary: data apa yang diambil, query apa yang berjalan, bagaimana angka dihitung, dan hal yang perlu dipastikan.
>
> **Status dokumen:** disusun dari membaca kode dan `docs/data-model.md` / `docs/decisions.md`. **Belum diverifikasi** dengan menjalankan query ke database. Bila ada selisih dengan `decisions.md` / `data-model.md`, dokumen itu yang menang.
>
> **Aturan pemeliharaan:** dokumen ini **harus diperbarui setiap kali halaman Summary berubah** (kartu baru, rumus berubah, sumber data berubah, kartu dihapus). Tambahkan baris di [Riwayat Perubahan](#riwayat-perubahan) dan perbarui tanggal di bawah.
>
> **Query SQL lengkap untuk developer:** lihat [`summary-queries.md`](./summary-queries.md). Kedua dokumen harus diperbarui bersamaan.
>
> **Terakhir diperbarui:** 2026-11-05

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

| Pilihan periode                       | Tanggal acuan                                         |
| ------------------------------------- | ----------------------------------------------------- |
| Bulan ini, Kuartal ini, YTD, 12 bulan | Hari ini                                              |
| Bulan lalu                            | Akhir bulan lalu                                      |
| Rentang kustom                        | Akhir bulan terakhir yang dipilih (maksimal hari ini) |

**Filter entitas** menentukan lokasi (`pos_location`) mana yang dijumlahkan. Penjumlahan biasa, **tanpa eliminasi antar-entitas**.

**Aturan akuntansi:**

- Hanya jurnal `posted_status = 1` (dan `canceled_date` kosong, bila tabel `gl` punya kolom itu). Jurnal draft **tidak** dihitung.
- Jurnal pembalik ikut dihitung bersama jurnal aslinya (saling meniadakan).
- Tanda angka mengikuti sisi alami kelompok akun (`account_group`), bukan `coa.saldo_normal`:
  - Harta, Harga Pokok Penjualan (HPP), Beban → debit − kredit.
  - Utang, Modal, Pendapatan → kredit − debit.
- Angka **bulanan** memakai `gl.period_id`; angka **per tanggal** (saldo kas) memakai `gl.trans_date`.
- Daftar akun Kas, Bank, Deposito, Dana transit, Biaya Tetap **tidak ditulis mati di kode**. Diambil dari Settings › Account Mapping (`system_main`, baris `DASHBOARD_ACCOUNT_MAPPING`).
- Periode berstatus **Closed** dibaca dari tabel salinan `dash_snap_gl_monthly` bila sudah dibangun. Periode Open / Pre Closed selalu dibaca langsung dari ERP. Salinan itu tidak dianggap final: bila admin membuka kembali lalu menutup ulang sebuah periode (atau jumlah jurnalnya berubah), salinan periode itu dibangun ulang otomatis di latar belakang, kira-kira pada siklus refresh berikutnya (default 10 menit) untuk dua periode Closed terbaru dan paling lama sekitar 6 jam untuk periode yang lebih lama. Koreksi angka di dalam jurnal lama yang tidak mengubah jumlah jurnal baru terlihat setelah bangun ulang manual (keputusan D43).
- Banner peringatan muncul bila rentang memuat periode Open / Pre Closed, atau ada bulan tanpa baris periode.
- Halaman memuat secara **bertahap**: empat kartu atas (Cash Position, Revenue, Net Profit, Payables) tampil lebih dahulu sehingga pengguna langsung melihat ringkasan utama, lalu bagian grafik (Cash Flow, Composition, Revenue by Entity) dan kartu mini (Runway, Gross/Net Margin, Current Ratio) menyusul dengan skeleton saat memuat. Hasil metrik yang berumur lebih dari 60 detik tetap ditampilkan seketika (_stale-while-revalidate_) dan dihitung ulang di belakang layar (maksimal sekitar 4 menit lebih tua; dapat diatur lewat `METRIC_FRESH_SECONDS` dan `METRIC_STALE_SECONDS`; `METRIC_STALE_SECONDS=0` mematikan masa basi). Tombol "Perbarui sekarang" di sidebar mengosongkan seluruh cache metrik agar pengguna langsung mendapat angka terkini. Keterbatasan: karena metrik saling memakai hasil satu sama lain, angka di kartu dan di drill-down-nya dapat dihitung pada saat berbeda dan selisihnya bisa sebesar masa basi (dulu paling lama 60 detik); hasil yang dihitung ulang di belakang layar juga bisa memakai metrik dalam yang sendiri masih berasal dari cache basi, sehingga umurnya bisa melebihi 4 menit (paling buruk mendekati dua kali lipat). Bila keduanya harus identik, tunggu sampai segar atau tekan "Perbarui sekarang".

**Peta isi halaman:**

| Komponen                      | Layanan (service)                                               | Sumber data utama                                                                                  |
| ----------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cash Position                 | `cash-position.service.ts`                                      | `coa`, `system_main`, `periode`, `coa_opening_balance_location`, `gl`, `gl_detail`, `bank_payment` |
| Revenue                       | `revenue.service.ts`                                            | `gl`, `gl_detail`, `coa`                                                                           |
| Net Profit                    | `pnl.service.ts`                                                | `gl`, `gl_detail`, `coa`                                                                           |
| Payables                      | `ap-aging.service.ts`                                           | `ap_ar_card`, `ap_ar_card_detail`, `vendor` (via snapshot `dash_*`)                                |
| Cash Flow                     | `cash-flow.service.ts`                                          | `gl`, `gl_detail`, `cash_flow_setup`, `cash_flow_group`                                            |
| Composition                   | `revenue.service.ts`, `pnl.service.ts`, `fixed-cost.service.ts` | `gl`, `gl_detail`, `coa`, `system_main`                                                            |
| Revenue by Entity             | `revenue.service.ts`                                            | `gl`, `gl_detail`, `coa`, `segment_detail`, `pos_location`                                         |
| Tabel tagihan (dua tab)       | `payment-plan.service.ts`                                       | AP open invoices, `bankpo_payment`, `bankpo_payment_detail`, `vendor`                              |
| Runway, Margin, Current Ratio | `runway.service.ts`                                             | Cash Position + arus kas + P&L + saldo akun                                                        |

Orkestrator: `src/server/services/summary.service.ts`. Halaman: `src/routes/_authed/summary.tsx`.

---

## 2. Cash Position (kartu hijau)

**Yang ditampilkan:** angka besar = **Kas + Bank**. Di bawahnya: Kas, Bank, lalu (dipisah garis) Deposito dan Dana dalam pencairan. Dua baris terakhir **tidak** masuk angka besar.

### Data yang diambil

| Data                                 | Tabel ERP                                            | Dipakai untuk                                                                        |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Daftar akun                          | `coa` (kode, nama, HEADER/POSTABLE, `account_group`) | Membentuk pohon akun                                                                 |
| Pengaturan keranjang akun            | `system_main`                                        | Akun mana yang dihitung sebagai Kas, Bank, Deposito, Transit                         |
| Periode                              | `periode` (tanggal, status, tabel GL)                | Memilih saldo awal dan tabel GL arsip                                                |
| Entitas                              | `pos_location`, `segment`, `segment_detail`          | Filter lokasi                                                                        |
| Saldo awal                           | `coa_opening_balance_location`                       | Titik awal saldo                                                                     |
| Mutasi                               | `gl` + `gl_detail`                                   | Transaksi setelah saldo awal                                                         |
| Dana belum cair dan giro/cek beredar | `bank_payment`                                       | Rekonsiliasi dana pencairan; giro/cek beredar tampil sebagai baris tambahan di kartu |

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

| Periode                | Status     |
| ---------------------- | ---------- |
| Januari – Agustus 2025 | Closed     |
| September 2025         | Pre Closed |
| Oktober 2025           | Open       |

Akun yang dihitung: **Bank Operasional**.

1. **Cari C.** Periode Closed yang berakhir sebelum 15 Okt: Januari sampai Agustus. Yang terakhir adalah **Agustus**. September tidak dipakai karena belum Closed.
2. **Cari P\*.** Periode tepat setelah Agustus adalah **September**. Saldo awal September di `coa_opening_balance_location` untuk Bank Operasional = **Rp1.000 jt**. Angka ini sama dengan saldo akhir Agustus, jadi seluruh transaksi Januari–Agustus sudah terwakili.
3. **Tambahkan transaksi 1 September – 15 Oktober:**

| Tanggal | Keterangan                 | Debet (masuk) | Kredit (keluar) | Dihitung?                                         |
| ------- | -------------------------- | ------------- | --------------- | ------------------------------------------------- |
| 5 Sep   | Pelanggan membayar         | 500 jt        |                 | Ya                                                |
| 12 Sep  | Bayar supplier             |               | 300 jt          | Ya                                                |
| 30 Sep  | Bayar gaji                 |               | 200 jt          | Ya                                                |
| 3 Okt   | Setoran penjualan          | 400 jt        |                 | Ya                                                |
| 10 Okt  | Bayar sewa                 |               | 150 jt          | Ya                                                |
| 14 Okt  | Bayar vendor (masih draft) |               | 100 jt          | **Tidak**: belum posted                           |
| 16 Okt  | Pelanggan membayar         | 250 jt        |                 | **Tidak**: setelah `asOf`                         |
| 20 Agu  | Bayar listrik              |               | 80 jt           | **Tidak**: sudah termasuk di saldo awal September |

Total debet yang dihitung = 500 + 400 = **900 jt**. Total kredit yang dihitung = 300 + 200 + 150 = **650 jt**.

```
Saldo 15 Okt = saldo awal September + debet − kredit
             = 1.000 jt + 900 jt − 650 jt
             = 1.250 jt
```

Akun bank termasuk Harta (Liquid Assets), jadi debet menambah saldo dan kredit mengurangi.

**Variasi 1: bila September sudah Closed.** C = September dan P\* = Oktober. Saldo awal Oktober dipakai, lalu hanya mutasi 1–15 Oktober yang ditambahkan. Hasilnya tetap Rp1.250 jt.

**Variasi 2: "Bulan lalu" dengan `asOf` = 31 Agustus.** Agustus berakhir tepat di 31 Agustus, bukan _sebelum_ tanggal itu, jadi Agustus bukan C. C = Juli dan P\* = Agustus. Saldo = saldo awal Agustus + mutasi 1–31 Agustus. Ini mengikuti Buku Besar ERP.

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
7. Saldo kas per entitas bisa janggal karena segmen Lokasi bersifat _non-balancing_ (NBAL), misalnya tagihan satu entitas dibayar dari rekening entitas lain.
8. Apakah giro/cek beredar harus dikurangkan dari "kas yang bisa dipakai" (misalnya untuk Payment Plan)? Sekarang hanya ditampilkan sebagai informasi.

---

## 3. Revenue

- **Data:** akun grup _Revenue_ yang POSTABLE (`coa`), periode terpilih (`periode`), jumlah debet/kredit dari `gl` + `gl_detail` per akun, per periode, per lokasi.
- **Rumus:** Revenue = Σ (kredit − debet) akun Revenue pada `period_id` terpilih. _Other Revenue_ **tidak** termasuk.
- **Pembanding:** rumus yang sama untuk rentang sebelumnya dengan panjang yang sama.
- **Dipakai juga di:** donut Composition (tab Revenue) dan donut Revenue by Entity (bagian 7).
- **Penjelasan lengkap halaman Revenue** (kartu, tren, folder, tabel entitas, drill-down, contoh kasus): [`revenue-page.md`](./revenue-page.md); querynya di [`revenue-queries.md`](./revenue-queries.md).

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
- **Overdue di kartu Summary** = jumlah saldo **positif** tagihan yang sudah jatuh tempo (D37). Ditampilkan sebagai teks di bawah angka utama ("Overdue IDR …"), **tanpa** persentase perubahan: overdue bukan angka periode sebelumnya, jadi tidak dibandingkan dengan total utang. Halaman Payables menampilkan overdue **neto** per bucket (0–30, 31–60, 61–90, >90 hari), yaitu setelah kredit vendor dan pembayaran belum dialokasikan.
  - Umur = `asOf` − `due_date`. Jatuh tempo **hari ini** sudah masuk bucket 0–30.
  - `due_date` kosong → dipakai tanggal transaksi.
  - Pembayaran belum dialokasikan diumurkan berdasarkan tanggal transaksinya.
- `payment_status` sengaja **tidak** dipakai (sudah "lunas" begitu tagihan masuk dokumen Pengakuan Biaya, padahal uang belum keluar).
- Total, bucket umur, dan per vendor dijumlahkan langsung oleh database dari tabel snapshot (bukan dari daftar tagihan di memori); hasilnya sama persis dengan cara lama. Untuk tanggal yang tidak ada di snapshot atau riwayat akhir bulan, cara lama dipakai.

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
- Untuk periode yang sudah ditutup, baris jurnal kas dibaca dari tabel snapshot yang dibangun di latar belakang dan dibangun ulang otomatis bila periode itu dibuka dan ditutup ulang di ERP; angkanya tidak berubah.

**Perlu dikonfirmasi:**

- Pada jurnal campuran (sebagian tunai, sebagian piutang), hanya bagian kasnya yang dihitung.
- Klasifikasi Operating / Investing / Funding tidak tampil di Summary. Ada celah pemetaan `cash_flow_setup` (item O13 di `decisions.md`).

---

## 7. Composition (donut)

- **Tab Revenue:** Revenue per folder akun (data sama dengan kartu Revenue).
- **Tab Expense:** HPP (grup akun _Cost Of Sales_) + Beban Operasional (grup _Expense_), per folder akun teratas dari masing-masing grup, debit − kredit selama periode terpilih. Angka di tengah ("Beban usaha") = HPP + Beban Operasional, diambil dari baris yang sama dengan laporan P&L (tanpa query tambahan), sehingga **Revenue − angka ini = Operating Profit** (D42).
  - **Other Expense tidak ikut** (mis. bunga pinjaman dan selisih kurs; isinya bergantung pada CoA klien). Other Revenue juga tidak ikut di tab Revenue. Jadi kedua tab hanya memuat kegiatan usaha, dan Net Profit = Operating Profit + Other Revenue − Other Expense. Ditunda sebagai item terbuka O19.
  - Bila ada folder HPP dan folder Beban Operasional yang namanya sama, nama grupnya ditambahkan dalam kurung di legenda.
- **Tab Fixed Cost:** hanya akun di keranjang **Biaya Tetap** (Settings), per folder, debit − kredit selama periode terpilih; angka tengah "Total biaya tetap". Tab ini disembunyikan bila keranjang belum diisi. Angkanya tidak harus sama dengan tab Expense.
- **Irisan negatif (semua donut komposisi, termasuk donut Revenue di halaman Revenue):** folder bersaldo negatif (mis. retur melebihi pembelian) tidak digambar dan jumlahnya disebut dalam catatan kecil di bawah legenda; folder bersaldo nol tidak digambar dan tidak dicatat. Angka tengah tetap neto, jadi bisa lebih kecil dari jumlah irisan yang terlihat. Persentase dihitung dari irisan yang digambar. Sebelumnya donut memakai nilai mutlak.
- Batas irisan: 4 terbesar + "Lainnya". Klik irisan: tab Revenue membuka halaman Revenue, tab Expense dan Fixed Cost membuka halaman Profit & Loss, dengan filter yang sama.
- **Perlu konfirmasi (tab Expense):** (1) Apa saja isi grup Other Expense di CoA klien, dan apakah perlu masuk donut (O19)? (2) Apakah HPP diposting ke buku besar klien? Bila tidak, tab Expense hanya berisi Beban Operasional.

### Revenue by Entity (donut kedua)

- **Data:** sama dengan kartu Revenue: pembacaan mutasi yang sama (Q11 / Q12 dengan pengelompokan per lokasi `pos_location` lewat kolom segmen entitas). **Tidak ada query baru.**
- **Rumus:** Revenue per entitas = Σ (kredit − debet) akun Revenue entitas itu pada periode terpilih (rumus yang sama dengan bagian 3). _Other Revenue_ tidak termasuk.
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

- **Data:** tagihan AP bagian A dengan sisa > 0, dalam dua tab. Tanggal acuan = hari ini (bukan filter periode); filter entitas tetap berlaku. Summary tidak lagi menghitung Payment Plan 7 hari; tabel tagihan memuat datanya sendiri secara mandiri lewat `getPaymentBillsFn`.
  - **Jatuh tempo ≤ 7 hari:** jatuh tempo dari hari ini sampai hari ini + 6 hari.
  - **Lewat jatuh tempo:** jatuh tempo (atau tanggal transaksi bila kosong) sebelum hari ini, seberapa pun lamanya.
- **Kolom:**
  - Vendor (`vendor`: id, kode, nama).
  - Nomor tagihan.
  - Jatuh tempo.
  - Sisa.
  - **Status rencana bayar** dari dokumen **Pengakuan Biaya** (`bankpo_payment` tipe 0, dibuat lewat menu Seleksi Invoice di ERP). Kolom ini disembunyikan bila tidak ada dokumen tipe 0 yang aktif:
    - _Disetujui, menunggu bayar_ = Posted atau Partialy Paid.
    - _Diseleksi, belum disetujui_ = Not Posted.
    - _Belum diseleksi_ = tidak ada dokumen Pengakuan Biaya aktif.
  - **Entitas pemilik** (keterangan kecil di bawah nomor tagihan): tampil hanya bila lebih dari 1 entitas masuk filter. Namanya diambil dari lokasi (`location_id`) tagihan; tagihan yang lokasinya kosong atau tidak dikenal tampil "Tanpa entitas".
- **Cara pakai tabel:**
  - Dua tab di atas tabel menampilkan jumlah baris masing-masing; berpindah tab mengembalikan tabel ke halaman 1.
  - Tabel bisa diurutkan (vendor, jatuh tempo, sisa, status) dan dibagi per halaman.
  - Tombol ekspor CSV memuat **seluruh** baris pada tab yang sedang dipilih, dengan urutan yang sedang tampil. Kolom status ikut diekspor hanya bila kolomnya tampil; kolom Entitas (setelah kolom Vendor) ikut diekspor hanya bila keterangan entitas tampil.
  - Mengklik baris membuka halaman Payment Plan.

**Perlu dikonfirmasi:**

- Tagihan yang sudah lewat jatuh tempo dipisah ke tab sendiri. Apakah tagihan yang sangat lama (mis. > 180 hari) perlu ditandai atau ditinjau terpisah?
- Hanya tagihan positif yang sudah lewat jatuh tempo atau jatuh tempo dalam 7 hari. Kredit vendor tidak dinetto dan tagihan yang jatuh temponya lebih jauh tidak tampil, jadi total tabel tidak akan sama dengan kartu Payables.

---

## 9. Kartu mini

| Kartu             | Rumus                                                                                                | Catatan untuk finance                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Runway**        | Cash Position ÷ \|rata-rata burn\| (bulan). Burn ≥ 0 → "arus kas positif".                           | Burn = rata-rata **arus kas bersih** 3 bulan penuh sebelum bulan `asOf` (semua laci: operasional, investasi, pendanaan, termasuk pinjaman masuk). Untuk periode yang sudah ditutup, baris jurnal kas dibaca dari tabel snapshot yang dibangun di latar belakang dan dibangun ulang otomatis bila periode itu dibuka dan ditutup ulang di ERP; angkanya tidak berubah. Pembilang = Kas + Bank, sedangkan arus kas sudah termasuk Deposito. Wajar? |
| **Gross margin**  | Laba Kotor ÷ Revenue                                                                                 | Dari perhitungan P&L yang sama.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Net margin**    | Net Profit ÷ Revenue                                                                                 | Dari perhitungan P&L yang sama.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Current ratio** | Saldo seluruh akun grup _Liquid Assets_ ÷ saldo seluruh akun grup _Current Liabilities_, pada `asOf` | Pembilang bukan hanya kas, tetapi semua akun bergrup Liquid Assets. Folder Hutang Bank Jangka Panjang ikut masuk Current Liabilities sehingga rasio bisa tampak lebih buruk.                                                                                                                                                                                                                                                                     |

---

## 10. Lima hal terpenting untuk dikonfirmasi

1. Isi keranjang akun Kas, Bank, Deposito, Transit.
2. Apakah Deposito harus masuk Cash Position.
3. Apakah total Payables dan angka Cash Position sama dengan laporan ERP pada tanggal yang sama.
4. Definisi Overdue dan isi tabel tagihan (apakah tagihan lama perlu ditandai di tab "Lewat jatuh tempo").
5. Isi tab Expense di donut (HPP + Beban Operasional; Other Expense ditunda, O19), dan pembanding periode berjalan vs bulan lalu penuh.

---

## 11. Catatan developer (bukan untuk finance)

- Margin (Gross, Operating, Net) dikirim server sebagai rasio desimal (mis. "0.4") dan diformat di klien dengan `formatPercent` (D33).
- Struktur halaman: `summary.tsx` merangkai tiga bagian bertahap: empat kartu atas (`SummaryKpiRow.tsx`), grafik (`SummaryChartsSection.tsx` membungkus `SummaryCharts.tsx`), tabel tagihan (`BillsTable.tsx`), dan kartu mini (`SummaryMiniSection.tsx` membungkus `MiniMetricsBar.tsx`). Route loader hanya menanti `getSummaryHeadFn` sedangkan `getSummaryChartsFn` dan `getSummaryMiniFn` di-prefetch secara paralel di latar belakang. Teks runway dibuat oleh `runwayLabel` (`lib/finance/cash/runway-label.ts`), dipakai juga oleh halaman Cash Position.
- Rekonsiliasi GL terhadap AP/AR memakai `reconcileAging` (`lib/finance/ap-ar/aging-reconciliation.ts`): selisih di bawah Rp1 dianggap pembulatan. Pembanding AP hanya dihitung bila snapshot atau riwayat bulan mencakup tanggalnya (`agingCompareIsAvailable`).
- Filter `canceled_date` diputuskan sekali per tabel GL dan di-cache 1 jam; semua tabel GL yang dipakai dicek paralel di awal (`prefetchCanceledDateColumns`).
- Teks "terposting sampai" sempat dibuat lalu dibatalkan (D34), jadi tidak ada di halaman.
- Dihitung di server tetapi tidak ditampilkan di Summary: pembanding Cash Position, pembanding AP, rekonsiliasi GL terhadap AP. Summary tidak lagi menghitung Payment Plan 7 hari (hanya dihitung oleh tabel tagihan lewat query tersendiri).
- Untuk tanggal acuan masa lalu yang bukan akhir bulan, AP memakai query langsung ke ERP yang lambat.
- Donut Revenue by Entity: `computeRevenue` mengirim `byEntity` (dengan `id` lokasi) dan `entityUnassigned` (= total − Σ entitas); `computeSummary` meneruskannya. Pengelompokan segmen, persentase, dan baris tabel dihitung di `lib/finance/pnl/revenue-entity.ts`; persentase sisa-terbesar dan geometri cincin dipakai bersama dengan donut Composition lewat `lib/format/donut.ts`. Komponennya `components/charts/EntityDonut.tsx`, dipanggil lewat `<DonutBreakdown variant="entity">`. Kartu disembunyikan di `components/summary/SummaryCharts.tsx` (`showEntityCard`, memakai `countEntitiesWithRevenue`).
- Donut Composition: tab Expense memakai `expenseFolders` dari `computeSummary`, yaitu `buildOperatingExpenseFolders(pnl.lines)` (`lib/finance/pnl/operating-expense.ts`; folder dari baris `cogs` dan `opex` hasil `buildPnl`, tanpa query baru). Tab Fixed Cost memakai `fixedCostFolders` dan `fixedCostBasketEmpty` dari `computeFixedCost`; tab disembunyikan di `components/summary/SummaryCharts.tsx` bila keranjang kosong. Nama irisan dibuat `nameOperatingExpenseFolders`. Irisan negatif disaring `splitDrawableItems` (`lib/format/donut.ts`) di `components/charts/DonutBreakdown.tsx`.
- Keterangan entitas pada tabel tagihan: `computePaymentPlan` mengisi `entityName` tiap tagihan lewat `lib/finance/entity/entity-owner.ts` (daftar entitas dari `getCachedEntities`, tanpa query baru); `listPaymentPlanBills` mengirim `showEntity` (= `entityCount > 1`). Komponennya `components/ui/EntityCaption.tsx`; dipakai juga di drill-down (daftar tagihan Payables/Receivables/Payment Plan dan baris jurnal) tanpa mengubah angka.
- Kecepatan tabel tagihan: urutan tiap tab dan kolom, serta jumlah dan total kedua tab, dibuat sekali per hasil rencana (`createViewCache` di `lib/table/query.ts`), jadi pindah halaman atau potongan ekspor CSV tidak mengurutkan ulang. Pembanding teks memakai satu `Intl.Collator` dan pembanding saldo tidak membuat objek `Decimal` per perbandingan (hasil urutan sama). Nama vendor diingat per id selama 10 menit (`party.repo.ts`).
- Bagian atas semua halaman metrik (judul cetak dan peringatan periode terbuka/bulan kosong) ada di `components/layout/MetricPageHeader.tsx`; bahasa antarmuka dibaca lewat `useLang`.

---

## Riwayat Perubahan

| Tanggal    | Perubahan                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | Dokumen dibuat dari pembacaan kode Summary (belum ada perubahan pada halaman).                                                                                                                                                                                                                                                                                                               |
| 2026-10-30 | Ditambah tautan ke `summary-queries.md` (katalog query SQL untuk developer).                                                                                                                                                                                                                                                                                                                 |
| 2026-10-30 | Bagian Cash Position: contoh kasus lengkap cara hitung saldo akun pada `asOf` (dua variasi dan cara cadangan).                                                                                                                                                                                                                                                                               |
| 2026-10-30 | Rencana gelombang 2: filter canceled_date opsional; register dana pencairan untuk tanggal lampau; margin rasio desimal; giro beredar; tab tagihan jatuh tempo & terlambat; overdue kotor; ambang umur transit; istilah Pengakuan Biaya. Lihat D31–D38 di `decisions.md`.                                                                                                                     |
| 2026-10-30 | Fitur OCI dinonaktifkan sementara (D39): Net Profit dan margin menghitung semua akun menurut grupnya; tidak ada lagi baris OCI/Total Laba Komprehensif di P&L. Bagian 4 disesuaikan.                                                                                                                                                                                                         |
| 2026-10-30 | Struktur halaman dirapikan tanpa mengubah angka: tabel tagihan dan kartu mini dipisah ke komponen; margin, runway, dan rekonsiliasi memakai fungsi bersama. Bagian 8 diganti judulnya menjadi tabel tagihan dua tab dan ditambah cara pakai tabel.                                                                                                                                           |
| 2026-10-30 | Kartu baru Revenue by Entity (donut) di Summary, di sebelah Composition; Cash Flow menjadi selebar penuh saat kartu tampil. Bagian 1 (peta), 3, 7, dan 11 diperbarui. Tabel Revenue by Entity ditambahkan di halaman Revenue (D40).                                                                                                                                                          |
| 2026-10-30 | Struktur halaman dirapikan tanpa mengubah angka atau tampilan: empat kartu atas dan grafik dipindah ke `SummaryKpiRow` dan `SummaryCharts` (bagian 11).                                                                                                                                                                                                                                      |
| 2026-10-30 | Kartu Payables: Overdue tampil sebagai teks tanpa persentase perubahan (sebelumnya persentase dihitung terhadap total utang dan menyesatkan). Catatan tabel tagihan dilengkapi: total tabel juga berbeda dari kartu karena batas 7 hari.                                                                                                                                                     |
| 2026-10-30 | Judul empat kartu mini dan teks keterangan kecil di Summary tampil terlalu pucat (kelas warna salah); diperbaiki, tanpa perubahan angka.                                                                                                                                                                                                                                                     |
| 2026-10-31 | Tabel tagihan menampilkan keterangan entitas pemilik (nama kecil di bawah nomor tagihan) bila lebih dari 1 entitas dipilih; ekspor CSV ikut mendapat kolom Entitas (D41). Bagian 8 dan 11 diperbarui; tidak ada angka yang berubah.                                                                                                                                                          |
| 2026-10-31 | Tabel tagihan lebih cepat untuk puluhan ribu tagihan (urutan di-cache per hasil rencana, pembanding teks dan saldo dipercepat) dan nama vendor di-cache; tidak ada angka atau tampilan yang berubah. Bagian 11 diperbarui.                                                                                                                                                                   |
| 2026-11-03 | Donut Composition: tab Expense kini berisi HPP + Beban Operasional per folder (sebelumnya hanya keranjang Biaya Tetap, D42), tab Fixed Cost ditambahkan untuk isi lama, irisan negatif tidak digambar (juga di donut halaman Revenue). Other Expense ditunda (O19). Bagian 1, 7, 10, dan 11 diperbarui.                                                                                      |
| 2026-11-03 | Penataan struktur folder src (tahap 2): hanya lokasi berkas yang berubah dan rujukan jalur di dokumen ini disesuaikan (komponen donut dan keterangan entitas); tidak ada angka, rumus, atau tampilan yang berubah.                                                                                                                                                                           |
| 2026-11-03 | Penataan struktur folder src (tahap 4): hanya lokasi berkas yang berubah dan rujukan jalur di dokumen ini disesuaikan (logika donut dan kepemilikan entitas dipindah dari lib/core ke lib/format dan lib/finance/entity); tidak ada angka, rumus, atau tampilan yang berubah.                                                                                                                |
| 2026-11-04 | Bagian 3 (Revenue) diberi tautan ke dokumen halaman Revenue (`revenue-page.md`, `revenue-queries.md`); tidak ada angka, rumus, atau tampilan yang berubah.                                                                                                                                                                                                                                   |
| 2026-11-04 | Phase 1A performa: salinan `dash_snap_gl_monthly` kini dibangun ulang otomatis bila periode Closed dibuka dan ditutup ulang di ERP (sidik jari periode); penjelasan di Aturan umum diperbarui. Tidak ada rumus atau angka yang berubah bila data ERP tidak berubah.                                                                                                                          |
| 2026-11-04 | Phase 1B performa: baris jurnal kas untuk periode Closed (sumber Cash Flow dan Runway) dibaca dari snapshot dash_snap_cash_lines; penjelasan ditambahkan di bagian 6 dan 9. Tidak ada rumus atau angka yang berubah bila data ERP tidak berubah.                                                                                                                                             |
| 2026-11-04 | Phase 2 performa: Summary memuat bertahap (head, charts, mini), cache metrik stale-while-revalidate (SWR), Payment Plan 7 hari tidak lagi dihitung oleh Summary (D45). Bagian 1, 8, dan 11 diperbarui.                                                                                                                                                                                       |
| 2026-11-04 | Aturan umum: ditambahkan keterbatasan umur angka akibat cache _stale-while-revalidate_ (kartu dan drill-down bisa dihitung pada saat berbeda; umur angka bisa melebihi 10 menit pada metrik bersarang). Tidak ada rumus atau angka yang berubah.                                                                                                                                             |
| 2026-11-04 | Default `METRIC_STALE_SECONDS` diturunkan dari 600 ke 180 detik: angka yang dijawab dari cache paling lama sekitar 4 menit lebih tua (60 detik segar + 180 detik masa basi), sehingga selisih kartu dan drill-down lebih kecil. Tidak ada rumus atau query yang berubah.                                                                                                                     |
| 2026-11-04 | Pembacaan snapshot kas untuk semua entitas disederhanakan (tanpa penyaring jurnal); hanya cara query dijalankan yang berubah. Tidak ada rumus atau angka yang berubah.                                                                                                                                                                                                                       |
| 2026-11-05 | Phase 4 performa: total, bucket umur, dan per vendor untuk Payables dijumlahkan langsung oleh database dari tabel snapshot (`dash_snap_ap_ar_*` dan `dash_snap_ap_ar_hist_*`); ringkasan Payment Plan juga diagregasi langsung di SQL; memori tidak lagi memuat ratusan ribu baris tagihan terbuka; fallback otomatis ke cara lama bila di luar cakupan snapshot (D47). Bagian 5 diperbarui. |
