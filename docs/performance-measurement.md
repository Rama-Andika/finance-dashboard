# Pengukuran Performa (Fase 0)

> Terakhir diperbarui: 2026-11-10
>
> **Catatan (2026-11-10):** `PERF_LOG` sudah dihapus. Pengukuran durasi kini level `debug`: jalankan dengan `LOG_LEVEL=debug`. Semua penyebutan `PERF_LOG=1` di dokumen ini dibaca sebagai `LOG_LEVEL=debug`. Barisnya kini JSON, mis. `{"scope":"perf","label":"metric summary","durationMs":1234,"msg":"timed"}` (dulu `perf: metric summary 1234ms`). Query lambat tetap `warn` lewat `SLOW_QUERY_MS` dengan field `sql` dan `durationMs`. Lihat project-guide bab 9.6 dan 10.6.

Tujuan: tahu **bagian mana yang lambat dan seberapa lambat** sebelum mengoptimalkan apa pun. Dokumen ini menjelaskan alat ukurnya, cara memakainya, dan apa yang dicatat. Semua perintah yang menyentuh database harus dijalankan atas izin user (aturan CLAUDE.md).

## 1. Alat ukur yang tersedia

| Alat                      | Cara menyalakan                                | Yang tampil di log server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waktu per metrik          | `PERF_LOG=1`                                   | `perf: metric revenue 842ms` — satu baris tiap metrik yang benar-benar dihitung (cache hit tidak dicatat). Metrik bersarang tumpang tindih: `metric summary` sudah mencakup semua metrik di dalamnya                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Menunggu koneksi          | `PERF_LOG=1`                                   | `perf: a query is waiting for a free connection (pool is full)` — muncul saat semua koneksi pool sedang dipakai (hanya pool utama; refresh snapshot memakai pool sendiri)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Query lambat              | `SLOW_QUERY_MS=1000` (default; `0` = mati)     | `perf: slow query 5320ms: SELECT STRAIGHT_JOIN ...` — teks SQL dengan placeholder `?`, **tanpa nilai parameter** (aman untuk data sensitif). Waktunya termasuk menunggu koneksi pool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Probe Summary             | `PERF_PROBE=1 npm run test:db -- perf-summary` | Waktu **dingin** (cache kosong, seperti login pertama atau restart server) dan **hangat** untuk `this-month`, `last-month`, dan `ytd`, semua entitas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Waktu per langkah refresh | selalu menyala                                 | Satu baris per siklus: `refresh cycle (manual) finished in 11m 52s: AP/AR snapshot 11m 10s, warm invoice lists 0.6s, GL snapshot 1.2s, ...`. Muncul untuk siklus manual ("Refresh now"), siklus terjadwal yang memakan 5 detik atau lebih, dan siklus yang gagal. Siklus manual juga mencatat awal tiap langkah (`manual refresh: GL snapshot started`), jadi log menunjukkan langkah mana yang sedang berjalan saat tombol masih "Memperbarui...". Rebuild AP/AR mencatat rinciannya per sisi (`ap: settlements scan`, `ap: invoices scan`, `ap: invoice details`, penulisan tabel), begitu pula pembangunan satu bulan riwayat; `npm run dash:refresh` mencetak rincian yang sama |

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

| Bagian                              | last-month sebelum | last-month sesudah | ytd sebelum | ytd sesudah     |
| ----------------------------------- | ------------------ | ------------------ | ----------- | --------------- |
| `runway`, dingin                    | 51–59              | **33,4**           | 56–60       | **36,5**        |
| `cashPortions` / `cashFlow`, dingin | 9–11               | **15,3 / 15,8**    | 172–186     | **82,2 / 86,9** |
| `cashPosition`, dingin              | 7–8                | 5,3–8,7            | 3–6         | 4,4–9,2         |
| Total Summary, dingin               | 335                | 331                | 329         | 373             |
| Total Summary, hangat               | 51,5               | **16,9**           | 176,6       | **55,9**        |

Catatan pembacaan:

- **Perbaikan nyata tetapi bukan "milidetik".** Pada filter panjang (`ytd`) Cash Flow dingin turun dari sekitar 180 menjadi sekitar 87 detik, dan total hangat dari 177 menjadi 56 detik (sekitar 3 kali lebih cepat). `runway` turun dari sekitar 55 menjadi 33–36 detik (sekitar 1,6 kali). Target Phase 1B (puluhan detik menjadi milidetik) **belum tercapai**.
- **Filter satu bulan tidak membaik.** `last-month` dingin: `cashFlow` 15,8 detik, lebih lambat daripada baseline 9–11 detik. Sebabnya diduga pembacaan snapshot satu bulan tidak lebih murah daripada query langsung, ditambah beberapa pembacaan snapshot berjalan bersamaan (`runway` membaca 3 bulan, `cashFlow` 1 bulan) dan berebut koneksi pool.
- **Volume baris (diukur, `SELECT` read-only pada `dash_snap_cash_periods`):** snapshot kas berisi 5,09 juta baris untuk 46 periode (417 MB data + 397 MB indeks). Bulan-bulan 2024–2025 berisi 146–178 ribu baris (rata-rata seluruh periode 111 ribu), sekitar 3 baris per jurnal. Jadi `runway` (3 bulan: Juli–September 2025) membaca sekitar 0,52 juta baris dan `ytd` (Januari–September 2025) sekitar 1,48 juta baris. Query baca `dash_snap_cash_lines` tercatat 4–30 detik (`last-month`) dan 15–71 detik (`ytd`), yaitu hanya sekitar 20–40 ribu baris per detik: **terlalu lambat untuk sekadar memindahkan data**. Dugaan awal "jutaan baris dipindahkan ke Node" karena itu **tidak cukup menjelaskan** angka untuk filter 1–3 bulan.
- **Total dingin masih ditentukan AP aging langsung ke ERP** (326–371 detik): artefak tanggal yang dipin, bukan angka produksi (lihat §7).
- **Batas:** satu kali jalan per filter, satu mesin, MariaDB 10.4, buffer pool bisa berbeda dari pengukuran §7. Bacalah sebagai petunjuk arah, bukan angka mutlak.

Dugaan yang lebih kuat: join dengan subquery `DISTINCT` (semi-join) pada query baca. Untuk filter **semua entitas** join itu sebenarnya tidak perlu, karena setiap jurnal di snapshot sudah pasti punya minimal satu baris kas (begitu cara snapshot dibangun), sehingga cukup `SELECT ... WHERE period_id IN (...)`. Untuk filter entitas join tetap diperlukan. Langkah berikutnya: ukur dulu query yang sama tanpa join untuk semua entitas dan lihat `EXPLAIN`-nya (atas izin), sebelum mengubah kode.

### Sesudah join `DISTINCT` dihapus untuk filter semua entitas

Probe yang sama, tanpa dev server. Tes paritas snapshot melawan query langsung ke ERP lulus (semua entitas dan entitas pertama), jadi hasilnya identik. Detik, dingin kecuali disebut lain:

| Bagian                            | last-month (sebelumnya → sekarang) | ytd (sebelumnya → sekarang)     |
| --------------------------------- | ---------------------------------- | ------------------------------- |
| `runway`                          | 33,4 → **23,2**                    | 36,5 → **22,7**                 |
| `cashPortions`                    | 15,3 → **4,8**                     | 82,2 → **49,6**                 |
| `cashFlow`                        | 15,8 → **8,7**                     | 86,9 → **61,5**                 |
| Total Summary, hangat             | 16,9 → **11,8**                    | 55,9 → **56,3** (tidak berubah) |
| Query baca `dash_snap_cash_lines` | 4–30 → **1,5–14,6**                | 15–71 → **8,4–22,7**            |

- **Dugaan terbukti sebagian.** Query baca menjadi sekitar 2–3 kali lebih cepat, tetapi masih sekitar 65 ribu baris per detik, bukan milidetik. Cash Flow `ytd` dingin turun dari baseline 172–186 detik menjadi 61 detik, dan `runway` dari 51–60 detik menjadi 23 detik.
- **Sisa waktu ada di Node.** Untuk `ytd`, `cashPortions` 49,6 detik sedangkan baca snapshot 22,7 detik: selisih sekitar 27 detik dipakai mengubah sekitar 1,5 juta baris menjadi uang desimal (`decimal.js`) dan menjalankan alokasi kas proporsional. Ini selisih waktu, bukan pengukuran langsung per tahap.
- **Total hangat `ytd` tidak membaik (56 detik)** karena didominasi tahap Node itu. Untuk benar-benar turun ke orde detik, baris yang diproses harus dikurangi (agregasi alokasi kas per jurnal saat build untuk filter semua entitas), bukan hanya dipercepat membacanya.
- Batas: satu kali jalan per filter, satu mesin, MariaDB 10.4.

### Sesudah jalur cepat untuk uang dua desimal (tanpa `decimal.js` di pembacaan snapshot)

Pembaca snapshot kas kini mempertahankan teks uang yang sudah berbentuk dua desimal dan hanya memakai `decimal.js` untuk bentuk lain. Tes paritas snapshot melawan ERP lulus. Probe yang sama, tanpa dev server. Detik:

| Bagian                            | last-month (baseline Phase 0 → sebelumnya → sekarang) | ytd (baseline Phase 0 → sebelumnya → sekarang) |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `runway`, dingin                  | 51–59 → 23,2 → **18,4**                               | 56–60 → 22,7 → **17,8**                        |
| `cashPortions`, dingin            | tidak diukur terpisah → 4,8 → **4,5**                 | tidak diukur terpisah → 49,6 → **27,0**        |
| `cashFlow`, dingin                | 9–11 → 8,7 → **7,5**                                  | 172–186 → 61,5 → **31,7**                      |
| Total Summary, hangat             | 51,5 → 11,8 → **10,8**                                | 176,6 → 56,3 → **33,1**                        |
| Query baca `dash_snap_cash_lines` | → 1,5–14,6 → **1,2–14,9**                             | → 8,4–22,7 → **9,8–17,8**                      |

- **Biaya terbesar di Node ternyata pembuatan objek `Decimal`.** Pada `ytd`, `cashPortions` turun dari 49,6 ke 27,0 detik (sekitar 22 detik hilang) tanpa mengubah SQL. Sisa selisih antara `cashPortions` (27 detik) dan baca snapshot (sekitar 18 detik) tinggal sekitar 9 detik untuk alokasi kas dan klasifikasi.
- **Dibanding baseline Phase 0:** Cash Flow `ytd` dingin 172–186 → 32 detik (sekitar 5–6 kali), total hangat `ytd` 177 → 33 detik (sekitar 5 kali), total hangat `last-month` 52 → 11 detik (sekitar 5 kali), `runway` 51–60 → 14–18 detik (sekitar 3 kali).
- **Masih bukan milidetik.** Membaca 0,5 sampai 1,5 juta baris dari tabel snapshot tetap memakan beberapa sampai belasan detik. Untuk turun ke orde detik, jumlah baris yang dibaca per permintaan harus dikurangi (mis. agregasi alokasi kas per jurnal saat build untuk filter semua entitas). Itu perubahan desain tersendiri.
- Batas: satu kali jalan per filter, satu mesin, MariaDB 10.4; selisih beberapa detik antar-jalan masih dalam kisaran noise.

## 10. Efek pool refresh terpisah (Phase 3), uji A/B di DB lokal `demo`, 2026-11-05

Satu proses, tiga tahap berurutan. Beban "halaman Summary" = lima metrik sekaligus (posisi kas, Revenue, P&L, Cash Flow, runway) untuk rentang 2025-01-01 sampai 2025-09-30, cache dikosongkan tiap putaran. Tahap refresh: refresh AP/AR dipaksa (`force`) berjalan bersamaan dengan beban itu, diulang sampai refresh selesai. "Hari ini" dipin ke tanggal sungguhan. Tes sementara, sudah dihapus.

| Tahap                                       | Beban halaman: median / p90 / maks (detik) | Query mengantre koneksi | Lama refresh |
| ------------------------------------------- | ------------------------------------------ | ----------------------- | ------------ |
| Kontrol (tanpa refresh), 3 putaran          | 25,8 / – / 26,5                            | –                       | –            |
| Pool refresh terpisah (Phase 3), 23 putaran | **27,6** / 29,9 / 30,7                     | 45                      | 647 detik    |
| Pool bersama (sebelum Phase 3), 24 putaran  | **28,9** / 30,5 / 30,8                     | 48                      | 692 detik    |

- **Arahnya benar tetapi kecil.** Dengan pool terpisah, refresh menambah median beban halaman 1,8 detik (+7%) dibanding kontrol; dengan pool bersama 3,1 detik (+12%). Selisih kedua skenario sekitar 1,3 detik (sekitar 4–5%) dan refresh sendiri selesai 45 detik lebih cepat. Urutan uji sengaja menaruh baseline kedua (pemanasan cache database menguntungkannya), jadi arahnya tidak bisa dijelaskan oleh pemanasan, tetapi ini **satu kali jalan per tahap**, tanpa pengulangan: bacalah sebagai petunjuk, bukan bukti kuat.
- **Antrean koneksi hampir sama (45 vs 48).** Beban halaman itu sendiri sudah menjenuhkan 5 koneksi pengguna (sekitar 2 antrean per putaran) dengan atau tanpa refresh; yang dihilangkan Phase 3 hanya satu koneksi yang ditahan refresh.
- **Sisa perlambatan berasal dari server database, bukan dari pool.** Walau refresh memakai koneksi sendiri, beban halaman tetap 7% lebih lambat daripada kontrol: refresh dan pengguna berbagi CPU dan disk database yang sama. Pool terpisah tidak bisa menghilangkannya.
- **Dampak Phase 3 di produksi** bergantung pada ukuran server database dan jumlah pengguna; angka di atas dari satu mesin lokal dengan MariaDB 10.4 dan satu "pengguna" yang memuat beban berat terus-menerus.

## 11. Hasil agregasi AP/AR di SQL (Phase 4), DB lokal `demo`, 2026-11-05

Probe sementara (sudah dihapus), tiga putaran per angka, tanpa dev server. Tanggal acuan = hari snapshot AP/AR (2026-11-05), supaya yang dilayani snapshot, bukan query langsung ke ERP. "Jalur lama" = memuat daftar tagihan lalu menghitung di Node; "dingin" = daftar belum ada di memori (server baru menyala), "hangat" = daftar sudah di memori (keadaan setelah `warmApArSnapshot`). Milidetik, angka tengah:

| Bagian                                                            | Jalur lama dingin | Jalur lama hangat | Jalur agregat (SQL)       |
| ----------------------------------------------------------------- | ----------------- | ----------------- | ------------------------- |
| Aging AP, semua entitas                                           | 6.986             | 715               | **15.665**                |
| Aging AP, satu entitas                                            | 5.357             | 11                | **31**                    |
| Aging AR, semua entitas                                           | 85                | 7                 | 35                        |
| Aging AR, satu entitas                                            | 92                | 0                 | 4                         |
| Ringkasan Payment Plan, semua entitas (total, tanpa cache metrik) | 10.139            | 526               | 9.911 (hangat: **6.028**) |
| Ringkasan Payment Plan, satu entitas                              | 7.850             | 25                | 3.254 (hangat: 251)       |

- **Untuk filter semua entitas, jalur agregat lebih lambat daripada jalur lama yang hangat** (aging AP 15,7 detik lawan 0,7 detik; Payment Plan hangat 6,0 detik lawan 0,5 detik). Angkanya stabil antar-putaran (14,4 sampai 17,4 detik), jadi bukan noise. Penyebabnya bukan jumlah query atau tabel turunan, tetapi pilihan indeks (lihat §11.1).
- **Untuk satu entitas jalur agregat jauh lebih cepat dari jalur lama dingin** (aging AP 5,4 detik menjadi 31 milidetik; Payment Plan 7,9 detik menjadi 3,3 detik, sisanya posisi kas) karena memakai indeks `module_type, location_id, due_date`.
- **Jalur lama dingin hampir tidak terjadi di produksi**, karena `warmApArSnapshot` memuat keempat daftar setelah tiap refresh, dan Phase 4 sengaja tidak mengubahnya (tabel tagihan dan drill-down masih butuh daftar). Pembanding yang adil untuk pengguna adalah kolom "lama hangat".
- **Yang tidak diukur:** pemakaian memori. Manfaat Phase 4 (tidak lagi memuat ratusan ribu baris per permintaan) hanya terwujud penuh bila `warmApArSnapshot` juga tidak perlu memuatnya; selama masih dimuat, memori tidak berkurang.
- Batas: satu mesin, MariaDB 10.4 (MySQL 5.7 produksi bisa memilih rencana query berbeda), data demo; satu pola filter.

### 11.1 Diagnosis: pilihan indeks, bukan agregasinya (DB lokal `demo`, MariaDB 10.4.32, 2026-11-05)

Tabel `dash_snap_ap_ar_open`, sisi AP: sekitar 155 ribu baris. Query tanpa filter entitas (`WHERE module_type = ?` saja) dijalankan sendiri-sendiri, tiga kali, milidetik (median). `EXPLAIN` menunjukkan optimizer memilih indeks `idx_dash_open_mod_party` (`type: ref`, perkiraan 65.780 baris) yang tidak mencakup kolom lain, sehingga tiap baris diambil lewat kunci utama satu per satu. Dengan `IGNORE INDEX` ia memindai tabel berurutan (`type: ALL`).

| Query                                                          | Indeks default | Dengan `IGNORE INDEX` |
| -------------------------------------------------------------- | -------------- | --------------------- |
| Pindai polos (`SUM(balance)`)                                  | 4.199          | **345**               |
| Pembaca daftar tagihan jalur lama (162.865 baris, semua kolom) | 4.804          | **750**               |
| Aging AP per pihak (bucket dengan batas tanggal)               | 10.945         | **1.682**             |
| Total per tanggal jatuh tempo                                  | 4.599          | **664**               |
| Daftar akun kontrol (`DISTINCT coa_id`)                        | 4.229          | **403**               |

- **Biaya utama adalah pengambilan baris lewat indeks yang salah**, bukan perhitungan: pindai polos saja sudah 4,2 detik (sekitar 6,7 detik sisanya untuk bucket pada query aging). Menulis bucket sebagai batas tanggal (tanpa `DATEDIFF`) tidak mengubah apa pun pada indeks default (10,9 detik lawan 10,8 detik), jadi `DATEDIFF` bukan penyebab. Tabel turunan juga bukan penyebabnya (versi tanpa tabel turunan 13,2 detik, sedikit lebih lambat).
- **Pembaca jalur lama ikut terkena**: memuat daftar tagihan (dipakai `warmApArSnapshot`, tabel tagihan, drill-down) memakan 4,8 detik dan turun ke 0,75 detik dengan petunjuk yang sama. Jadi temuan ini berlaku di luar Phase 4.
- **Dengan filter entitas indeks itu memang berguna** (aging AP satu entitas 31 ms), jadi petunjuk hanya masuk akal bila tidak ada filter lokasi.
- Empat query aging yang berjalan bersamaan memakan 13,0 detik (bukan jumlah 22 detik; sebagian tumpang tindih). Setelah petunjuk indeks, perkiraan total aging AP semua entitas sekitar 2 detik. Itu **perkiraan dari angka di atas, belum diukur**, dan masih di atas 0,7 detik jalur lama hangat; selisihnya dibayar sekali per snapshot karena hasilnya di-cache selama snapshot yang sama.
- Batas: MariaDB 10.4 pada satu mesin; MySQL 5.7 produksi mungkin sudah memilih pemindaian tabel sendiri, atau tidak. `IGNORE INDEX` sah di kedua versi dan membuat pilihan itu pasti, tetapi nama indeks harus tetap sama dengan skema. Tabel riwayat (`dash_snap_ap_ar_hist_*`) belum diperiksa.

## 12. Hasil sesudah petunjuk indeks (Phase 5), DB lokal `demo`, 2026-11-05

Probe sementara (sudah dihapus), tiga putaran per angka, tanggal acuan hari snapshot (2026-11-05). Tes paritas `ap-ar-aggregate` tetap lulus (hasil identik) dan turun dari 97 detik menjadi 6 detik.

**Bentuk petunjuk (sisi AP, semua entitas, milidetik):**

| Query                                  | Indeks default | `FORCE INDEX (PRIMARY)` | `IGNORE INDEX (sekunder)` |
| -------------------------------------- | -------------- | ----------------------- | ------------------------- |
| Pindai polos                           | 3.538          | **386**                 | 393                       |
| Pembaca daftar tagihan (162.865 baris) | 4.293          | **761**                 | 735                       |

`FORCE INDEX (PRIMARY)` sama cepatnya dengan `IGNORE INDEX` dan `EXPLAIN` menunjukkan `type: ALL` (pemindaian tabel). Bentuk `PRIMARY` yang dipakai kode sudah terbukti.

**Sebelum (§11) dan sesudah Phase 5, milidetik, angka tengah:**

| Bagian                                        | Jalur lama dingin | Jalur lama hangat | Agregat SQL sebelum  | Agregat SQL sesudah      |
| --------------------------------------------- | ----------------- | ----------------- | -------------------- | ------------------------ |
| Aging AP, semua entitas                       | 6.986 → **1.411** | 715 → 583         | 15.665               | **2.236**                |
| Aging AP, satu entitas                        | 5.357 → 875       | 11 → 5            | 31                   | 9                        |
| Ringkasan Payment Plan, semua entitas (total) | 10.139 → 3.718    | 526 → 361         | 9.911 (hangat 6.028) | 3.889 (hangat **1.711**) |
| Ringkasan Payment Plan, satu entitas          | 7.850 → 3.262     | 25 → 12           | 3.254 (hangat 251)   | 2.608 (hangat 126)       |

- **Petunjuk bekerja seperti diperkirakan.** Agregat aging AP semua entitas turun sekitar 7 kali (15,7 menjadi 2,2 detik), pembaca daftar tagihan sekitar 5,6 kali (4,3 menjadi 0,76 detik), pindai polos sekitar 9 kali. Ringkasan Payment Plan hangat turun sekitar 3,5 kali (6,0 menjadi 1,7 detik); sisanya adalah tiga pemindaian ditambah AR.
- **Jalur lama ikut menjadi lebih cepat** karena pembaca daftarnya sama: memuat daftar tagihan sekarang sekitar 1,4 detik, bukan 7 detik. Itu juga mempercepat `warmApArSnapshot` setelah tiap refresh.
- **Untuk semua entitas agregat SQL tetap lebih lambat daripada jalur lama yang hangat** (aging AP 2,2 detik lawan 0,6 detik; Payment Plan hangat 1,7 detik lawan 0,4 detik). Selisihnya dibayar sekali per snapshot (aging di-cache selama snapshot yang sama) atau sekali per masa cache metrik (Payment Plan). Untuk satu entitas agregat sudah setara atau lebih cepat (aging AP 9 ms).
- **Yang masih tidak terukur:** memori. Agregat SQL baru menghemat memori bila `warmApArSnapshot` berhenti memuat keempat daftar tagihan; selama masih dimuat, memori tidak berkurang dan jalur agregat hanya membuat permintaan semua entitas sedikit lebih lambat daripada jalur lama hangat. Pada data sebesar produksi (jutaan baris) hitungan itu bisa berbalik, karena memuat daftar penuh makin mahal; ini belum diukur.
- Batas: satu mesin, MariaDB 10.4; MySQL 5.7 produksi bisa memilih rencana lain (petunjuk membuat pilihannya pasti). Tabel riwayat tidak diubah dan tidak diukur.

## 13. Biaya `warmApArSnapshot`: memori dan jeda event loop, DB lokal `demo`, 2026-11-05

Probe sementara (sudah dihapus), Node dengan `--expose-gc` supaya heap diukur sesudah pembersihan memori. Empat daftar yang dimuat `warmApArSnapshot` setelah tiap snapshot dibangun. Jeda event loop diukur dengan `monitorEventLoopDelay` (resolusi 5 ms) selama warm-up berjalan.

| Daftar                      | Baris   | Waktu muat | Heap                                   |
| --------------------------- | ------- | ---------- | -------------------------------------- |
| Tagihan terbuka AP          | 162.865 | 725 ms     | **+78,9 MB**                           |
| Pembayaran tanpa alokasi AP | 145     | 5 ms       | kecil                                  |
| Tagihan terbuka AR          | 1.467   | 358 ms     | +0,8 MB                                |
| Pembayaran tanpa alokasi AR | 41      | 3 ms       | kecil                                  |
| **Keempatnya tersimpan**    |         |            | **78 MB** (dasar 18 MB sebelum dimuat) |

| Warm-up penuh (tiga putaran) | Lama   | Jeda event loop maks / p99 |
| ---------------------------- | ------ | -------------------------- |
| 1                            | 600 ms | 13 ms / 11 ms              |
| 2                            | 601 ms | 26 ms / 12 ms              |
| 3                            | 689 ms | 12 ms / 11 ms              |

- **Waktunya murah.** Warm-up penuh sekitar 0,6 sampai 0,7 detik dan event loop tidak terblokir lama (jeda terbesar 26 ms). Jadi warm-up bukan penyebab request melambat; biaya yang nyata adalah memori.
- **Memori: sekitar 0,49 KB per baris tagihan** (78,9 MB untuk 162.865 baris). Angka kecil di baris pembayaran bukan pengukuran yang sahih (selisih heap bisa negatif karena sampah dari langkah sebelumnya ikut terbersihkan).
- **Ekstrapolasi linear, belum diukur:** satu juta baris tagihan AP sekitar 0,5 GB, lima juta sekitar 2,4 GB, ditambah bobot cache metrik dan daftar tagihan Payment Plan (`plan.bills`) yang dibangun darinya, yang tidak diukur di sini. Batas heap Node (`--max-old-space-size`) dan batas bobot memo (1,5 juta baris untuk seluruh cache) menentukan titik tak aman; keduanya perlu dicek terhadap volume klien sebenarnya.
- Batas: satu mesin, satu bentuk data demo (hampir semua baris AP, AR sangat kecil); jumlah entitas dan kolom teks panjang pada data klien bisa mengubah ukuran per baris.

## 14. Rincian waktu rebuild AP/AR paksa, DB lokal `demo`, 2026-11-05

`npm run dash:refresh -- --force` (rebuild penuh yang juga dikerjakan tombol "Refresh now"), tanpa dev server dan tanpa beban halaman, satu kali jalan. Rincian dicetak oleh log waktu per langkah (`step-timer.ts`). Hasil: 164.332 tagihan terbuka dan 186 pembayaran tanpa alokasi (sama dengan jumlah sebelumnya: AP 162.865 + AR 1.467, dan 145 + 41).

| Langkah                                                                                        | Waktu      | Bagian dari 3m 28s |
| ---------------------------------------------------------------------------------------------- | ---------- | ------------------ |
| AP: pemindaian pelunasan (join `ap_ar_card_detail` dengan `ap_ar_card`, `GROUP BY invoice_id`) | 1m 19s     | sekitar 38%        |
| AP: pemindaian seluruh tagihan (di-stream, saldo dihitung di Node)                             | 1m 30s     | sekitar 43%        |
| AP: detail tagihan terbuka (per 1000 id, berurutan)                                            | 13,3 detik | sekitar 6%         |
| AP: pembayaran tanpa alokasi                                                                   | 7,1 detik  | sekitar 3%         |
| AR: keempat langkah di atas                                                                    | 2,4 detik  | sekitar 1%         |
| Tulis tabel tagihan terbuka (batch 1000 baris, lalu tukar nama)                                | 12,2 detik | sekitar 6%         |
| Tulis tabel pembayaran tanpa alokasi                                                           | 58 ms      |                    |

- **Tanpa beban, rebuild paksa 3m 28s**, bukan 11 menit. Angka 647 sampai 692 detik di §10 diukur saat mesin juga melayani beban halaman terus-menerus; selisihnya adalah persaingan sumber daya database, bukan biaya rebuild sendiri.
- **Dua pemindaian penuh `ap_ar_card` memakan sekitar 81% waktu** (pelunasan 79 detik, tagihan 90 detik). Pencarian detail berurutan (yang sempat dicurigai) hanya 6%, jadi bukan sasaran pertama. Penyebab lambatnya dua pemindaian itu belum diperiksa (`EXPLAIN` belum dijalankan); bisa jadi pilihan indeks, seperti temuan §11.1 pada tabel snapshot.
- Waktu rebuild naik mengikuti jumlah baris `ap_ar_card` seluruhnya, bukan hanya tagihan terbuka, karena kedua pemindaian membaca semuanya (lihat catatan volume data).
- **Belum diukur:** pembangunan satu bulan riwayat (memakai pemindaian yang sama), langkah GL dan kas, dan total siklus manual lengkap.
- Batas: satu kali jalan, satu mesin, MariaDB 10.4.

### 14.1 EXPLAIN dua pemindaian besar (DB lokal `demo`, MariaDB 10.4.32, hanya membaca, 2026-11-05)

Ukuran tabel (perkiraan `information_schema`): `ap_ar_card` sekitar 1,99 juta baris (552 MB data, 772 MB indeks), `ap_ar_card_detail` sekitar 1,88 juta baris (219 MB data, 375 MB indeks). Jadi data demo sudah berjuta-juta baris di tabel kartu; yang 163 ribu hanyalah tagihan **terbuka**. Indeks `idx_dash_*` dari `docs/sql/dashboard-indexes.sql` terpasang di DB lokal ini.

| Pemindaian                                   | Rencana yang dipilih optimizer                                                                                                                                                                                         | Artinya                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Semua tagihan AP (`invoices scan`, 90 detik) | Indeks `idx_dash_apar_mod_loc_date` (`module_type`, `location_id`, `transaction_date`), `ref` hanya pada `module_type`, perkiraan **994.032 baris**, `Using index condition; Using where`                              | Indeks itu tidak memuat `transaction_type`, `in_out`, dan `amount`, jadi hampir satu juta baris diambil satu per satu lewat kunci utama (pola yang sama dengan temuan §11.1, tetapi pada tabel 2 juta baris) |
| Pelunasan AP (`settlements scan`, 79 detik)  | Tabel `p` (`ap_ar_card`) lewat indeks `trans_type`, perkiraan 104.558 baris, lalu `ap_ar_card_detail` lewat `ap_arcard_id` (sekitar 11 baris per kartu); `Using temporary; Using filesort` untuk `GROUP BY invoice_id` | Pengambilan baris `p` satu per satu, lalu tabel sementara dan pengurutan di database. Indeks penutup `idx_dash_apard_inv_card_amt` (`invoice_id`, `ap_ar_card_id`, `amount`) ada, tetapi tidak dipilih       |

- **Ini dugaan yang kuat, belum terbukti.** `EXPLAIN` menunjukkan rencana dan perkiraan, bukan waktu. Pembuktiannya dengan mengukur varian (mis. `FORCE INDEX (PRIMARY)` untuk pemindaian tagihan, atau urutan join yang dimulai dari indeks penutup untuk pelunasan).
- Hasil rencana bergantung pada versi database dan statistik tabel. MySQL 5.7 produksi bisa memilih rencana lain, dan indeks `idx_dash_*` mungkin belum dipasang di DB klien.

### 14.2 Varian dua pemindaian besar (DB lokal `demo`, MariaDB 10.4.32, hanya membaca, satu kali jalan, 2026-11-05)

Sisi AP, tanggal acuan 2026-11-06. Hasil semua varian dibandingkan dan **identik** (jumlah baris, jumlah saldo, dan checksum id sama).

**Pemindaian semua tagihan** (2.043.179 baris AP, hanya dihitung dan dijumlahkan, jadi biaya database murni):

| Varian                                                         | Rencana                                                                                 | Waktu                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Sekarang (rencana optimizer)                                   | `idx_dash_apar_mod_loc_date`, `ref`, perkiraan 994.032 baris, pengambilan satu per satu | 129 detik                                   |
| `FORCE INDEX (PRIMARY)`                                        | `type: ALL`, pemindaian tabel berurutan                                                 | **5,3 detik** (sekitar 24 kali lebih cepat) |
| `FORCE INDEX (PRIMARY)`, semua 2.043.179 baris dikirim ke Node | sama                                                                                    | 6,5 detik                                   |

**Pemindaian pelunasan** (1.884.944 kelompok `invoice_id`, hampir satu baris detail per kelompok):

| Varian                                                   | Rencana                                                                                         | Waktu                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S0: sekarang                                             | kartu lewat indeks `trans_type`, lalu detail lewat `ap_arcard_id`, tabel sementara dan filesort | 95,6 detik                               |
| S2: kartu dipindai berurutan dulu, lalu detail per kartu | `FORCE INDEX (PRIMARY)` pada kartu, tabel sementara dan filesort                                | 78,2 detik                               |
| S1: indeks penutup detail dulu, kartu lewat kunci utama  | `idx_dash_apard_inv_card_amt` (`Using index`), `eq_ref` ke kartu, tanpa tabel sementara         | **66,9 detik** (sekitar 30% lebih cepat) |

- **Pemindaian tagihan: kemenangan besar dan murah.** Satu petunjuk indeks mengubah 129 detik menjadi 5,3 detik tanpa mengubah hasil, pola yang sama dengan Phase 5. `FORCE INDEX (PRIMARY)` tidak bergantung pada indeks `idx_dash_*`, jadi tetap bekerja di DB yang belum memasangnya.
- **Pemindaian pelunasan: perbaikan urutan join hanya kecil.** Pekerjaan intinya (sekitar 1,9 juta pengambilan kartu dan 1,9 juta kelompok) tetap 67 sampai 96 detik. Karena hampir setiap baris detail membentuk kelompoknya sendiri, `GROUP BY invoice_id` di database nyaris tidak meringkas apa pun.
- **Belum diukur:** dua pemindaian sederhana (kartu pelunasan saja, lalu detail lewat indeks penutup saja) dengan penggabungan di Node; perkiraan kasar beberapa detik per pemindaian, tetapi itu belum terbukti.
- Taksiran dampak ke rebuild (3m 28s): pemindaian tagihan 90 detik menjadi sekitar 6 sampai 10 detik, sehingga rebuild sekitar 2 menit; bukan pengukuran ujung ke ujung.
- Batas: MariaDB 10.4 pada satu mesin, satu kali jalan per varian. Jumlah baris dari statistik `information_schema` (§14.1) lebih kecil daripada hitungan nyata (2.043.179 baris AP saja), jadi perkiraan ukuran tabel itu kasar.

### 14.3 Pemindaian pelunasan sebagai dua pemindaian sederhana (DB lokal `demo`, hanya membaca, satu kali jalan, 2026-11-05)

Varian S3: tanpa join dan tanpa `GROUP BY` di database. (1) Pindai `ap_ar_card` berurutan (`FORCE INDEX (PRIMARY)`) untuk kartu pelunasan AP; (2) pindai `ap_ar_card_detail` lewat indeks penutup `idx_dash_apard_inv_card_amt` (hanya `invoice_id`, `ap_ar_card_id`, `amount`); (3) di Node, jumlahkan per tagihan hanya baris yang kartunya termasuk langkah 1 (jumlah desimal eksak dengan `decimal.js`).

| Langkah                       | Waktu          | Isi               |
| ----------------------------- | -------------- | ----------------- |
| 1. Kartu pelunasan            | 3,9 detik      | 57.370 kartu      |
| 2. Baris detail ke Node       | 3,3 detik      | 1.912.599 baris   |
| 3. Jumlah per tagihan di Node | 3,1 detik      | 1.884.944 tagihan |
| **Total S3**                  | **11,2 detik** |                   |

Pembanding (§14.2): S0 (join di database sekarang) 95,6 detik, varian database terbaik S1 66,9 detik. **S3 sekitar 8,5 kali lebih cepat dari S0 dan 6 kali lebih cepat dari S1.** Hasil **identik**: jumlah kelompok 1.884.944, jumlah total -1.215.525.426.940,97, dan checksum id sama dengan S0.

- **Taksiran rebuild AP/AR paksa dengan kedua perubahan** (petunjuk indeks untuk pemindaian tagihan, S3 untuk pelunasan): dari 3m 28s menjadi sekitar 1 menit (pemindaian tagihan sekitar 6 sampai 12 detik, pelunasan sekitar 11 detik, ditambah detail 13 detik, tanpa alokasi 7 detik, penulisan 12 detik). **Taksiran, bukan pengukuran ujung ke ujung.**
- **Memori Node belum diukur.** Probe menyimpan 1,9 juta `Decimal` dan butuh heap besar (dijalankan dengan 6 GB). Untuk implementasi, hampir setiap tagihan hanya punya satu baris detail, jadi cukup menyimpan angkanya sebagai teks dan membuat `Decimal` hanya bila ada baris kedua untuk tagihan yang sama.
- Catatan kebenaran yang harus dijaga saat implementasi: `SUM` di SQL mengabaikan `amount` NULL, dan `GROUP BY` mengelompokkan `invoice_id` NULL jadi satu kelompok; versi Node harus berperilaku sama. Pemindaian detail memuat semua modul, jadi sisi AR bisa memakai satu pemindaian detail yang sama.
- Batas: MariaDB 10.4 pada satu mesin, satu kali jalan. Indeks `idx_dash_apard_inv_card_amt` berasal dari `docs/sql/dashboard-indexes.sql`; tanpa indeks itu langkah 2 tidak lagi pemindaian indeks saja dan waktunya akan berbeda.

## 15. Hasil Phase 6: rebuild AP/AR sesudah dua perubahan pemindaian, DB lokal `demo`, 2026-11-05

`npm run dash:refresh -- --force`, tanpa dev server dan tanpa beban halaman, satu kali jalan. Hasil: **45,2 detik** (sebelumnya 3m 28s, §14), dengan jumlah baris yang sama: 164.332 tagihan terbuka dan 186 pembayaran tanpa alokasi.

| Langkah                      | Sebelum (§14)                  | Sesudah                                                |
| ---------------------------- | ------------------------------ | ------------------------------------------------------ |
| AP: pelunasan                | 79 detik (join dan `GROUP BY`) | **7,0 detik** (kartu 3,9 + detail 3,1)                 |
| AP: semua tagihan            | 90 detik                       | **6,0 detik**                                          |
| AP: detail tagihan terbuka   | 13,3 detik                     | 5,0 detik                                              |
| AP: pembayaran tanpa alokasi | 7,1 detik                      | 6,5 detik                                              |
| AR: semua langkah            | 2,4 detik                      | 8,5 detik (kartu 2,6 + detail 2,7 + tagihan 3,0 + 0,3) |
| Tulis tabel tagihan terbuka  | 12,2 detik                     | 8,7 detik                                              |
| **Total**                    | **3m 28s (208 detik)**         | **45,2 detik** (sekitar 4,6 kali lebih cepat)          |

- **Paritas terbukti pada data demo.** Tes integrasi baru (`ap-ar-settlement-sums`) membandingkan jumlah pelunasan per tagihan antara query join lama (disalin sebagai acuan) dan `loadSettlementSums` untuk kedua sisi dan dua tanggal (hari ini dan 2025-06-01): keempat kasus lulus (jumlah kelompok sama, setiap jumlah sama secara numerik). Tes snapshot, riwayat, dan paritas agregat juga lulus sesudah rebuild (7 tes) dan **tidak dilewati**: tidak ada peringatan "skipped", durasi tes sesuai pekerjaan nyata.
- **Pemindaian detail tanpa petunjuk indeks cukup cepat:** 3,1 detik (AP) dan 2,7 detik (AR) dalam rebuild, setara dengan 3,3 detik yang terukur dengan `FORCE INDEX (idx_dash_apard_inv_card_amt)`. Keputusan Phase 6 untuk tidak menyebut indeks `idx_dash_*` terbukti tidak merugikan di DB ini.
- **Sisi AR sekarang lebih lambat (2,4 menjadi 8,5 detik)**: AR kecil, tetapi kini memindai seluruh tabel kartu dan seluruh tabel detail seperti AP. Untung bersih besar (AP turun sekitar 160 detik). Ide lanjutan: satu pemindaian detail dan satu pemindaian kartu untuk kedua sisi sekaligus.
- **Belum diukur:** pembangunan satu bulan riwayat dengan kode baru (memakai fungsi yang sama), siklus manual lengkap, dan data klien yang lebih besar. Tes riwayat yang lulus memeriksa isi riwayat yang dibangun sebelumnya, bukan bulan yang dibangun ulang dengan kode baru.
- Catatan yang belum dijelaskan: dalam tes agregat sesudah rebuild, query `SELECT DISTINCT coa_id ... FROM dash_snap_ap_ar_open ... location_id IN (...)` memakan 8,8 detik (log `slow query`), jauh lebih lama dari sebelumnya untuk filter entitas. Mungkin cache dingin sesudah tabel baru dibangun; belum diperiksa.
- Batas: MariaDB 10.4 pada satu mesin, satu kali jalan.

## 16. Siklus manual lengkap dan dua query hitung, DB lokal `demo`, 2026-11-09

Diukur dengan skrip sementara (di luar repo) yang menjalankan siklus yang sama dengan tombol "Perbarui sekarang" (`runRefreshCycle('manual', { force: true })`) tiga kali berturut-turut, lalu dua query hitung hanya-baca, dan `npm run dash:refresh-hist -- --max 1`. Database: MariaDB 10.4.32; `ap_ar_card` berisi 2.119.106 baris. Server dev tidak berjalan dan tidak ada beban halaman.

| Langkah                   | Percobaan 1 | Percobaan 2 | Percobaan 3 |
| ------------------------- | ----------- | ----------- | ----------- |
| Total siklus manual       | 47,4 detik  | 43,0 detik  | 48,6 detik  |
| `AP/AR snapshot`          | 46,0 detik  | 41,5 detik  | 47,4 detik  |
| `warm invoice lists`      | 649 ms      | 722 ms      | 544 ms      |
| `GL snapshot`             | 678 ms      | 702 ms      | 691 ms      |
| `balance snapshot`        | 9 ms        | 6 ms        | 6 ms        |
| `cash lines snapshot`     | 33 ms       | 5 ms        | 6 ms        |
| `AP/AR history`           | 5 ms        | 4 ms        | 3 ms        |
| Pemindaian detail AP + AR | 7,6 detik   | 5,4 detik   | 5,8 detik   |

- **Hampir seluruh waktu ada di langkah AP/AR** (96% dari total siklus pada ketiga percobaan). Rinciannya konsisten antar percobaan: pemindaian kartu AP 2,8 sampai 2,9 detik, detail AP 2,8 sampai 3,2 detik, pemindaian tagihan AP 5,3 sampai 5,9 detik, detail tagihan AP 4,6 sampai 4,8 detik, pembayaran AP tanpa alokasi 5,5 sampai 7,5 detik, seluruh sisi AR sekitar 9 sampai 11 detik, dan penulisan tabel tagihan terbuka 8,2 sampai 10,5 detik. Angkanya sejalan dengan §15 (45,2 detik).
- **Pemindaian tabel detail AP + AR** hanya 12 sampai 17% dari langkah AP/AR (7,6 dari 46,0 detik; 5,4 dari 41,5; 5,8 dari 47,4). Menggabungkan kedua pemindaian paling banyak menghemat sekitar 3 detik.
- **Langkah riwayat** hanya 3 sampai 5 milidetik di ketiga percobaan, dan `npm run dash:refresh-hist -- --max 1` menjawab `Nothing to do`: riwayat sudah mutakhir pada hari pengukuran. Biaya membangun satu bulan **belum diukur langsung**. Perkiraan dari angka di atas (pembacaan 33 sampai 38 detik, yaitu langkah AP/AR dikurangi penulisan, ditambah penulisan sekitar 8 sampai 10 detik): sekitar 45 detik.
- **D1, voucher aktif** (`Posted`, `Partialy Paid`, `Not Posted`, tipe 0): 39.138 baris, 1,4 detik.
- **D2, kartu dengan lokasi tidak valid** (anti-join `ap_ar_card` ke `pos_location`): hasil 0, 2,3 detik. Pada 2,1 juta kartu query ini ringan di database ini.
- **Keputusan:**
  - R1 (riwayat di refresh manual): tidak terpenuhi (3 sampai 5 ms; satu bulan sekitar 45 detik, di bawah 60 detik) → Tugas 8.2 dilewati; refresh manual tetap menjalankan langkah riwayat, yang saat ini nyaris tanpa biaya. Scheduler membangun satu bulan per siklus, jadi tombol manual jarang menemukan bulan yang belum dibangun.
  - R2 (gabung pemindaian detail): tidak terpenuhi (12 sampai 17%, ambang 25%) → tidak ada kode.
  - R3 (voucher aktif): tidak terpenuhi (39.138, ambang 100.000) → `listActivePlanStatuses` tidak diubah.
  - R4: hanya dicatat; cache pemeriksaan lokasi kartu (Tugas 8.1) sudah dikerjakan.
- Batas: satu mesin, MariaDB 10.4, tiga percobaan berturut-turut tanpa jeda, riwayat sudah mutakhir, dan belum ada data klien yang lebih besar.

## Riwayat Perubahan

| Tanggal    | Perubahan                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-04 | Dokumen dibuat bersama alat ukur: `PERF_LOG`, `SLOW_QUERY_MS`, probe Summary                                                                                                                                                                                                                                                    |
| 2026-11-04 | §7: hasil pengukuran pertama di DB lokal `demo` (probe Summary, tiga preset)                                                                                                                                                                                                                                                    |
| 2026-11-04 | Phase 1A: snapshot GL memakai sidik jari periode dan pembangunan ulang otomatis bila periode dibuka-tutup ulang                                                                                                                                                                                                                 |
| 2026-11-04 | Phase 1B: snapshot baris jurnal kas (dash_snap_cash_lines) untuk mempercepat runway dan Cash Flow                                                                                                                                                                                                                               |
| 2026-11-04 | Phase 2: cache SWR (`METRIC_FRESH_SECONDS`, `METRIC_STALE_SECONDS`), Summary bertahap, dan pelacakan via PERF_LOG                                                                                                                                                                                                               |
| 2026-11-04 | Default `METRIC_STALE_SECONDS` diturunkan dari 600 ke 180 detik: angka yang dijawab dari cache paling lama sekitar 4 menit lebih tua (60 detik segar + 180 detik masa basi), sehingga selisih kartu dan drill-down lebih kecil. Tidak ada rumus atau query yang berubah.                                                        |
| 2026-11-04 | §9: hasil probe sesudah Phase 1B dan Phase 2 (`last-month` dan `ytd`): `ytd` hangat 177 → 56 detik, `ytd` Cash Flow dingin 180 → 87 detik, `runway` 55 → 33–36 detik; `last-month` Cash Flow dingin tidak membaik (15,8 vs 9–11 detik); target milidetik belum tercapai.                                                        |
| 2026-11-04 | §9: volume snapshot kas diukur (5,09 juta baris, 146–178 ribu baris per bulan); dugaan "jutaan baris dipindahkan" dikoreksi: kecepatan baca hanya 20–40 ribu baris per detik, dugaan baru adalah join `DISTINCT` yang tidak perlu untuk filter semua entitas.                                                                   |
| 2026-11-04 | §9: hasil sesudah join `DISTINCT` dihapus untuk filter semua entitas: query baca snapshot kas 2–3 kali lebih cepat, Cash Flow `ytd` dingin 87 → 61 detik, `runway` 33–36 → 23 detik, total hangat `ytd` tetap 56 detik (sisa waktu ada di pengolahan Node).                                                                     |
| 2026-11-04 | §9: hasil sesudah jalur cepat uang dua desimal di pembacaan snapshot kas: `ytd` hangat 56 → 33 detik, Cash Flow `ytd` dingin 62 → 32 detik, `runway` 23 → 18 detik; dibanding baseline Phase 0 sekitar 3–6 kali lebih cepat.                                                                                                    |
| 2026-11-05 | Phase 3: pool koneksi terpisah untuk refresh snapshot (`DASH_POOL_SIZE`, default 2), tidak lagi menahan koneksi pool utama                                                                                                                                                                                                      |
| 2026-11-05 | §10: uji A/B pool refresh terpisah: median beban halaman saat refresh 27,6 detik (terpisah) vs 28,9 detik (bersama) vs 25,8 detik tanpa refresh; efek kecil (sekitar 4–5%), antrean koneksi hampir sama (45 vs 48).                                                                                                             |
| 2026-11-05 | Phase 4: aging AP/AR dan ringkasan Payment Plan diagregasi langsung di SQL (`dash_snap_ap_ar_*` dan `dash_snap_ap_ar_hist_*`); memori Node tidak lagi memuat 160k+ baris tagihan terbuka; tes paritas unit dan integrasi (D47).                                                                                                 |
| 2026-11-05 | §11: pengukuran Phase 4 (agregasi AP/AR di SQL): satu entitas jauh lebih cepat (aging AP 5,4 detik menjadi 31 ms), tetapi semua entitas lebih lambat daripada jalur lama yang hangat (15,7 detik lawan 0,7 detik); penyebab belum dibuktikan.                                                                                   |
| 2026-11-05 | §11.1: diagnosis Phase 4: penyebab lambatnya agregasi semua entitas adalah optimizer memilih indeks sekunder yang tidak mencakup kolom (pindai 4,2 detik lawan 0,35 detik dengan `IGNORE INDEX`); pembaca daftar tagihan jalur lama ikut terkena (4,8 detik lawan 0,75 detik). Belum ada kode yang diubah.                      |
| 2026-11-05 | §12: hasil Phase 5 (petunjuk indeks): `FORCE INDEX (PRIMARY)` sama cepatnya dengan `IGNORE INDEX`; aging AP semua entitas 15,7 menjadi 2,2 detik, pembaca daftar tagihan 4,3 menjadi 0,76 detik, Payment Plan hangat 6,0 menjadi 1,7 detik; agregat semua entitas masih lebih lambat daripada jalur lama hangat. Paritas lulus. |
| 2026-11-05 | §13: biaya `warmApArSnapshot`: sekitar 0,6 sampai 0,7 detik, jeda event loop maksimum 26 ms; memori sekitar 79 MB untuk 162.865 baris tagihan AP (sekitar 0,49 KB per baris), ekstrapolasi linear belum diukur.                                                                                                                 |
| 2026-11-05 | §1: log waktu per langkah siklus refresh dan rincian rebuild AP/AR (untuk mencari penyebab refresh manual yang lama). Hanya log, tidak ada angka atau perilaku yang berubah.                                                                                                                                                    |
| 2026-11-05 | §14: rincian rebuild AP/AR paksa tanpa beban: 3m 28s; dua pemindaian penuh `ap_ar_card` sekitar 81%, pencarian detail 6%, penulisan 6%.                                                                                                                                                                                         |
| 2026-11-05 | §14.1: EXPLAIN dua pemindaian rebuild AP/AR: pemindaian tagihan membaca sekitar 994 ribu baris lewat indeks yang tidak mencakup kolom (pola §11.1), pelunasan memakai tabel sementara dan filesort; ukuran `ap_ar_card` sekitar 1,99 juta baris. Varian belum diukur.                                                           |
| 2026-11-05 | §14.2: varian pemindaian rebuild AP/AR (hanya membaca, hasil identik): pemindaian tagihan 129 detik menjadi 5,3 detik dengan `FORCE INDEX (PRIMARY)`; pemindaian pelunasan hanya turun ke 67 detik dengan urutan join dari indeks penutup.                                                                                      |
| 2026-11-05 | §14.3: pemindaian pelunasan sebagai dua pemindaian sederhana digabung di Node: 11,2 detik lawan 95,6 detik (join di database), hasil identik; taksiran rebuild AP/AR sekitar 1 menit dengan dua perubahan (belum diukur ujung ke ujung).                                                                                        |
| 2026-11-05 | §15: hasil Phase 6: rebuild AP/AR paksa 45,2 detik (sebelumnya 3m 28s), jumlah baris sama; paritas terbukti (tes integrasi baru dan tes snapshot lulus, tidak dilewati); sisi AR melambat dari 2,4 ke 8,5 detik.                                                                                                                |
| 2026-11-09 | §16: siklus manual lengkap (43 sampai 49 detik, 96% di langkah AP/AR), langkah riwayat 3 sampai 5 milidetik, dan dua query hitung (voucher aktif 39.138 baris; kartu dengan lokasi tidak valid 0 baris, 2,3 detik); keputusan R1 sampai R4: tugas 8.2 dilewati, tidak ada perubahan kode.                                       |
