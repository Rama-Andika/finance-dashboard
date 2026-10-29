# Laporan Kualitas Kode — Finance Dashboard

Audit **baca-saja** terhadap commit `af57cdd` (implementasi awal) dan `92be876` (perbaikan review). Tidak ada kode yang diubah, tidak ada query ke database yang dijalankan. Semua temuan di bawah sudah saya verifikasi dengan membaca kodenya; yang masih dugaan ditandai **(perlu dicek)**.

Cara baca singkat:
- **N+1** = pekerjaan yang sama diulang berkali-kali (query atau perhitungan), padahal bisa sekali saja.
- **Spaghetti** = satu fungsi/file mengerjakan terlalu banyak hal sehingga sulit dibaca dan diubah.
- **Code smell** = kebiasaan kode yang belum salah, tetapi menimbulkan bug atau pekerjaan ekstra di kemudian hari.
- Jumlah query di bawah adalah **estimasi dari membaca kode** (jalur "tabel saldo awal ada", semua entitas, 1 bulan), bukan hasil ukur.

## 1. Ringkasan

Total **27 temuan**.

| Kategori | Tinggi | Sedang | Rendah | Jumlah |
|---|---:|---:|---:|---:|
| N+1 / query berulang | 4 | 1 | 1 | 6 |
| SQL berat / lambat | 1 | 1 | 0 | 2 |
| Risiko bug / angka salah | 0 | 2 | 1 | 3 |
| Spaghetti | 0 | 2 | 0 | 2 |
| Code smell (duplikasi, magic number, bahasa, tipe) | 0 | 6 | 7 | 13 |
| Test lemah | 0 | 1 | 0 | 1 |
| **Total** | **5** | **13** | **9** | **27** |

**Kesimpulan satu kalimat:** angka keuangannya ditangani dengan benar (string + decimal.js, tidak ada `number` untuk hitungan uang), dan tidak ada query di dalam loop per baris. Masalah utamanya adalah **pekerjaan yang sama dihitung berulang-ulang** (terutama laporan Data Checks yang jalan di setiap halaman) dan **query agregat besar yang dijalankan satu per satu**, bukan N+1 klasik.

Hal yang sudah baik (tidak perlu diubah): query per-entitas sudah digabung jadi satu (`balancesBySegmentAt`), nama vendor/customer diambil dengan `IN (...)` per 1000 (bukan per baris), semua SQL lewat parameter (tidak ada penyambungan string dari input pengguna), nama kolom segmen/tabel GL divalidasi dengan regex/whitelist, tidak ada CTE/window function/LATERAL (sesuai aturan MySQL 5.7).

## 2. Tabel temuan (urut dari paling parah)

### Tinggi

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| F-01 | N+1 / query berulang | [AppShell.tsx:22-30](../src/components/layout/AppShell.tsx), [data-checks.service.ts:44-54](../src/server/services/data-checks.service.ts) | Layout utama memanggil Data Checks di **setiap halaman** (`enabled: Boolean(user)`, hanya untuk angka badge). Data Checks menjalankan ulang 4 metrik berat (Cash Position, Cash Flow, AP Aging, AR Aging) + 5 query pemeriksaan, dengan bentuk input berbeda sehingga **tidak berbagi cache** dengan halaman yang sedang dibuka. | Membuka halaman apa pun = pekerjaan halaman itu **ditambah ±35 query** lagi (cash position ≈4, cash flow ≈9, AP ≈8, AR ≈8, 5 pemeriksaan), termasuk 2 pemindaian penuh tabel `ap_ar_card` (lihat F-08). Ini kandidat utama penyebab terasa lambat di semua halaman. | Jangan hitung ulang di setiap halaman: ambil hanya saat panel dibuka (seperti sudah dilakukan di `DataChecksPanel`), atau hitung sekali di server dengan cache beberapa menit, atau pakai hasil metrik yang sudah ada. |
| F-02 | N+1 / query berulang | [summary.service.ts:86-95](../src/server/services/summary.service.ts), [runway.service.ts:42,107,127](../src/server/services/runway.service.ts), [payment-plan.service.ts:64](../src/server/services/payment-plan.service.ts), [cash-flow.service.ts:181-189](../src/server/services/cash-flow.service.ts) | Halaman Summary menjalankan 8 metrik sekaligus, dan metrik-metrik itu saling memanggil lagi: **Cash Position dihitung 3×** (langsung, lewat Runway, lewat Payment Plan), **P&L dihitung 2×** (langsung dan lewat Runway), jurnal kas diambil 2× (Cash Flow dan Runway), saldo (`balancesAt`) dipanggil 7× dengan tanggal berdekatan. Halaman lain mengulang pola yang sama: loader Cash Position juga memanggil Runway; loader P&L memanggil P&L + Fixed Cost + Runway (P&L 2×). | Estimasi **±50 query per request Summary**, ±8 di antaranya join `gl`↔`gl_detail` (tabel 13,6 juta baris). Cache hanya melindungi periode berstatus Closed; periode bulan berjalan (Open) dihitung ulang tiap kali. | Satu "paket data bersama" per request: hitung saldo/gerakan GL sekali lalu dipakai ulang oleh Cash Position, Runway, Payment Plan, Summary. Atau cache hasil per (filter, tanggal) selama beberapa menit untuk metrik yang dipanggil metrik lain. |
| F-03 | N+1 / query berulang | [gl.repo.ts:160-179](../src/server/repo/gl.repo.ts), [gl.repo.ts:29-38](../src/server/repo/gl.repo.ts) | `movementsByPeriods` menjalankan **satu query per periode Closed** (di dalam loop `for` dengan `await`, berurutan), lalu satu query untuk semua periode Open. Kunci cache memuat daftar akun (`coaHash`) dan opsi pengelompokan, jadi P&L, Revenue, Fixed Cost, Budget, dan Drill — yang memakai himpunan akun berbeda — **masing-masing mengisi cache sendiri** untuk periode yang sama. | Rentang YTD / 12 bulan pada cache dingin = hingga **12 query × (pnl + revenue + fixed cost) ≈ 36 query berurutan**, ×2 jika ada pembanding, masing-masing mengagregasi `gl_detail`. Cache 6 jam tidak membantu antar metrik. | Satu query per tabel GL untuk semua periode Closed yang belum ter-cache (grup per periode di SQL), jalankan paralel; atau cache per periode untuk **semua akun P&L sekaligus** lalu saring di memori, supaya dipakai bersama. |
| F-04 | SQL berat / lambat | [apar.repo.ts:204-229](../src/server/repo/apar.repo.ts) (AP), [apar.repo.ts:451-476](../src/server/repo/apar.repo.ts) (AR), [apar.repo.ts:282-297](../src/server/repo/apar.repo.ts), [ap-aging.service.ts:45-46,70-71](../src/server/services/ap-aging.service.ts) | AP/AR Aging: `ap_ar_card` di-join ke dirinya sendiri lewat `ap_ar_card_detail` (invoice → detail → pembayaran), difilter `module_type`/`location_id` yang **tidak punya index** di ERP (data-model §3, decisions O11), `GROUP BY` 12 kolom + `HAVING`. Part B memakai pola `LEFT JOIN … IS NULL`. Part A, Part B, dan versi pembanding dijalankan **berurutan**, bukan paralel. Index yang dibutuhkan hanya ada sebagai skrip manual `docs/sql/dashboard-indexes.sql`. | Ini kandidat kuat untuk **±91 detik** di DB demo tanpa index (**penyebab pastinya perlu dicek** dengan `EXPLAIN`; saya tidak diperbolehkan menjalankan query). Aging juga dipanggil oleh Summary, Payment Plan, Data Checks (F-01), dan Drill, jadi lambatnya berlipat. | Pastikan index `idx_dash_apar_*` benar-benar terpasang di DB target dan dicek lewat `EXPLAIN`; ganti anti-join dengan `NOT EXISTS`; jalankan Part A/B paralel; pertimbangkan satu query gabungan. Tambahkan pemeriksaan "index sudah ada?" saat start agar tidak diam-diam lambat. |
| F-05 | N+1 / query berulang | [drill.service.ts:499,607-610](../src/server/services/drill.service.ts), [drill.service.ts:217-235](../src/server/services/drill.service.ts), [DrillSheet.tsx:85-110](../src/components/drill/DrillSheet.tsx) | Drill Cash Flow / Expense Paid memanggil `loadClassifiedPortions` (seluruh jurnal kas satu periode) di **setiap klik** langkah drill dan di **setiap "muat lagi"** (`offset` berubah → seluruh perhitungan diulang, lalu diiris di memori). Drill AP/AR mengandalkan memo 5 menit; setelah kedaluwarsa, seluruh aging dihitung ulang untuk satu klik. | Setiap klik di panel drill = biaya yang sama dengan membuka halaman Cash Flow (≈9 query, termasuk `linesOfCashJournals` yang berat). Halaman 2, 3, … dari daftar jurnal mengulang semuanya. | Cache hasil `loadClassifiedPortions` per (filter) beberapa menit di server, atau kirim hasil lengkap ke klien sekali dan paginasi di klien; untuk daftar jurnal paginasi di SQL, bukan di memori. |

### Sedang

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| F-06 | Risiko bug | [gl.repo.ts:487-557](../src/server/repo/gl.repo.ts) | `journalLines` menerapkan `LIMIT/OFFSET` **per tabel GL di dalam loop**, lalu menggabungkan hasil tanpa mengurutkan ulang; `hasMore` dihitung dari `lines.length === PAGE_SIZE`. Daftar periode juga dipotong diam-diam `slice(0, 1000)`. Query memakai `GROUP BY` + `ORDER BY` + `OFFSET` dalam pada join `gl_detail`. | Jika rentang melintasi beberapa tabel arsip (`gl_2015`, …), halaman bisa berisi lebih dari satu halaman data, urutan salah, dan tombol "muat lagi" hilang sehingga **baris jurnal tidak terlihat** (angka total tetap benar, daftar tidak lengkap). OFFSET dalam lambat di 13,6 juta baris. | Paginasi dengan keyset (tanggal+id terakhir), satu urutan global lintas tabel, jangan memotong daftar diam-diam. |
| F-07 | Risiko bug | [data-checks.service.ts:51-54](../src/server/services/data-checks.service.ts) | Empat metrik di Data Checks memakai `.catch(() => null)`: kalau salah satu gagal (timeout, DB error), pemeriksaannya **hilang tanpa jejak**. | Peringatan penting seperti `CF_IDENTITY` (arus kas tidak seimbang) bisa tidak muncul, dan pengguna mengira "semua data konsisten". | Catat error ke log dan tampilkan status "pemeriksaan gagal dijalankan" di panel. |
| F-08 | SQL berat / lambat | [data-checks.repo.ts:25-85](../src/server/repo/data-checks.repo.ts) | `checkQ7` dan `checkQ8` menghitung `COUNT(*)` dengan `LEFT JOIN` dari seluruh `ap_ar_card` ke `vendor`/`customer`/`pos_location`; `checkQ8` bahkan tanpa filter lokasi. `location_id` dan `module_type` tidak ber-index. | Pemindaian penuh `ap_ar_card` di setiap pemanggilan Data Checks, dan Data Checks berjalan di setiap halaman (F-01). Ukuran tabel `ap_ar_card` belum saya periksa **(perlu dicek)**. | Jalankan hanya saat panel dibuka dan cache hasilnya; atau pindahkan ke pemeriksaan terjadwal. |
| F-09 | N+1 / query berulang | [payment-plan.service.ts:64-130](../src/server/services/payment-plan.service.ts), [ap-aging.service.ts:45-71](../src/server/services/ap-aging.service.ts), [cash-flow.service.ts:181-189](../src/server/services/cash-flow.service.ts) | Banyak `await` berurutan untuk query yang tidak saling bergantung (saldo awal lalu saldo akhir; Part A lalu Part B lalu pembanding; AP lalu status lalu AR lalu unsettled lalu lag). | Waktu total = jumlah waktu semua query, bukan yang terlama. Mudah memangkas 30–50% waktu tunggu. | Kelompokkan dengan `Promise.all` untuk query yang independen. |
| F-10 | Code smell (duplikasi) | 26 loop `i += 1000` di [gl.repo.ts](../src/server/repo/gl.repo.ts), [apar.repo.ts](../src/server/repo/apar.repo.ts), [cashflow.repo.ts](../src/server/repo/cashflow.repo.ts), [bank-payment.repo.ts](../src/server/repo/bank-payment.repo.ts), [budget.repo.ts](../src/server/repo/budget.repo.ts) | Logika "pecah daftar ID per 1000" dan "proses tiap potongan" disalin ±26 kali (44 variabel `…Chunks`). Di tempat lain dipakai `.slice(0, 1000)` yang **memotong tanpa peringatan** (gl.repo.ts:495-507, data-checks.repo.ts:21,44,105,131, bank-payment.repo.ts:175). | Perbaikan di satu tempat tidak sampai ke tempat lain; versi `slice` membuang data diam-diam kalau daftar >1000 (mis. daftar akun). | Satu helper `chunk()` + satu fungsi yang menjalankan query per potongan; larang `slice(0, 1000)`. |
| F-11 | Code smell (duplikasi) | [apar.repo.ts:184-322 vs 431-571](../src/server/repo/apar.repo.ts), [ap-aging.service.ts vs ar-aging.service.ts](../src/server/services), [lib/finance/apar.ts:73 vs 200](../src/lib/finance/apar.ts) | AP dan AR adalah salinan hampir persis di tiga lapis (SQL, service, hitungan aging); beda hanya `module_type`, daftar `transaction_type`, dan nama kolom pihak (vendor/customer). | Aturan akuntansi (mis. cara menghitung sisa tagihan) harus diubah di 6 tempat; mudah ada yang terlewat sehingga AP dan AR memakai rumus berbeda. | Satu implementasi dengan parameter (sisi AP/AR) untuk SQL dan hitungan. |
| F-12 | Code smell (rumus tersebar) | [revenue.service.ts:94](../src/server/services/revenue.service.ts), [budget.service.ts:84-92](../src/server/services/budget.service.ts), [cash-flow.service.ts:~330](../src/server/services/cash-flow.service.ts), [drill.service.ts:91-95](../src/server/services/drill.service.ts) vs [lib/finance/sign.ts](../src/lib/finance/sign.ts) | Aturan "tanda angka per kelompok akun" (kredit−debet untuk pendapatan, debet−kredit untuk biaya) ada di `sign.ts`, tetapi service lain **menulis ulang sendiri**. | Salah satu bisa berbeda diam-diam dari yang lain → angka di dua halaman tidak cocok. | Semua pemakaian lewat `signedAmount`. |
| F-13 | Spaghetti | [cash-flow.service.ts:137-378](../src/server/services/cash-flow.service.ts) | `computeCashFlow` ±240 baris dalam satu fungsi: saldo awal/akhir, klasifikasi, tren bulanan, dan "perbandingan dengan metode ERP". Pengelompokan jurnal per `glId` dan perhitungan netto kas diulang **dua kali** (baris ~259 dan ~315), ditambah `allocateCash` sebagai kali ketiga. | Sulit diuji dan diubah; aturan "transfer internal" harus ditambal di tiga tempat. | Pecah menjadi fungsi kecil (saldo, klasifikasi, tren, perbandingan ERP) dan satu helper pengelompokan jurnal. |
| F-14 | Spaghetti | [drill.service.ts](../src/server/services/drill.service.ts) (739 baris), [DrillSheet.tsx:51-355](../src/components/drill/DrillSheet.tsx) | Satu file service memuat logika drill untuk **semua** metrik (AP/AR, kas, in-transit, cash flow, expense paid, GL) dengan `switch` besar; satu komponen React ±300 baris mencampur parsing URL, state paginasi, fetch, fokus, dan tampilan. | Setiap fitur baru menyentuh file raksasa yang sama; risiko regresi tinggi. | Pecah per metrik (satu file per jenis drill); komponen dipisah jadi hook data + tampilan. |
| F-15 | Code smell (aturan proyek) | [cashflow.ts:302,311,315](../src/lib/finance/cashflow.ts), [SidebarNav.tsx:25-36](../src/components/neraca/SidebarNav.tsx), [TopBar.tsx:37-45](../src/components/neraca/TopBar.tsx), [DataChecksPanel.tsx:99-102](../src/components/data-checks/DataChecksPanel.tsx), [DataTable.tsx:40](../src/components/neraca/DataTable.tsx), [CoaTreePicker.tsx:133,155](../src/components/settings/CoaTreePicker.tsx) | Teks bahasa Indonesia tertanam di kode. Yang paling serius: label baris Cash Flow ("Pembayaran biaya operasional dan karyawan", dst.) dikirim sebagai **data** dan dipakai sebagai kunci pengelompokan. | Melanggar aturan "kode berbahasa Inggris, teks lewat i18n"; tampilan bahasa Inggris tetap menampilkan label Indonesia; mengubah kata di label mengubah pengelompokan. | Kirim kunci bahasa-netral dan terjemahkan di UI via `id.json`/`en.json`. |
| F-16 | Code smell (magic number) | 28 tempat, mis. [apar.repo.ts:61-64,218-225,468](../src/server/repo/apar.repo.ts), [bank-payment.repo.ts:64-65](../src/server/repo/bank-payment.repo.ts) | Kode ERP ditulis langsung di SQL: `module_type = 0/1`, `transaction_type IN (7,8,9,10,11,13,14)`, `in_out IN (-1,1)`, `bank_payment.type IN (1,2)`, `status = 0/1`. Tidak ada konstanta bernama. | Siapa pun yang membaca tidak tahu arti angka; satu daftar yang salah ketik mengubah angka laporan tanpa error. | Konstanta bernama di satu modul (mis. `ApArTransactionType`) dengan komentar arti dan rujukan ke `data-model.md`. |
| F-17 | Code smell (duplikasi) | [gl.repo.ts:140,214](../src/server/repo/gl.repo.ts), [cashflow.repo.ts:~24](../src/server/repo/cashflow.repo.ts), [bank-payment.repo.ts:31,177](../src/server/repo/bank-payment.repo.ts), [budget.repo.ts:34](../src/server/repo/budget.repo.ts), [data-checks.repo.ts:101](../src/server/repo/data-checks.repo.ts) | Regex validasi nama kolom segmen disalin di 7 tempat (sudah ada `inList`/`glTablesOf` sebagai helper, tetapi untuk ini belum). | Perubahan aturan harus dilakukan 7×; salah satu terlewat = celah injeksi nama kolom. | Satu fungsi `segmentColumn(name)` di `server/db/`. |
| F-18 | Test lemah | `src/server/repo/`, `src/server/services/` | 144 unit test hampir semuanya untuk fungsi murni di `src/lib`. **Tidak ada test** untuk service/repo di unit test, dan tidak ada test yang menghitung jumlah query atau waktu. Test DB (24) bergantung data demo. Sedikit assertion lemah (`toBeDefined`/`toBeTruthy` di [coa-tree.test.ts:44,77](../src/lib/finance/coa-tree.test.ts), [journal-type.test.ts:43-44](../src/lib/finance/journal-type.test.ts)). | Masalah di F-01–F-05 lolos dari 144 test hijau karena tidak ada yang mengukurnya. | Tambah test "anggaran query" (maksimal N query per metrik) dan test regresi performa di DB demo. |

### Rendah

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| F-19 | Code smell (tipe) | 54 pemakaian `any`, mis. [TopBar.tsx:91-119](../src/components/neraca/TopBar.tsx), [AppShell.tsx:20-23](../src/components/layout/AppShell.tsx), `search: (prev: any)` di 6 route (summary, revenue, payables, receivables, payment-plan, cash-flow), [DataTable.tsx:56](../src/components/neraca/DataTable.tsx) | Navigasi dan parameter pencarian di-cast ke `any`. | Kesalahan nama parameter filter tidak ketahuan compiler (typecheck "hijau" tapi tidak melindungi). | Pakai tipe search dari TanStack Router; satu helper `updateSearch`. |
| F-20 | Code smell (uang) | [revenue.tsx:74](../src/routes/_authed/revenue.tsx), [DeltaPill.tsx:17](../src/components/neraca/DeltaPill.tsx) | `Number(m.amount)` dan `parseFloat` dipakai di UI. | Hanya untuk grafik dan persentase tampilan, **bukan hitungan uang**, jadi risikonya kecil; tetapi menyalahi aturan "uang = string/decimal.js" dan mudah ditiru ke tempat yang penting. | Beri komentar eksplisit "khusus tampilan" atau pakai decimal.js lalu konversi di batas grafik. |
| F-21 | N+1 / query berulang | [mapping.helper.ts:7](../src/server/services/mapping.helper.ts), [settings.repo.ts:19](../src/server/repo/settings.repo.ts) | `loadAccountMapping` membaca `system_main` dari DB **setiap dipanggil** (tanpa cache), ±6–8 kali per Summary. | Query kecil dan murah, tetapi menambah round trip tanpa alasan. | Cache beberapa menit; hapus cache saat pemetaan disimpan. |
| F-22 | Code smell (cache) | [cache.ts:123-126](../src/server/cache.ts), [gl.repo.ts:29-38](../src/server/repo/gl.repo.ts) | Cache GL bertipe `any[]` (kehilangan tipe `MovementRow`); kunci cache tidak memuat nama kolom segmen (`segCol`); batas 500 entri dihitung per entri, bukan per ukuran data — entri dengan `byLocation` (87 entitas × banyak akun) bisa besar **(perlu dicek)**. | Memori server bisa membengkak; jika kelak ada lebih dari satu kolom segmen, hasil bisa tertukar. | Beri tipe, sertakan `segCol` di kunci, batasi per ukuran. |
| F-23 | Code smell (pekerjaan berulang) | 13 tempat `tree.byId.values()` (mis. [pnl.service.ts:42](../src/server/services/pnl.service.ts), [revenue.service.ts:37](../src/server/services/revenue.service.ts), [runway.service.ts:115](../src/server/services/runway.service.ts)) | Setiap metrik memindai seluruh pohon akun untuk menyaring akun per kelompok. | Murah per request, tetapi disalin berulang; pohon sudah di-cache sehingga bisa di-index sekali. | Index per `accountGroup` saat pohon dibuat. |
| F-24 | Code smell (penamaan) | [lib/finance/types.ts](../src/lib/finance/types.ts) (`periodeId`), `apAgingPartA/PartB`, komentar seperti `G23`, `D30`, `K10` | Campuran Indonesia–Inggris (`periodeId` vs `period_id`), nama "Part A/B" tidak menjelaskan isi, kode rujukan keputusan di komentar tanpa penjelasan. | Pembaca baru sulit memahami; mudah salah tafsir. | Nama deskriptif (`invoicesOutstanding`, `unappliedPayments`) dan komentar yang menyebut arti, bukan hanya kodenya. |
| F-25 | Code smell (error ditelan) | [ExportCsvDialog.tsx:23,32](../src/components/export/ExportCsvDialog.tsx) | Dua `catch` kosong dengan komentar "ignore". Apa yang diabaikan **perlu dicek** (kemungkinan penyimpanan lokal browser). | Jika yang diabaikan adalah kegagalan ekspor, pengguna tidak tahu file tidak jadi. | Pastikan hanya error non-kritis yang diabaikan, selebihnya tampilkan pesan. |
| F-26 | Code smell (batas modul) | [summary.tsx:24](../src/routes/_authed/summary.tsx) | Route klien mengimpor tipe dari `~/server/services/payment-plan.service`. | Hanya `import type` sehingga aman saat ini; tetapi mengaburkan batas klien–server dan gampang berubah jadi impor nilai. | Pindahkan tipe `PaymentPlanBill` ke `lib/finance/types`. |
| F-27 | Risiko bug | [data-checks.repo.ts:101](../src/server/repo/data-checks.repo.ts) | `checkQ9` mengganti nama kolom segmen yang tidak valid dengan `segment1_id` **diam-diam**, sedangkan repo lain melempar error. | Perilaku tidak konsisten; salah konfigurasi tidak terlihat. | Lempar error seperti repo lain. |

## 3. Perkiraan jumlah query per halaman (estimasi dari kode)

| Halaman / aksi | Estimasi query | Catatan |
|---|---:|---|
| Summary (1 bulan, semua entitas) | ±50 | + ±35 dari Data Checks (F-01) |
| Summary YTD / 12 bulan, cache dingin | ±50 + sampai ±36–70 | `movementsByPeriods` per periode (F-03) |
| Cash Position | ±17 | loader juga memanggil Runway (F-02) |
| P&L | ±20 | P&L dihitung 2× lewat Runway (F-02) |
| Tiap klik drill Cash Flow | ±9 (berat) | diulang tiap halaman daftar jurnal (F-05) |
| Halaman apa pun (Data Checks otomatis) | +±35 | F-01 |

Angka bukan hasil ukur; jalankan dengan log query untuk memastikan.

## 4. Lima prioritas perbaikan teratas

1. **Hentikan Data Checks otomatis di setiap halaman (F-01, sebagian F-08).** Perbaikan paling murah dengan dampak paling besar: ±35 query dan 2 pemindaian penuh hilang dari tiap halaman.
2. **Pastikan index ERP terpasang dan periksa `EXPLAIN` untuk AP/AR Aging (F-04).** Ini kemungkinan besar penyebab ±91 detik; sekaligus paralelkan Part A/B (F-09). Perlu keputusan/aksi DBA karena DDL dijalankan manual.
3. **Hilangkan perhitungan ganda antar metrik (F-02).** Summary, Runway, Payment Plan, dan P&L saling memanggil; hitung saldo/pergerakan GL sekali per request atau cache hasilnya.
4. **Ubah `movementsByPeriods` agar tidak satu query per bulan dan cache bisa dipakai bersama (F-03).** Mempercepat YTD/12 bulan di P&L, Revenue, Fixed Cost, Budget.
5. **Perbaiki drill: cache hasil Cash Flow per filter dan paginasi daftar jurnal di SQL (F-05, F-06).** Menghilangkan hitung ulang tiap klik dan risiko daftar jurnal tidak lengkap.

Setelah itu, urutan berikutnya: menyatukan helper `chunk` dan duplikasi AP/AR (F-10, F-11), menyatukan aturan tanda debit/kredit (F-12), memindahkan teks Indonesia ke i18n (F-15), dan menambah test "anggaran query" supaya masalah di atas tidak kembali (F-18).

## 5. Batas audit ini

- Tidak ada query ke database dan tidak ada profil waktu; semua angka performa adalah estimasi dari struktur kode dan **perlu dibuktikan** dengan `EXPLAIN` / log query.
- `npm run typecheck` dan `npm test` tidak saya jalankan ulang; saya memakai hasil yang dilaporkan sesi sebelumnya (lulus).
- Area keamanan (login, sesi, rate-limit) tidak diaudit mendalam karena di luar permintaan.

## 6. Status perbaikan (diperbarui setelah perbaikan dikerjakan)

Perbaikan dikerjakan atas permintaan user karena proyek masih tahap development. Yang sudah diverifikasi: `tsc --noEmit` bersih, 156 unit test lulus (12 test baru), build berhasil. **Dampak kecepatan belum diukur** (tidak ada profil waktu; lihat catatan F-04).

| ID | Status | Apa yang dilakukan |
|---|---|---|
| F-01 | Selesai | Data Checks tidak lagi dimuat di setiap halaman; hanya saat panel dibuka. Hasil di-cache 5 menit di server. Badge jumlah temuan baru terisi setelah panel pernah dibuka. |
| F-02 | Selesai | `memoMetric` (cache 60 detik per filter) untuk Cash Position, P&L, AP/AR Aging, Cash Flow, dan portions Cash Flow. Summary/Runway/Payment Plan tidak menghitung ulang hasil yang sama. Cache dibersihkan saat pemetaan akun disimpan. |
| F-03 | Selesai | Periode Closed yang belum ter-cache diambil dengan **satu query per tabel GL** (bukan per bulan), semua tabel paralel. Kunci cache tidak lagi memuat `byPeriod`, jadi dipakai bersama. Cache dibatasi juga per jumlah baris dan bertipe. |
| F-04 | Sebagian | AP/AR digabung jadi satu implementasi; Part A/B paralel; anti-join diganti `NOT EXISTS`. **Belum**: pemasangan index `docs/sql/dashboard-indexes.sql` di DB target dan pemeriksaan `EXPLAIN` — butuh keputusan/aksi DBA. Tanpa index, query tetap bisa lambat. |
| F-05 | Selesai | `loadClassifiedPortions` di-cache; klik drill dan "muat lagi" tidak menghitung ulang. |
| F-06 | Selesai | `journalLines` menggabung halaman lintas tabel GL dalam satu urutan global (fungsi murni `mergeJournalPages`, ada test); tidak ada lagi pemotongan diam-diam. Paginasi tetap OFFSET (keyset belum). |
| F-07 | Selesai | Pemeriksaan yang gagal dicatat ke log dan muncul sebagai temuan `CHECK_FAILED` di panel. |
| F-08 | Sebagian | Q7/Q8 hanya jalan saat panel dibuka dan di-cache; SQL-nya sendiri belum diubah (perlu `EXPLAIN`). |
| F-09 | Selesai | `Promise.all` di AP/AR Aging, Cash Position, Cash Flow, Payment Plan. |
| F-10 | Selesai | Helper `chunk`/`chunkOrAll` (`src/server/db/chunk.ts`); semua loop 1000 dan `slice(0, 1000)` hilang. |
| F-11 | Selesai | Satu implementasi AP/AR di repo (`agingInvoices`/`agingUnallocated`) dan di hitungan (`accumulateAging`). Efek samping: nomor tagihan AP kini terbawa ke daftar (sebelumnya dibuang). Service `ap-aging`/`ar-aging` masih dua file tipis. |
| F-12 | Selesai | Revenue, Fixed Cost, Budget memakai `signedAmount` / `computeNetRevenue`. |
| F-13 | Selesai | `computeCashFlow` dipecah: `settledJournals`, `summarizeDrawers`, `monthlyTrend`, `erpMethodTotals`; pengelompokan jurnal hanya sekali. |
| F-14 | Selesai | `drill.service.ts` (739 baris) dipecah ke `drill/{shared,ap-ar,cash,cash-flow,gl-metrics}.ts`; logika data `DrillSheet` dipindah ke hook `useDrillData`. |
| F-15 | Selesai | Label fallback Cash Flow kini kunci terjemahan (`cf.fallback.*`); menu, judul halaman, aria-label, panel Data Checks, tabel kosong, dll. lewat i18n (en & id). Blok "Data per 28 Okt 2026" yang dikodekan statis di sidebar dihapus (hanya tampil bila diberi data). |
| F-16 | Selesai | `src/server/db/erp-codes.ts` berisi konstanta bernama; SQL memakainya. |
| F-17 | Selesai | `assertSegmentColumn` satu tempat. |
| F-18 | Sebagian | Test baru: helper chunk/segment/intList, `mergeJournalPages`, batas ukuran cache, dan test "anggaran query" untuk `movementsByPeriods` (1 query per tabel, cache, periode Open tidak di-cache). Belum ada test anggaran query untuk semua service. |
| F-19 | Selesai (2 sisa) | `any` dihapus dari route/TopBar/DataTable/Tabs/CashflowChart. Sisa 2 disengaja dan diberi komentar: `bigint-string.ts` (internal drizzle) dan tipe cookie `session.ts`. |
| F-20 | Selesai | Diberi komentar "khusus tampilan". |
| F-21 | Selesai | `loadAccountMapping` di-cache 2 menit. |
| F-22 | Selesai | Cache bertipe, `segCol` masuk kunci, batas ukuran. |
| F-23 | Selesai | `postableAccountIds` (indeks per kelompok akun, sekali per pohon). |
| F-24 | Sebagian | `apAgingPartA/B` → `apOpenInvoices`/`apUnallocatedPayments` (dan versi AR). `periodeId` dibiarkan karena mengikuti kolom ERP. |
| F-25 | Selesai | Ternyata hanya `localStorage`; diberi komentar penjelas. |
| F-26 | Selesai | `PaymentPlanBill` dipindah ke `lib/finance/payment-plan`. |
| F-27 | Selesai | `checkQ9` melempar error untuk kolom segmen tak valid. |

Temuan tambahan yang terlihat saat memperbaiki: `onClick` grafik Cash Flow membaca `activePayload` (API recharts lama) sehingga klik bulan kemungkinan tidak jalan di recharts versi sekarang; diganti memakai `activeTooltipIndex` (belum diuji di browser).

## 7. Hasil pengukuran di DB demo (MariaDB 10.4.32, bukan MySQL 5.7)

Semua index `idx_dash_*` sudah terpasang di DB demo (termasuk satu yang tidak ada di skrip: `idx_dash_apar_mod_type_date`). Pengukuran dilakukan dengan query yang sama seperti di repo, sekali jalan, cache disk kemungkinan dingin; **bukan angka produksi**.

| Query | Waktu | Baris hasil | Catatan |
|---|---:|---:|---|
| AP Part A (tagihan AP terbuka, semua lokasi) | **624,7 detik** | 162.865 | `EXPLAIN`: ±994 ribu tagihan dibaca lewat index lalu `Using temporary; Using filesort` untuk GROUP BY 12 kolom. **Index saja tidak cukup.** |
| AP Part B, `NOT EXISTS` | 15,2 detik | 145 | versi lama `LEFT JOIN … IS NULL`: 18,0 detik |
| AR Part A | 4,6 detik | 1.467 | wajar |
| Q7 vendor | **197,5 detik** | 92 | memindai ±994 ribu kartu AP |
| Q7 customer | 3,6 detik | 0 | |
| Q8 | 2,8 detik | 0 | pemindaian index penuh ±2 juta baris |
| Paginasi jurnal OFFSET 0/2000/20000 | — | — | **belum valid**: ID periode terpotong di skrip ukur (sudah diperbaiki), perlu diulang |

Percobaan menulis ulang AP Part A dengan tabel turunan (pembayaran dijumlah dulu per tagihan) belum berhasil: di MariaDB optimizer memilih `LATERAL DERIVED` dan query melewati 600 detik sebelum dihentikan. Perlu dicoba dengan `split_materialized=off` (perilaku yang sama dengan MySQL 5.7), dan sebaiknya diuji di MySQL 5.7 sungguhan.

Catatan lingkungan: saat pengukuran, aplikasi dev yang sedang dipakai juga menjalankan query AP Aging yang sama di DB ini (terlihat di `processlist`, >500 detik), jadi angka di atas bisa ikut terpengaruh beban itu.
