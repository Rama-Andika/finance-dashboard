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

## Riwayat Perubahan

| Tanggal    | Perubahan                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-11-04 | Dokumen dibuat bersama alat ukur: `PERF_LOG`, `SLOW_QUERY_MS`, probe Summary                                    |
| 2026-11-04 | §7: hasil pengukuran pertama di DB lokal `demo` (probe Summary, tiga preset)                                    |
| 2026-11-04 | Phase 1A: snapshot GL memakai sidik jari periode dan pembangunan ulang otomatis bila periode dibuka-tutup ulang |
