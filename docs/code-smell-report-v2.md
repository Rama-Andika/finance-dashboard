# Laporan Kualitas Kode v2 — Finance Dashboard

Audit **baca-saja** terhadap `main` di commit `6a18b06` (sudah termasuk perbaikan setelah laporan pertama `docs/code-smell-report.md`). Tidak ada kode yang diubah, tidak ada query ke database. Semua temuan di bawah sudah saya verifikasi dengan membaca kodenya; yang masih dugaan ditandai **(perlu dicek)**. Angka performa adalah **estimasi dari struktur kode**, bukan hasil ukur.

Cara baca singkat:
- **N+1 / query berulang** = pekerjaan yang sama (atau mirip) dikerjakan berkali-kali, padahal bisa sekali.
- **Spaghetti** = satu fungsi/file mengerjakan terlalu banyak hal sehingga sulit dibaca dan diubah.
- **Code smell** = kebiasaan kode yang belum salah, tetapi menimbulkan bug atau kerja ekstra di kemudian hari.
- Format lokasi: `file:baris` relatif terhadap folder proyek.

## 1. Ringkasan

Temuan lama (F-01…F-27): **13 sudah diperbaiki, 14 sebagian, 0 belum disentuh** (tabel di bagian 2).
Temuan **baru: 20** (G-01…G-20).

| Kategori (temuan baru) | Tinggi | Sedang | Rendah | Jumlah |
|---|---:|---:|---:|---:|
| N+1 / query berulang | 2 | 4 | 0 | 6 |
| SQL berat / infrastruktur / performa | 1 | 2 | 2 | 5 |
| Risiko bug / angka salah | 0 | 3 | 1 | 4 |
| Spaghetti | 0 | 1 | 0 | 1 |
| Code smell (duplikasi, bahasa, tipe) | 0 | 1 | 3 | 4 |
| **Total** | **3** | **11** | **6** | **20** |

**Kesimpulan satu kalimat:** perbaikan pertama berhasil (Data Checks tidak lagi jalan di tiap halaman, query per bulan sudah digabung, AP/AR sudah satu implementasi, 185 unit test hijau), tetapi **masih ada tiga masalah besar yang belum tersentuh**: (1) halaman Payment Plan/Summary menjalankan query status tagihan **sekali per 1000 tagihan, berurutan** (bisa puluhan sampai >100 query), (2) **tidak ada batas waktu query** padahal kolam koneksi hanya 5 dan hover pada menu sudah memuat halaman berat, dan (3) beberapa metrik masih **mengulang pekerjaan** karena kunci cache berbeda atau tidak di-cache sama sekali.

Hal yang sudah baik (tidak perlu diubah): uang tetap string + decimal.js (tidak ada `number` untuk hitungan uang; `Number()` hanya untuk tinggi grafik), semua SQL berparameter dan nama kolom/tabel divalidasi (`assertSegmentColumn`, `glTablesOf`), tidak ada CTE/window function/LATERAL (sesuai aturan MySQL 5.7), tidak ada query di dalam `map`/`forEach` per baris, `balancesBySegmentAt` menggabungkan 87 entitas jadi satu query, tabel vendor/customer sudah dipaginasi dan diurutkan di server dari hasil yang di-cache, dan ada test "anggaran query" (walau baru untuk 2 metrik).

## 2. Status temuan lama (F-01…F-27)

| ID | Status | Bukti (file:baris) | Catatan |
|---|---|---|---|
| F-01 Data Checks di semua halaman | **Sudah** | `src/components/layout/AppShell.tsx:22-27` (`enabled: … && dataChecksOpen`), `src/server/services/data-checks.service.ts:38-40` (cache 5 menit) | Hanya jalan saat panel dibuka. |
| F-02 Metrik saling memanggil, dihitung ganda | **Sebagian** | `src/server/cache.ts:61-69` (`memoMetric`); dipakai di cash-position, pnl, ap/ar-aging, cash-flow, payment-plan | Revenue, Fixed Cost, Budget, Expense Paid, **Runway**, Summary tidak di-memo; Cash Position tetap dihitung 2× → **G-04**. |
| F-03 `movementsByPeriods` per bulan | **Sebagian** | `src/server/repo/gl.repo.ts:138-166` (1 query per tabel GL, paralel) | Kunci cache memuat daftar akun (`gl.repo.ts:37-39`), jadi P&L/Revenue/Fixed Cost/Budget tetap masing-masing memindai `gl_detail` → **G-05**. |
| F-04 AP/AR Aging berat | **Sebagian** | `src/server/repo/apar.repo.ts:236-261` (SQL inti tidak berubah), `ap-aging.service.ts:48` (A/B paralel), `apar.repo.ts:312` (`NOT EXISTS`) | Query inti (join kartu→detail→pembayaran + GROUP BY 12 kolom) masih sama; laporan lama §7 mengukur 624 detik di DB demo. Perlu `EXPLAIN` di MySQL 5.7 nyata. |
| F-05 Drill menghitung ulang tiap klik | **Sudah** | `src/server/services/cash-flow.service.ts:84-91` (memo), `drill/cash-flow.ts:24`, aging lewat memo di `apar.repo.ts:221` | |
| F-06 Paginasi jurnal lintas tabel | **Sebagian** | `src/server/repo/gl.repo.ts:441` (`mergeJournalPages`) | Masih OFFSET dalam (`gl.repo.ts:413`); rentang tanggal tanpa periode hanya membaca tabel `gl` → **G-14**. |
| F-07 `.catch(() => null)` di Data Checks | **Sebagian** | `data-checks.service.ts:28-36,66-69` (`settle` untuk 4 metrik) | 6 pemeriksaan lain tidak dilindungi → **G-07**. |
| F-08 Q7/Q8 `COUNT(*)` memindai `ap_ar_card` | **Sebagian** | `src/server/repo/data-checks.repo.ts:49-94` (SQL tidak berubah) | Hanya jalan saat panel dibuka + cache 5 menit; Q7 vendor diukur 197 detik di DB demo (lap. lama §7). |
| F-09 `await` berurutan | **Sebagian** | `Promise.all` di `ap-aging.service.ts:48,75`, `cash-position.service.ts:121`, `cash-flow.service.ts:324`, `payment-plan.service.ts:68,101` | Masih berurutan: `expense-paid.service.ts:62-63`, `runway.service.ts:43→69→108→122`, rekonsiliasi GL di `ap-aging.service.ts:93` / `ar-aging.service.ts:93`. |
| F-10 Loop `i += 1000` / `slice(0,1000)` | **Sudah** | `src/server/db/chunk.ts`; grep `i += 1000` dan `slice(0, 1000)` di `src/server` = 0 hasil | Sisa kecil: `journalLines` tidak memecah daftar akun (`gl.repo.ts:388`). |
| F-11 AP dan AR disalin | **Sudah** | `apar.repo.ts:163-188` (`AGING_SIDES`), `src/lib/finance/apar.ts:78` (`accumulateAging`) | `ap-aging.service.ts` (122 baris) dan `ar-aging.service.ts` (124) masih hampir kembar — rendah. |
| F-12 Rumus tanda debet/kredit tersebar | **Sebagian** | `signedAmount` dipakai di `revenue.ts:78`, `fixed-cost.ts:55`, `budget.service.ts:79` | P&L punya aturan tanda sendiri (`src/lib/finance/pnl.ts:102-173`, `'CREDIT_MINUS_DEBET'`); daftar grup "pendapatan" ditulis ulang di `budget.ts:42` dan `budget.service.ts:130`. |
| F-13 `computeCashFlow` 240 baris | **Sudah** | `cash-flow.service.ts:167-304` (fungsi kecil), `computeCashFlowUncached` ±48 baris | |
| F-14 `drill.service.ts` & `DrillSheet` raksasa | **Sudah** | `drill.service.ts` 73 baris, `server/services/drill/*`, `components/drill/useDrillData.ts` | `DrillSheet.tsx` masih 294 baris (wajar). |
| F-15 Teks Indonesia di kode | **Sebagian** | `src/lib/finance/cashflow-labels.ts` (kunci terjemahan) | Masih ada sisa → **G-17**. |
| F-16 Kode ERP magic number | **Sudah** (untuk SQL) | `src/server/db/erp-codes.ts`; repo memakai konstanta | Sisa literal di TypeScript → **G-13**. |
| F-17 Regex kolom segmen disalin | **Sebagian** | `src/server/db/segment-column.ts` | Satu salinan tersisa: `src/server/repo/entities.repo.ts:18`. |
| F-18 Test lemah | **Sebagian** | Saya menjalankan `npm test`: 40 file, **185 test lulus**. `src/server/services/query-budget.test.ts` (6 test) | Anggaran query hanya untuk P&L dan AP Aging; tidak ada untuk Summary, Cash Position, Runway, Cash Flow, Payment Plan, Data Checks. Assertion lemah masih di `coa-tree.test.ts` dan `journal-type.test.ts` (2 tiap file). |
| F-19 `any` berlebihan | **Sebagian** | — | Sekarang ±18 `any` + 4 `as never` → **G-16** (lebih banyak dari yang dilaporkan "2 sisa"). |
| F-20 `Number()` pada uang di UI | **Sudah** | `revenue.tsx:89` (komentar "display only") | `cash-flow.tsx:107-138` memakai pola sama tanpa komentar — kecil. |
| F-21 `loadAccountMapping` tanpa cache | **Sudah** | `src/server/services/mapping.helper.ts:13` (2 menit) | |
| F-22 Cache GL bertipe `any` | **Sudah** | `src/server/cache.ts:161-176` (bertipe, bobot baris), `gl.repo.ts:39` (`segCol` di kunci) | Cache `memo` umum belum dibatasi ukuran → **G-11**. |
| F-23 Pemindaian pohon akun berulang | **Sebagian** | `postableAccountIds` di `src/lib/finance/coa-tree.ts` | `drill/gl-metrics.ts:24` masih memindai seluruh pohon tiap panggilan (murah). |
| F-24 Penamaan campur | **Sebagian** | `apOpenInvoices`/`apUnallocatedPayments` | Kode rujukan seperti `G23`, `G17`, `K10`, `D30` masih di komentar (`budget.repo.ts:13`, `drill/shared.ts:73`). |
| F-25 `catch` kosong | **Sudah** | `ExportCsvDialog.tsx:23,32` (localStorage, ada komentar), `:74` (set `failed`) | |
| F-26 Route mengimpor dari server | **Sudah** | `summary.tsx` kini mengimpor tipe dari `~/lib/finance/payment-plan`; grep `~/server` di `lib/components/routes/queries` = 0 hasil | |
| F-27 `checkQ9` diam-diam ganti kolom | **Sudah** | `data-checks.repo.ts:109` (melempar error) | |

## 3. Temuan baru (urut dari paling parah)

### Tinggi

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| G-01 | N+1 / query berulang | `src/server/services/payment-plan.service.ts:73-76`, `src/server/repo/apar.repo.ts:447-466` | `listPlanStatuses` dipanggil dengan **seluruh** tagihan AP berbalance positif (`apPositive`), bukan hanya yang jatuh tempo di horizon. Fungsinya memecah daftar per 1000 ID dan menjalankan `await` **berurutan** untuk tiap potongan. | Di DB demo ada ±162 ribu tagihan AP terbuka (lap. lama §7); bila sebagian besar berbalance positif, itu **±100 query berurutan** ke `bankpo_payment_detail` ⨝ `bankpo_payment` untuk satu Payment Plan — dan Summary memanggil Payment Plan juga. Jumlah pastinya **(perlu dicek)** dengan menghitung tagihan positif. Tagihan yang jatuh tempo setelah horizon tidak membutuhkan status sama sekali. | Ambil status hanya untuk tagihan jatuh tempo ≤ horizon + yang terlambat; atau gabungkan ke satu query SQL (JOIN/`GROUP BY invoice_id`) dengan filter tanggal; jangan loop `await` per potongan. |
| G-02 | SQL berat / infrastruktur | `src/server/db/client.ts:11-19`, `src/server/env.ts` (`DB_POOL_SIZE` default 5, maks 10) | Kolam koneksi hanya 5 dan **tidak ada batas waktu query** (tidak ada `MAX_EXECUTION_TIME` / timeout) maupun pembatalan saat pengguna pindah halaman. | Satu query AP Aging yang berjalan 600 detik (angka ukur lap. lama) menahan 1 dari 5 koneksi; dua–tiga halaman berat terbuka bersamaan membuat **semua** permintaan lain (termasuk cek login `auth:user` dan menu) antre. Server tampak "hang" tanpa error. | Set batas waktu per query (mis. `MAX_EXECUTION_TIME` di MySQL 5.7 untuk SELECT) dan tampilkan pesan "terlalu lama"; naikkan pool secukupnya; pertimbangkan antrean terpisah untuk query berat. |
| G-03 | N+1 / query berulang | `src/router.tsx:13-14` (`defaultPreload: 'intent'`, `defaultPreloadStaleTime: 0`), loader di `src/routes/_authed/*.tsx` | Mengarahkan kursor ke tautan menu (atau menyentuhnya di layar sentuh) langsung menjalankan **loader** halaman tujuan (`ensureQueryData` → server function berat). `staleTime 0` membuat preload diulang tiap hover. Perilaku hover persisnya **(perlu dicek di browser)**; konfigurasinya terverifikasi. | Menggeser mouse melewati menu "Payables", "Receivables", "Cash Flow" memicu AP Aging, AR Aging, Cash Flow tanpa diklik — masing-masing puluhan query dan bisa menyumbat kolam 5 koneksi (G-02). Metrik tanpa memo (Revenue, Fixed Cost, Budget, Runway, Expense Paid) dihitung ulang di tiap hover. | Matikan preload untuk halaman berat (`preload={false}` di tautan menu) atau naikkan `defaultPreloadStaleTime` ke ≥ 60 detik. |

### Sedang

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| G-04 | N+1 / query berulang | `src/server/services/summary.service.ts:83`, `runway.service.ts:43`, `payment-plan.service.ts:69`, `cash-position.service.ts:49`, `runway.service.ts:35` | Kunci memo Cash Position memuat opsi: Summary memanggil `{includeByEntity:false}` (dengan pembanding), Runway/Payment Plan/Data Checks `{…, includeCompare:false}` → **dua perhitungan** untuk hal yang hampir sama. `computeRunwayMetrics` sendiri **tidak di-memo** padahal dipakai Summary, halaman Cash Position, dan halaman P&L. | Summary (1 bulan, semua entitas, cache dingin): estimasi **±45 query + G-01** (cash position ≈7+4, runway ≈8 termasuk pengambilan jurnal kas 3 bulan, AP aging ≈8, cash flow ≈8, P&L 2, Revenue 2, Fixed Cost 1, Payment Plan ≈3). Pindah Cash Position → P&L → Summary dalam 60 detik mengulang Runway tiga kali. | Hitung Cash Position sekali dengan pembanding lalu pakai ulang; bungkus Runway dengan `memoMetric`. |
| G-05 | N+1 / query berulang | `src/server/repo/gl.repo.ts:31-40`; pemanggil: `pnl.service.ts:48`, `revenue.service.ts:60`, `fixed-cost.service.ts:60`, `budget.service.ts:64` | Kunci cache periode Closed memuat hash daftar akun, jadi P&L, Revenue (juga per lokasi), Fixed Cost, dan Budget masing-masing menyimpan & memindai `gl`⨝`gl_detail` sendiri-sendiri untuk periode yang sama (akun Revenue ⊂ akun P&L, Expense ⊂ akun P&L). Periode **Open** (bulan berjalan) tidak pernah di-cache (`gl.repo.ts:144-148`), dan Revenue/Fixed Cost/Budget tidak di-memo. | Tiap tampilan Summary memindai bulan berjalan 3× (P&L, Revenue, Fixed Cost) pada tabel ±13,6 juta baris; halaman Budget menambah satu lagi. Cache 6 jam tidak membantu antar-metrik. | Ambil sekali semua akun P&L per periode (satu kunci cache) lalu saring di memori; beri memo pendek untuk Revenue/Fixed Cost/Budget. |
| G-06 | N+1 / query berulang | `cash-flow.service.ts:317-326`, `expense-paid.service.ts:80-86`, `runway.service.ts:69`, `drill/cash-flow.ts:118-121`, `routes/_authed/cash-flow.tsx:49-52` | Jurnal kas (`linesOfCashJournals`, join berat + `DISTINCT`) diambil terpisah oleh Cash Flow (kas+bank+deposit), Expense Paid (kas+bank saja), Runway (3 bulan lalu), dan drill Expense Paid (kas+bank, kunci memo lain). Halaman Cash Flow memuat dua metrik pertama bersamaan. Fungsi "akun kas milik kita" (`isOurCash`) ditulis ulang 3× (`cash-flow.service.ts:107`, `expense-paid.service.ts:90` memakai `array.includes` per baris, `runway.service.ts:78`). | Halaman Cash Flow = dua pengambilan jurnal kas yang hampir identik. Angka Expense Paid di kepala halaman (dihitung langsung) dan di drill (lewat portion terklasifikasi) memakai jalur berbeda, jadi bisa selisih **(perlu dicek)**. | Satu fungsi `loadCashLines(filter, akun)` ber-memo + satu `makeIsOurCash`; pakai set akun yang sama (atau saring di memori). |
| G-07 | Risiko bug | `src/server/services/data-checks.service.ts:59-70`, `data-checks.repo.ts:32-41` | `settle()` hanya melindungi 4 metrik; `checkQ1b/Q7/Q8/Q9/Unposted/getMappingRow` ada di `Promise.all` yang sama **tanpa** perlindungan: satu gagal (mis. timeout Q7) → seluruh panel error dan semua pemeriksaan lain ikut hilang. `checkQ1b` masih memakai pola `LEFT JOIN … IS NULL` (yang di tempat lain sudah diganti `NOT EXISTS`). | Laporan lama menandai F-07 "selesai", padahal hanya sebagian. Q7 diukur 197 detik, jadi kegagalan/timeout realistis. | Bungkus semua pemeriksaan dengan `settle`; ganti Q1b ke `NOT EXISTS`; jalankan Q7/Q8 hanya sesuai kebutuhan. |
| G-08 | Risiko bug (tampilan) | `src/routes/_authed/summary.tsx:98-108,279`, `src/routes/_authed/payment-plan.tsx:165` | Kolom status tagihan membandingkan dengan teks `'Disetujui'`/`'Diajukan'`, padahal server mengirim kode `'approved' \| 'submitted' \| 'notSubmitted'` (`src/lib/finance/aging.ts:53`). Hasilnya selalu "netral" dan label yang tampil adalah kode mentah (mis. `approved`). Payment Plan menulis `'Aman'` langsung. | Status persetujuan tagihan di Summary tidak pernah menyala "warning" dan tidak diterjemahkan; pengguna yang berbahasa Inggris melihat "Aman". Drill sudah benar (`DrillSheet.tsx:263` memakai `t('planStatus.…')`). | Pakai `t('planStatus.<kode>')` dan tone dari kode (seperti DrillSheet); pindahkan 'Aman' ke i18n. |
| G-09 | N+1 / query berulang | `src/lib/filters/search-schema.ts:21`, `summary.tsx:30-37,198-199`, `revenue.tsx:40`, `cash-flow.tsx:47,348` | Parameter `chart` (YTD / 12 bulan) ikut dikirim ke server dan jadi bagian kunci query, tetapi **tidak dibaca di server** (grep `chart` di `src/server` = kosong); kisaran data ditentukan `preset` saja. Memilih "YTD/12 bln" di grafik hanya mengganti label. Apakah ini sengaja **(perlu dicek dengan pemilik produk)**. | Setiap ganti dropdown grafik memicu pemanggilan ulang seluruh metrik (Summary/Revenue/Cash Flow yang tidak di-memo menghitung ulang) tanpa mengubah angka; pengguna mengira grafik berubah. | Hapus parameter (atau sambungkan ke period picker) dan keluarkan dari `loaderDeps`. |
| G-10 | SQL berat / performa | `src/server/services/expense-paid.service.ts:62-63,91,114-128,143-166` | `byEntity` mengulang **tiap entitas (87) × seluruh baris `allocated` × `unallocated`** (≈87 × puluhan ribu); `cashAndBankIds.includes()` di dalam `isOurCash` (per baris jurnal); dua query tagihan berurutan; seluruh fungsi 183 baris tanpa memo. Nilai "direct" per entitas dihitung dari debet−kredit baris biaya (`:120-125`), sedangkan total memakai portion alokasi (`:98-105`) — rumus berbeda, jumlah per entitas bisa ≠ total **(perlu dicek)**. | CPU server naik di halaman Cash Flow; angka per entitas berpotensi tidak cocok dengan total. | Kelompokkan per lokasi sekali (Map) lalu baca; pakai `Set`; samakan rumus; paralelkan dan beri memo. |
| G-11 | SQL berat / infrastruktur | `src/server/cache.ts:10-24`, `src/server/repo/apar.repo.ts:221,288` | Cache `memo` dibatasi **jumlah** entri (200), bukan ukuran; satu entri aging bisa berisi ±160 ribu objek (DB demo) dan kuncinya per tanggal+kumpulan lokasi (5 menit). Pembuangan memakai urutan masuk (FIFO), jadi entri yang sering dipakai (`coa:tree`, `entities:all`, `periods:all`, `mapping:row`) justru yang pertama terbuang. | Beberapa pengguna dengan filter berbeda = banyak salinan 160 ribu baris di memori Node (tekanan memori/GC); data pokok dimuat ulang tanpa perlu. | Batasi per ukuran (seperti `createLruCache` yang sudah ada); pakai LRU; kecualikan data pokok dari pengusiran. |
| G-12 | Spaghetti | `src/routes/_authed/cash-flow.tsx:70-472`, `profit-loss.tsx:78-421`, `payment-plan.tsx:56-355`, `summary.tsx:45-323`; `payables.tsx` vs `receivables.tsx` (291 baris masing-masing) | Satu komponen halaman 270–400 baris memuat pengambilan data, penyusunan data grafik (waterfall, pelokalan label), definisi kolom tabel, dan tampilan. Halaman Payables dan Receivables mirip struktur & panjangnya (kemiripan persisnya **(perlu dicek)**). | Sulit diuji dan diubah; perbaikan di satu halaman mudah tidak sampai ke halaman kembarannya (G-08 contoh nyata). | Pisahkan fungsi penyusun data (murni, bisa di-test) dan komponen kecil per bagian; satu komponen "halaman aging" dengan parameter sisi AP/AR. |
| G-13 | Code smell (duplikasi) | `src/lib/finance/expense-paid.ts:28`, `server/services/drill/shared.ts:35`, `expense-paid.service.ts:152`, `lib/finance/apar.ts:122` (`itemType === 3`), `lib/finance/cashflow.ts:249,257` vs `lib/finance/journal-type.ts:15,19`, `cashflow.ts:323` vs `cash-flow.service.ts:67` | Daftar tipe tagihan AP `[0,1,2,4,5,6,12]` ditulis di 3 tempat (dan berbeda dari `AP_INVOICE_TYPES` yang memuat tipe 3); tipe jurnal pinjaman `[11..14]` dan aset tetap `[44,45,49,50,51]` ada di dua file; literal `'Unclassified'` ada di dua tempat; nama grup akun (`'Cost Of Sales'`, `'Expense'`, `'Revenue'`) dipakai langsung di ±12 tempat. | Satu daftar yang diubah di satu tempat saja menggeser angka di halaman lain tanpa error (Expense Paid vs drill-nya). | Pindahkan ke `erp-codes.ts` / satu modul `account-groups` dan impor. |
| G-14 | Risiko bug / angka salah | `src/server/repo/gl.repo.ts:366-367`, `server/services/drill/cash.ts:35-38`, `data-checks.repo.ts:136-141` | Jika `periods` kosong, `journalLines` hanya membaca tabel `gl` (aktif). Drill jurnal akun Cash Position memakai rentang tanggal tanpa periode; `checkUnpostedJournals` juga hanya `gl`. | Bila rentang melintasi tabel arsip (`gl_2015`, …), baris jurnal dan hitungan "belum diposting" **hilang tanpa peringatan**. Apakah DB nyata punya tabel arsip **(perlu dicek)**; jalur saldo (`tablesBetween`) sudah benar. | Turunkan tabel dari periode yang tercakup rentang (seperti `tablesBetween` di `balance.service.ts:23`). |

### Rendah

| ID | Kategori | File:baris | Masalah | Kenapa berbahaya | Saran |
|---|---|---|---|---|---|
| G-15 | Risiko bug | `src/server/repo/cashflow.repo.ts:48-71` | `linesOfCashJournals` memecah daftar akun/segmen per 1000, tetapi query luar mengembalikan **seluruh baris jurnal** untuk tiap potongan; jurnal yang muncul di dua potongan terhitung ganda. | Tidak terjadi pada ukuran data sekarang (≪1000 akun kas, 87 entitas); jadi bom waktu bila daftar tumbuh. | Deduplikasi per `gl_id` setelah semua potongan, atau jangan memecah. |
| G-16 | Code smell (tipe) | `ColumnDef<…, any>` di `budget.tsx:48`, `cash-flow.tsx:174,210`, `cash-position.tsx:73,88`, `payables.tsx:121`, `payment-plan.tsx:123`, `profit-loss.tsx:112,171`, `receivables.tsx:121`, `revenue.tsx:94`, `summary.tsx:71`; `DataTable.tsx:29-30,52,138,208`; `as never` di `DataChecksPanel.tsx:36`, `DrillSheet.tsx:49`, `useOpenDrill.ts:14`, `search-update.ts:9` | ±18 `any` dan 4 cast `as never` pada tipe kolom tabel dan navigasi. | Salah nama kolom/parameter tidak ketahuan compiler; laporan lama mencatat "tersisa 2". | Tipe kolom per baris data; satu helper navigasi bertipe. |
| G-17 | Code smell (bahasa) | `src/routes/_authed/profit-loss.tsx:59-68` (tabel `{id, en}` di route), `src/lib/finance/fixed-cost.ts:122` (`'Biaya Tetap'` dikirim sebagai data), `payment-plan.tsx:165` (`'Aman'`), `summary.tsx:102-104`; komentar Indonesia di `cash-position.tsx:228,280`, `profit-loss.tsx:298`, `cash-flow.service.ts:316`; nama variabel `netKas` (`cashflow.ts:64`, `cash-flow.service.ts:173`) | Teks/identifier Indonesia di luar `id.json`. | Melanggar aturan "kode berbahasa Inggris"; tampilan bahasa Inggris tetap menampilkan teks Indonesia. | Pindahkan ke `id.json`/`en.json`; ganti `netKas` → `netCash`. |
| G-18 | Code smell (duplikasi/performa) | `src/functions/settings.fn.ts:28,76,100,134-143` | `getCoaTreeFn` membaca ulang tabel `coa` (tanpa cache) lalu menghitung saldo **semua** akun POSTABLE tiap pengguna mengganti filter di halaman Pemetaan Akun; logika memuat/parse mapping disalin dari `mapping.helper.ts`. | Beban DB yang tidak perlu di layar pengaturan; dua sumber kebenaran untuk "mapping default/korup". | Pakai `getCachedCoaTree` dan `loadAccountMapping`; muat saldo hanya untuk akun yang tampak. |
| G-19 | SQL berat / infrastruktur | `docs/sql/dashboard-indexes.sql:60-107` | Skrip index hanya mencakup 5 tabel. Lap. lama §7 menyebut DB demo punya `idx_dash_apar_mod_type_date` yang **tidak ada di skrip**, sehingga DB target (MySQL 5.7) bisa tidak punya index yang dipakai query aging. Index untuk `bank_payment`, `bankpo_payment_detail(invoice_id)` tidak ada di skrip **(perlu dicek dengan `EXPLAIN`; mungkin sudah ada di ERP)**. | Query bisa jauh lebih lambat di produksi daripada di demo. | Sinkronkan skrip dengan DB demo dan cek `EXPLAIN` tiap query berat di MySQL 5.7. |
| G-20 | SQL berat / performa | `src/server/repo/apar.repo.ts:376-394`, `drill/ap-ar.ts:18-21` | Setiap panggilan `apOpenInvoices`/`arOpenInvoices` menyalin ulang seluruh hasil cache (`map` + spread) dan drill menyalinnya sekali lagi. | Dengan ±160 ribu baris, tiap klik drill/aging membuat ratusan ribu objek sementara. | Simpan bentuk akhir di cache atau kembalikan referensi baca-saja. |

## 4. Perkiraan jumlah query per halaman (estimasi dari kode)

Jalur "tabel saldo awal ada", semua entitas, 1 bulan, cache dingin. Bukan hasil ukur.

| Halaman / aksi | Estimasi | Catatan |
|---|---:|---|
| Summary | ±45 + (tagihan AP positif ÷ 1000) | G-01, G-04; sebelum perbaikan lama ±50 + 35 dari Data Checks |
| Cash Position | ±18 | Cash Position penuh (≈10) + Runway (≈8, termasuk jurnal kas 3 bulan) |
| P&L | ±11 | P&L 2 + Fixed Cost 1 + Runway ≈8 |
| Cash Flow | ±12 | Cash Flow ≈8 + Expense Paid ≈4 (dua pengambilan jurnal kas — G-06) |
| Payables / Receivables | ±8 | + paginasi tabel dari cache (0 query) |
| Payment Plan (tanpa inflow) | ±5 + (tagihan AP positif ÷ 1000) | G-01 |
| Tiap klik drill (cache hangat) | 0–2 | sudah jauh membaik |
| Data Checks (buka panel) | ±30 + Q7 (diukur 197 detik di demo) | G-07 |
| Hover menu (preload) | = biaya halaman tujuan | G-03 |

## 5. Lima prioritas perbaikan teratas

1. **G-01 — status tagihan Payment Plan.** Ambil status hanya untuk tagihan yang relevan (jatuh tempo ≤ horizon + terlambat) atau gabungkan ke satu query; ini menghapus puluhan–ratusan query berurutan dari Summary dan Payment Plan.
2. **G-03 + G-02 — matikan preload hover untuk halaman berat dan beri batas waktu query.** Murah dikerjakan, dan mencegah satu halaman lambat membekukan seluruh aplikasi (kolam 5 koneksi).
3. **F-04 + G-19 — selesaikan AP Aging di MySQL 5.7 nyata.** Pasang index yang benar, periksa `EXPLAIN`, tulis ulang query inti (jumlahkan pembayaran per tagihan lebih dulu); lalu sinkronkan skrip index.
4. **G-04 + G-05 + G-06 — hentikan pekerjaan ganda antar metrik.** Satu perhitungan Cash Position, memo untuk Runway/Revenue/Fixed Cost/Expense Paid, satu pengambilan akun P&L per periode, satu pengambilan jurnal kas bersama.
5. **G-08 + G-09 + G-07 — bug yang terlihat pengguna.** Status tagihan salah tampil, dropdown grafik yang tidak berfungsi, dan Data Checks yang bisa gagal total oleh satu pemeriksaan. Kecil dikerjakan, langsung terasa.

Setelah itu: G-14 (tabel arsip), G-10 (loop entitas Expense Paid), G-11 (batas ukuran cache), G-12/G-13 (pecah halaman besar dan satukan konstanta), dan tambah test "anggaran query" untuk Summary, Cash Flow, Payment Plan, Runway (F-18).

## 6. Batas audit ini

- Tidak ada query ke database dan tidak ada profil waktu; semua angka performa adalah estimasi dari struktur kode dan **perlu dibuktikan** dengan `EXPLAIN` / log query (terutama G-01, G-04, F-04).
- Saya menjalankan `npm test` (unit, tanpa DB): **40 file, 185 test lulus**. `npm run typecheck` **tidak** saya jalankan (agar tidak menulis berkas apa pun).
- Tidak diaudit mendalam: keamanan (login, sesi, rate-limit). Catatan sepintas **(perlu dicek)**: `saveAccountMappingFn` (`src/functions/settings.fn.ts:60`) hanya butuh pengguna yang sudah login, tanpa pemeriksaan peran, padahal mengubah pemetaan akun untuk semua orang.
- Perilaku di browser (hover preload G-03, tampilan status G-08, dropdown grafik G-09) saya simpulkan dari kode, belum saya coba di browser.
- Tabel `docs/*.md` lain, skrip `scripts/seed`, dan test integrasi (`tests/integration`) tidak saya baca mendalam.

## 7. Status perbaikan (diperbarui setelah perbaikan dikerjakan)

Dikerjakan atas permintaan user. Diverifikasi: `tsc --noEmit` bersih, **218 unit test lulus** (dari 185; 33 test baru), `npm run build` berhasil. Query SQL baru diperiksa dengan `EXPLAIN` di DB dev (hanya membaca; semuanya valid dan memakai index), dan satu query dijalankan untuk ukur waktu. **Belum**: `npm run test:db` (test integrasi) tidak dijalankan karena memicu query berat di DB; tampilan di browser belum dicoba.

| ID | Status | Apa yang dilakukan |
|---|---|---|
| G-01 | Selesai | Status voucher diambil dengan **satu** query (`listActivePlanStatuses`, hanya voucher Posted / Partialy Paid / Not Posted); tagihan yang jatuh tempo setelah horizon tidak ikut dihitung. Di DB dev: 39.138 baris dalam 1,7 detik, menggantikan ±puluhan–ratusan query berurutan. Test: `query-budget.test.ts`. |
| G-02 | Selesai | Batas waktu query per koneksi (`DB_QUERY_TIMEOUT_MS`, bawaan 120 detik; 0 = tanpa batas): `max_execution_time` untuk MySQL 5.7 dan `max_statement_time` untuk MariaDB (fallback terverifikasi di DB dev). **Dampak:** query AP Aging yang diukur 624 detik di DB demo kini akan gagal dengan pesan error setelah 120 detik, bukan menggantung. |
| G-03 | Selesai | `defaultPreload: false` di `src/router.tsx`; hover menu tidak lagi memuat halaman berat. |
| G-04 | Selesai | `balancesAt` / `balancesBySegmentAt` / `unsettledByChannel` di-memo 60 detik, jadi semua varian Cash Position, Runway, Cash Flow, rekonsiliasi AP/AR memakai satu bacaan. `computeRunwayMetrics` di-memo dan membaca bagian-bagiannya paralel. |
| G-05 | Selesai | `pl-movements.ts`: satu bacaan GL untuk akun P&L + OCI + basket Fixed Cost; P&L, Fixed Cost, Budget (dan pembanding Revenue) menyaring di memori. Revenue, Fixed Cost, Budget, Expense Paid kini di-memo. Test: 3 metrik = 1 bacaan GL. |
| G-06 | Selesai | `linesOfCashJournals` di-memo dan semua pemanggil memakai daftar akun kas terlebar (kas+bank+deposit), jadi Cash Flow, Expense Paid, drill, dan Runway berbagi bacaan. Satu `makeIsOurCash` menggantikan 3 salinan. |
| G-07 | Selesai | Semua pemeriksaan Data Checks dibungkus `settle` (satu gagal tidak menyembunyikan yang lain); Q1b, Q7, Q8 memakai `NOT EXISTS`; hitungan "belum diposting" membaca semua tabel GL yang terkait. Test baru `data-checks.service.test.ts`. |
| G-08 | Selesai | Komponen `PlanStatusPill` (kode status → teks i18n + warna) dipakai di Summary dan drill; "Aman" pindah ke i18n. |
| G-09 | Selesai | Parameter `chart` dan dropdown YTD/12 bulan dihapus (tidak pernah memengaruhi data); label grafik kini diambil dari periode yang dipilih. |
| G-10 | Selesai | Expense Paid: indeks per lokasi sekali jalan, `Set`, bacaan paralel, di-memo. Jumlah per entitas kini memakai aturan yang sama dengan total ("direct" dari portion alokasi, ditempel ke entitas baris biayanya). Test: jumlah per entitas = total. |
| G-11 | Selesai | Cache `memo`: urutan LRU sungguhan, batas total baris (1,5 juta), dan tidak menyimpan hasil yang dimulai sebelum `clearCache()`. 3 test baru. |
| G-12 | Sebagian | Payables dan Receivables jadi satu komponen `AgingPage` (route tinggal ±50 baris); penyusun data Cash Flow dipindah ke `lib/finance/cashflow-view.ts` (diuji); `summarizePlan` untuk Payment Plan. Halaman P&L, Summary, dan Payment Plan masih panjang (sebagian besar JSX) dan belum dipecah. |
| G-13 | Sebagian | Satu sumber untuk tipe tagihan AP, tipe jurnal pinjaman/aset tetap, label `Unclassified`, dan grup akun langsung/pendapatan (`account-groups.ts`). Sisa: beberapa literal nama grup akun di `cashflow.ts` (aturan fallback) dan `itemType === 3` di `apar.ts`. |
| G-14 | Selesai | `journalLines` menerima daftar tabel; drill rentang tanggal memakai `tablesBetween` (dipindah ke `gl-tables.ts`, diuji). |
| G-15 | Selesai | Hasil `linesOfCashJournals` di-deduplikasi per baris jurnal; test dengan 1001 akun. |
| G-16 | Selesai | Semua `ColumnDef<…, any>` → `unknown`; `DataTable` tanpa `any`; 3 `as never` diganti helper `searchUpdater`. Sisa `any` hanya di `bigint-string.ts` (internal drizzle). |
| G-17 | Selesai | Label P&L, "Biaya Tetap", "0 – 30 hari", "Aman" pindah ke `id.json`/`en.json` (label server memakai prefix `i18n:`); `netKas` → `netCash`; komentar Indonesia diganti Inggris. |
| G-18 | Selesai | `settings.fn` memakai `getCachedCoaTree` dan `loadMappingState` (satu sumber untuk mapping default/korup). Penyimpanan mapping tetap membaca CoA terbaru. |
| G-19 | Sebagian | Skrip index diberi blok usulan (dikomentari) untuk `idx_dash_apar_mod_type_date` dan catatan pemeriksaan `bankpo_payment_detail` / `bank_payment`. Definisi pasti index itu tidak bisa saya pastikan tanpa `SHOW CREATE TABLE`; **perlu DBA**. |
| G-20 | Selesai | Cache aging menyimpan bentuk akhir (`vendorId`/`customerId`) sekali; tidak ada lagi salinan 160 ribu baris per panggilan, termasuk di drill. |

Temuan lama yang ikut tuntas: F-02, F-03 (cache dipakai bersama), F-07, F-09 (paralel), F-12 (P&L memakai `accountSide` dari `sign.ts`), F-15, F-17, F-18 (+ test anggaran query untuk P&L+Fixed Cost+Budget, Revenue, Payment Plan, balance, Expense Paid, Data Checks), F-19, F-23.

**Masih terbuka (butuh keputusan/DBA, bukan kode):**
- **F-04** — query inti AP Aging (join kartu → detail → pembayaran, GROUP BY 12 kolom) belum ditulis ulang: percobaan sebelumnya >600 detik di MariaDB dan hasilnya harus diuji di **MySQL 5.7 sungguhan** dengan `EXPLAIN`. Dengan batas waktu baru (G-02), halaman AP Aging di DB demo akan menampilkan error setelah 120 detik sampai query ini diperbaiki.
- **F-06** — paginasi jurnal masih OFFSET (keyset belum).
- **F-24** — kode rujukan keputusan (`G17`, `G23`, …) masih di beberapa komentar.
- `journalLines` belum memecah daftar akun >1000 (tidak terjadi pada data sekarang).
