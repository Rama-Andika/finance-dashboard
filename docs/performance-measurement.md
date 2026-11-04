# Pengukuran Performa (Fase 0)

> Terakhir diperbarui: 2026-11-04

Tujuan: tahu **bagian mana yang lambat dan seberapa lambat** sebelum mengoptimalkan apa pun. Dokumen ini menjelaskan alat ukurnya, cara memakainya, dan apa yang dicatat. Semua perintah yang menyentuh database harus dijalankan atas izin user (aturan CLAUDE.md).

## 1. Alat ukur yang tersedia

| Alat             | Cara menyalakan                                | Yang tampil di log server                                                                                                                                                                            |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waktu per metrik | `PERF_LOG=1`                                   | `perf: metric revenue 842ms` — satu baris tiap metrik yang benar-benar dihitung (cache hit tidak dicatat). Metrik bersarang tumpang tindih: `metric summary` sudah mencakup semua metrik di dalamnya |
| Menunggu koneksi | `PERF_LOG=1`                                   | `perf: a query is waiting for a free connection (pool is full)` — muncul saat semua koneksi pool sedang dipakai                                                                                      |
| Query lambat     | `SLOW_QUERY_MS=1000` (default; `0` = mati)     | `perf: slow query 5320ms: SELECT STRAIGHT_JOIN ...` — teks SQL dengan placeholder `?`, **tanpa nilai parameter** (aman untuk data sensitif). Waktunya termasuk menunggu koneksi pool                 |
| Probe Summary    | `PERF_PROBE=1 npm run test:db -- perf-summary` | Waktu **dingin** (cache kosong, seperti login pertama atau restart server) dan **hangat** untuk `this-month`, `last-month`, dan `ytd`, semua entitas                                                 |

Semuanya mati atau tak berbiaya saat `PERF_LOG=0`. `SLOW_QUERY_MS` boleh tetap menyala di produksi untuk menemukan query yang melambat saat data tumbuh.

## 2. Skenario yang diukur

Ukur tiap skenario **tiga kali**, catat angka tengah. Mulai dari server yang baru dinyalakan.

| #   | Skenario                                                                                   | Cara                                                   |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| A   | Login pertama / startup dengan session lama                                                | Restart server, buka `/summary`                        |
| B   | Muat ulang (F5) setelah lebih dari 60 detik                                                | Buka `/summary`, tunggu 70 detik, F5                   |
| C   | Muat ulang (F5) dalam 60 detik                                                             | F5 segera (memo masih hangat; pembanding)              |
| D   | Tombol "Refresh now"                                                                       | Tekan tombol, buka `/summary` selama snapshot dibangun |
| E   | Tiap halaman metrik (Revenue, P&L, Cash Flow, Payables, Receivables, Payment Plan, Budget) | Buka satu per satu setelah restart                     |
| F   | Filter berbeda                                                                             | `ytd` dan `last-12m`, semua entitas dan satu entitas   |

## 3. Yang dicatat

Isi tabel ini (satu baris per skenario) lalu simpan di `docs/progress.md` atau lampirkan di diskusi:

| Skenario | Total waktu halaman | Metrik terlama (nama, ms) | Query terlama (ringkas, ms) | Ada "pool is full"? |
| -------- | ------------------- | ------------------------- | --------------------------- | ------------------- |

Tiga pertanyaan yang harus terjawab dari angka itu:

1. **Satu bagian mendominasi atau merata?** Kalau satu metrik > 50% waktu, mulai dari situ.
2. **Waktunya di query atau di Node?** Bandingkan waktu metrik dengan jumlah waktu query-nya. Selisih besar berarti pekerjaan JavaScript (decimal.js, penyaringan di memori).
3. **Antre di pool?** Kalau "pool is full" sering muncul, query bisa cepat tetapi saling menunggu (`DB_POOL_SIZE` 5, delapan metrik paralel, tiga irisan per query).

## 4. EXPLAIN untuk query terlambat

Untuk tiga query terlambat dari log, jalankan `EXPLAIN` di klien SQL (**izin user diperlukan**; jangan jalankan `EXPLAIN ANALYZE`, MySQL 5.7 tidak mendukungnya). Yang dicari:

- `type = ALL` pada tabel besar (`gl_detail`, `ap_ar_card`, `bank_payment`): pemindaian penuh, kemungkinan indeks belum ada. Cek apakah `docs/sql/dashboard-indexes.sql` sudah dijalankan di database itu.
- `rows` sangat besar pada tabel pertama join.
- `Using temporary` / `Using filesort` pada hasil besar.

Catat hasilnya; jangan menaruh nama klien, nomor rekening, atau data nyata di dokumen.

## 5. Data uji bervolume besar

DB `demo` (±1,5 juta baris `gl`, ±13,6 juta `gl_detail`) belum mewakili klien terbesar. Sebelum menyimpulkan "cukup cepat", ukur juga pada salinan data dengan volume 10 kali lipat. Skrip seed belum ada (`scripts/seed/index.ts`); keputusan cara membuat data uji diambil di fase berikutnya, **setelah** angka §3 terkumpul.

## 6. Batasan alat ini

- Hanya mengukur sisi server. Waktu render di browser dan ukuran muatan (payload) belum diukur; cek tab Network browser untuk ukuran respons `getSummaryFn`.
- Probe memakai `APP_TODAY` yang dipin di `tests/integration/setup.ts` (default 2025-10-15), jadi periode "Open" di DB `demo` mungkin bukan bulan berjalan sungguhan.
- Waktu pada DB lokal (MariaDB 10.4) tidak sama dengan MySQL 5.7 di produksi; yang dipakai adalah **rasio antarbagian**, bukan angka mutlak.

## 7. Hasil pengukuran pertama (DB lokal `demo`, 2026-11-04)

Probe Summary, semua entitas, `APP_TODAY` dipin 2025-10-15 (lihat catatan di bawah tabel). Waktu dalam detik, dari log `PERF_LOG=1`.

| Bagian                                       | this-month  | last-month | ytd         | Catatan                                                       |
| -------------------------------------------- | ----------- | ---------- | ----------- | ------------------------------------------------------------- |
| Total Summary, dingin                        | 337         | 335        | 329         | ditentukan oleh AP aging live (lihat catatan)                 |
| `runway`                                     | 52–60       | 51–59      | 56–60       | satu query per jurnal (`gl_id`) atas 3 bulan penuh: 47–56 dtk |
| `cashPortions` / `cashFlow`                  | 5–12        | 9–11       | **172–186** | query per jurnal yang sama; naik seiring jumlah bulan         |
| `cashPosition`                               | 3–8         | 7–8        | 3–6         | beberapa query GL @ 3–7 dtk, saling bersaing di pool          |
| `revenue`, `pnl`, `plMovements`              | 1–2         | < 0,1      | 2–3         |                                                               |
| `apAgingCore` / `paymentPlan`                | **325–336** | 325–335    | 327         | satu query tagihan terbuka live: 325–335 dtk                  |
| `ap_ar_card` pembayaran belum dialokasikan   | 8–12        | 12         | 10          |                                                               |
| Status voucher pembayaran (`bankpo_payment`) | 3           | 3          | 3           | satu query tetap                                              |

Catatan pembacaan:

- **Angka AP aging 325–336 detik adalah artefak lingkungan uji, bukan angka produksi.** `APP_TODAY` yang dipin ke 2025 lebih lama daripada snapshot, sehingga aging memakai query live ke tabel ERP (aturan di `tests/integration/setup.ts`). Di produksi, `asOf = hari ini` dibaca dari snapshot. Jadi total "dingin" ±330 detik **tidak** mewakili produksi; ukur ulang dengan snapshot yang terisi dan tanggal nyata sebelum menyimpulkan.
- **Kolom "hangat" tidak sungguh-sungguh hangat.** Run dingin berlangsung ±330 detik, sedangkan TTL memo metrik 60 detik, sehingga metrik yang selesai lebih awal sudah kedaluwarsa. Angka hangat (51/51/176 dtk) justru menunjukkan apa yang dilihat user pada F5 setelah lebih dari 60 detik.
- **Antre pool terjadi di awal setiap run** (45 kali "pool is full" selama tiga skenario). Satu query live 325 detik menduduki satu dari 5 koneksi sepanjang waktu itu; query lain berebut sisanya dan jadi lebih lambat dari waktu aslinya (`cashPosition` 3 dtk sendirian, 7–8 dtk saat bersaing).
- **Query paling berat di luar artefak AP:** query GL per jurnal (`gl_id`, `journal_type`, join periode) untuk klasifikasi arus kas. Ia dipakai `runway` (3 bulan, ±50 dtk) dan `cashFlow` (naik menjadi ±170 dtk untuk YTD). Query ini tidak memakai snapshot GL bulanan dan hanya di-memo 60 detik.

## 8. Cache SWR dan Summary bertahap (Phase 2)

Dengan _stale-while-revalidate_ pada `memoMetric`:

- Saat metrik melewati masa segar (`METRIC_FRESH_SECONDS`, default 60 detik), permintaan berikutnya tetap mendapat jawaban lama seketika, dan satu kalkulasi ulang berjalan di latar belakang selama masa basi (`METRIC_STALE_SECONDS`, default 180 detik).
- Menyalakan `PERF_LOG=1` akan menampilkan baris `perf: metric ...` saat kalkulasi ulang di latar belakang sedang berjalan, meskipun pengguna di browser sudah menerima respons dalam 0–5 ms.
- Summary memuat bertahap: bagian atas (`getSummaryHeadFn`) ditunggu di loader, sedangkan grafik (`getSummaryChartsFn`) dan kartu mini (`getSummaryMiniFn`) dimulai paralel tanpa `await` di loader.

## 9. Hasil sesudah Phase 1B dan Phase 2 (DB lokal `demo`, 2026-11-04)

Probe Summary yang sama dengan §7 (`PERF_PROBE=1`, semua entitas, `APP_TODAY` dipin 2025-10-15), hanya untuk `last-month` dan `ytd`, dijalankan **tanpa dev server dan tanpa proses lain**. Waktu dalam detik dari log `perf: metric ...`. "Sebelum" diambil dari §7. "Hangat" adalah jalankan kedua tepat setelah yang dingin, yaitu keadaan setelah cache 60 detik kedaluwarsa (F5 setelah semenit).

| Bagian | last-month sebelum | last-month sesudah | ytd sebelum | ytd sesudah |
| --- | --- | --- | --- | --- |
| `runway`, dingin | 51–59 | **33,4** | 56–60 | **36,5** |
| `cashPortions` / `cashFlow`, dingin | 9–11 | **15,3 / 15,8** | 172–186 | **82,2 / 86,9** |
| `cashPosition`, dingin | 7–8 | 5,3–8,7 | 3–6 | 4,4–9,2 |
| Total Summary, dingin | 335 | 331 | 329 | 373 |
| Total Summary, hangat | 51,5 | **16,9** | 176,6 | **55,9** |

Catatan pembacaan:

- **Perbaikan nyata tetapi bukan "milidetik".** Pada filter panjang (`ytd`) Cash Flow dingin turun dari sekitar 180 menjadi sekitar 87 detik, dan total hangat dari 177 menjadi 56 detik (sekitar 3 kali lebih cepat). `runway` turun dari sekitar 55 menjadi 33–36 detik (sekitar 1,6 kali). Target Phase 1B (puluhan detik menjadi milidetik) **belum tercapai**.
- **Filter satu bulan tidak membaik.** `last-month` dingin: `cashFlow` 15,8 detik, lebih lambat daripada baseline 9–11 detik. Sebabnya diduga pembacaan snapshot satu bulan tidak lebih murah daripada query langsung, ditambah beberapa pembacaan snapshot berjalan bersamaan (`runway` membaca 3 bulan, `cashFlow` 1 bulan) dan berebut koneksi pool.
- **Volume baris (diukur, `SELECT` read-only pada `dash_snap_cash_periods`):** snapshot kas berisi 5,09 juta baris untuk 46 periode (417 MB data + 397 MB indeks). Bulan-bulan 2024–2025 berisi 146–178 ribu baris (rata-rata seluruh periode 111 ribu), sekitar 3 baris per jurnal. Jadi `runway` (3 bulan: Juli–September 2025) membaca sekitar 0,52 juta baris dan `ytd` (Januari–September 2025) sekitar 1,48 juta baris. Query baca `dash_snap_cash_lines` tercatat 4–30 detik (`last-month`) dan 15–71 detik (`ytd`), yaitu hanya sekitar 20–40 ribu baris per detik: **terlalu lambat untuk sekadar memindahkan data**. Dugaan awal "jutaan baris dipindahkan ke Node" karena itu **tidak cukup menjelaskan** angka untuk filter 1–3 bulan.
- **Total dingin masih ditentukan AP aging langsung ke ERP** (326–371 detik): artefak tanggal yang dipin, bukan angka produksi (lihat §7).
- **Batas:** satu kali jalan per filter, satu mesin, MariaDB 10.4, buffer pool bisa berbeda dari pengukuran §7. Bacalah sebagai petunjuk arah, bukan angka mutlak.

Dugaan yang lebih kuat: join dengan subquery `DISTINCT` (semi-join) pada query baca. Untuk filter **semua entitas** join itu sebenarnya tidak perlu, karena setiap jurnal di snapshot sudah pasti punya minimal satu baris kas (begitu cara snapshot dibangun), sehingga cukup `SELECT ... WHERE period_id IN (...)`. Untuk filter entitas join tetap diperlukan. Langkah berikutnya: ukur dulu query yang sama tanpa join untuk semua entitas dan lihat `EXPLAIN`-nya (atas izin), sebelum mengubah kode.

### Sesudah join `DISTINCT` dihapus untuk filter semua entitas

Probe yang sama, tanpa dev server. Tes paritas snapshot melawan query langsung ke ERP lulus (semua entitas dan entitas pertama), jadi hasilnya identik. Detik, dingin kecuali disebut lain:

| Bagian | last-month (sebelumnya → sekarang) | ytd (sebelumnya → sekarang) |
| --- | --- | --- |
| `runway` | 33,4 → **23,2** | 36,5 → **22,7** |
| `cashPortions` | 15,3 → **4,8** | 82,2 → **49,6** |
| `cashFlow` | 15,8 → **8,7** | 86,9 → **61,5** |
| Total Summary, hangat | 16,9 → **11,8** | 55,9 → **56,3** (tidak berubah) |
| Query baca `dash_snap_cash_lines` | 4–30 → **1,5–14,6** | 15–71 → **8,4–22,7** |

- **Dugaan terbukti sebagian.** Query baca menjadi sekitar 2–3 kali lebih cepat, tetapi masih sekitar 65 ribu baris per detik, bukan milidetik. Cash Flow `ytd` dingin turun dari baseline 172–186 detik menjadi 61 detik, dan `runway` dari 51–60 detik menjadi 23 detik.
- **Sisa waktu ada di Node.** Untuk `ytd`, `cashPortions` 49,6 detik sedangkan baca snapshot 22,7 detik: selisih sekitar 27 detik dipakai mengubah sekitar 1,5 juta baris menjadi uang desimal (`decimal.js`) dan menjalankan alokasi kas proporsional. Ini selisih waktu, bukan pengukuran langsung per tahap.
- **Total hangat `ytd` tidak membaik (56 detik)** karena didominasi tahap Node itu. Untuk benar-benar turun ke orde detik, baris yang diproses harus dikurangi (agregasi alokasi kas per jurnal saat build untuk filter semua entitas), bukan hanya dipercepat membacanya.
- Batas: satu kali jalan per filter, satu mesin, MariaDB 10.4.

### Sesudah jalur cepat untuk uang dua desimal (tanpa `decimal.js` di pembacaan snapshot)

Pembaca snapshot kas kini mempertahankan teks uang yang sudah berbentuk dua desimal dan hanya memakai `decimal.js` untuk bentuk lain. Tes paritas snapshot melawan ERP lulus. Probe yang sama, tanpa dev server. Detik:

| Bagian | last-month (baseline Phase 0 → sebelumnya → sekarang) | ytd (baseline Phase 0 → sebelumnya → sekarang) |
| --- | --- | --- |
| `runway`, dingin | 51–59 → 23,2 → **18,4** | 56–60 → 22,7 → **17,8** |
| `cashPortions`, dingin | tidak diukur terpisah → 4,8 → **4,5** | tidak diukur terpisah → 49,6 → **27,0** |
| `cashFlow`, dingin | 9–11 → 8,7 → **7,5** | 172–186 → 61,5 → **31,7** |
| Total Summary, hangat | 51,5 → 11,8 → **10,8** | 176,6 → 56,3 → **33,1** |
| Query baca `dash_snap_cash_lines` | → 1,5–14,6 → **1,2–14,9** | → 8,4–22,7 → **9,8–17,8** |

- **Biaya terbesar di Node ternyata pembuatan objek `Decimal`.** Pada `ytd`, `cashPortions` turun dari 49,6 ke 27,0 detik (sekitar 22 detik hilang) tanpa mengubah SQL. Sisa selisih antara `cashPortions` (27 detik) dan baca snapshot (sekitar 18 detik) tinggal sekitar 9 detik untuk alokasi kas dan klasifikasi.
- **Dibanding baseline Phase 0:** Cash Flow `ytd` dingin 172–186 → 32 detik (sekitar 5–6 kali), total hangat `ytd` 177 → 33 detik (sekitar 5 kali), total hangat `last-month` 52 → 11 detik (sekitar 5 kali), `runway` 51–60 → 14–18 detik (sekitar 3 kali).
- **Masih bukan milidetik.** Membaca 0,5 sampai 1,5 juta baris dari tabel snapshot tetap memakan beberapa sampai belasan detik. Untuk turun ke orde detik, jumlah baris yang dibaca per permintaan harus dikurangi (mis. agregasi alokasi kas per jurnal saat build untuk filter semua entitas). Itu perubahan desain tersendiri.
- Batas: satu kali jalan per filter, satu mesin, MariaDB 10.4; selisih beberapa detik antar-jalan masih dalam kisaran noise.

## Riwayat Perubahan

| Tanggal    | Perubahan                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 2026-11-04 | Dokumen dibuat bersama alat ukur: `PERF_LOG`, `SLOW_QUERY_MS`, probe Summary                                      |
| 2026-11-04 | §7: hasil pengukuran pertama di DB lokal `demo` (probe Summary, tiga preset)                                      |
| 2026-11-04 | Phase 1A: snapshot GL memakai sidik jari periode dan pembangunan ulang otomatis bila periode dibuka-tutup ulang   |
| 2026-11-04 | Phase 1B: snapshot baris jurnal kas (dash_snap_cash_lines) untuk mempercepat runway dan Cash Flow                 |
| 2026-11-04 | Phase 2: cache SWR (`METRIC_FRESH_SECONDS`, `METRIC_STALE_SECONDS`), Summary bertahap, dan pelacakan via PERF_LOG |
| 2026-11-04 | Default `METRIC_STALE_SECONDS` diturunkan dari 600 ke 180 detik: angka yang dijawab dari cache paling lama sekitar 4 menit lebih tua (60 detik segar + 180 detik masa basi), sehingga selisih kartu dan drill-down lebih kecil. Tidak ada rumus atau query yang berubah. |
| 2026-11-04 | §9: hasil probe sesudah Phase 1B dan Phase 2 (`last-month` dan `ytd`): `ytd` hangat 177 → 56 detik, `ytd` Cash Flow dingin 180 → 87 detik, `runway` 55 → 33–36 detik; `last-month` Cash Flow dingin tidak membaik (15,8 vs 9–11 detik); target milidetik belum tercapai. |
| 2026-11-04 | §9: volume snapshot kas diukur (5,09 juta baris, 146–178 ribu baris per bulan); dugaan "jutaan baris dipindahkan" dikoreksi: kecepatan baca hanya 20–40 ribu baris per detik, dugaan baru adalah join `DISTINCT` yang tidak perlu untuk filter semua entitas. |
| 2026-11-04 | §9: hasil sesudah join `DISTINCT` dihapus untuk filter semua entitas: query baca snapshot kas 2–3 kali lebih cepat, Cash Flow `ytd` dingin 87 → 61 detik, `runway` 33–36 → 23 detik, total hangat `ytd` tetap 56 detik (sisa waktu ada di pengolahan Node). |
| 2026-11-04 | §9: hasil sesudah jalur cepat uang dua desimal di pembacaan snapshot kas: `ytd` hangat 56 → 33 detik, Cash Flow `ytd` dingin 62 → 32 detik, `runway` 23 → 18 detik; dibanding baseline Phase 0 sekitar 3–6 kali lebih cepat. |
