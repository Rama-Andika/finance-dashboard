# Laporan Verifikasi — Finance Dashboard

> Diperbarui: 29 Oktober 2026 (setelah review & perbaikan)
> Status: **BELUM SIAP PRODUKSI** — pemeriksaan otomatis lulus, tetapi angka **belum** dicocokkan dengan laporan ERP (V1–V7).

Versi sebelumnya dokumen ini menandai V1–V7 "Sama Persis" tanpa angka pembanding apa pun. Klaim itu **dicabut**: sampai tabel §2 diisi angka nyata dari ERP, kecocokan dengan ERP belum terbukti.

---

## 1. Pemeriksaan otomatis

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Tipe | `npm run typecheck` | Lulus |
| Unit test | `npm test` | Lulus (lihat `docs/progress.md` untuk jumlah terbaru) |
| Build | `npm run build` | Lulus |
| Server produksi | `npm start` (`scripts/start-server.mjs`) | Jalan: aset statis, redirect login, path traversal ditolak |
| Test integrasi DB lokal | `npm run test:db` | Lihat §3 — sekarang benar-benar menghitung data (bulan September 2025 di DB `demo`) |
| Kompatibilitas MySQL 5.7 | `tests/integration/mysql57-compat.int.test.ts` | **Belum dijalankan** (butuh DB MySQL 5.7.44, env `MYSQL57_URL`) |

## 2. Pencocokan dengan laporan ERP (WAJIB diisi user)

Buka laporan ERP **pada database dan tanggal yang sama** dengan dashboard. Untuk data historis, set `APP_TODAY` di `.env` (mis. `2025-10-15`) supaya preset dashboard menunjuk periode yang sama dengan laporan ERP.

| # | Laporan ERP | Pengaturan | Angka ERP | Angka dashboard | Selisih | Penjelasan | Status |
|---|---|---|---|---|---|---|---|
| V1 | AP Aging (`ap_aging.jsp`) | Semua lokasi, akhir bulan lalu | | Utang Usaha (neto) + 8 bucket | | | Belum dicek |
| V2 | AR Aging (`ar/ar_aging.jsp`) | Semua lokasi, tanggal sama | | Piutang (neto) + bucket | | | Belum dicek |
| V3 | Laba Rugi generate (`profitloss_segmentgen.jsp`) | Bulan lalu & YTD | | Revenue, COGS, Expense, Other Rev, Other Exp, Net | | | Belum dicek |
| V4 | Neraca (`neracabysegment.jsp`) | Akhir bulan lalu | | Saldo keranjang Kas, Bank, Deposito | | | Belum dicek |
| V5 | Neraca Saldo (`tb_report.jsp`) | Bulan lalu | | Saldo akun kas | | | Belum dicek |
| V6 | Arus Kas (`cashflow_report.jsp`) | Bulan lalu | | Total per laci | | Selisih boleh, harus terjelaskan (jurnal campuran, belum terklasifikasi) | Belum dicek |
| V7 | Anggaran (`budgetreport_month.jsp`) | Bulan lalu | | Budget per akun | | | Belum dicek |

Rujukan rumus: AP bagian A = item `module_type = 0`, `transaction_type IN (0,1,2,3,4,5,6,12)`; pelunasan `IN (7,8,9,10,11,13,14)`; bagian B = kartu pelunasan tanpa detail (data-model §6.6). AR bagian A = `module_type = 1`, `transaction_type IN (0,3,4,5)`; pelunasan `IN (1,2)` (§6.7).

## 3. Hasil test integrasi di DB lokal `demo`

Test dijalankan dengan "hari ini" = `2025-10-15` (data GL `demo` berakhir pertengahan Oktober 2025), preset bulan lalu = September 2025. Yang dicek: angka tidak nol, komponen menjumlah ke total, rumus Laba Bersih, saldo per entitas = total, saldo berjalan Rencana Bayar, drill-down menjumlah ke angka induknya. Hasil terbaru dan durasinya dicatat di `docs/progress.md`.

Hasil 29 Okt 2026: **16/16 test metrik lulus** (+ 8 test auth & Settings). Identitas Arus Kas cocok untuk September 2025, semua entitas. Durasi di DB `demo` lokal (tanpa index `idx_dash_*`): Laba Rugi ± 17 dtk, Posisi Kas ± 40 dtk, Arus Kas ± 41 dtk, **AP Aging ± 91 dtk** (satu entitas), Ringkasan + Runway ± 76 dtk. AP/AR Aging dan Ringkasan masih terlalu lambat untuk dipakai nyaman sebelum index dashboard dipasang.

## 4. Keterbatasan yang masih ada

- **Performa di DB besar.** Query GL sekarang memaksa urutan join dari `gl` (per periode) — di `demo` satu bulan Laba Rugi turun dari > 5 menit ke ± 8 detik. Untuk produksi tetap disarankan menjalankan `docs/sql/dashboard-indexes.sql` (O11) dan, bila mungkin, *read replica*.
- **Identitas Arus Kas** (`kas awal + arus kas = kas akhir`) bisa tidak cocok pada data nyata karena jurnal backdated / Periode 13 / filter entitas NBAL (K12). Dashboard menampilkannya sebagai Notice, tidak disembunyikan.
- **MySQL 5.7** belum diuji langsung (lihat §1).
- **Nama sub-baris aturan cadangan Arus Kas** mengikuti penamaan `cash_flow_setup` ERP (bahasa Indonesia) dan tampil apa adanya di kedua bahasa.

## 5. Checklist keamanan

- [x] Semua server function data memakai `authMiddleware`; session user yang dinonaktifkan di ERP ditolak dalam ≤ 1 menit.
- [x] Kolom `password` hanya dibaca di `auth.repo.ts`, dibandingkan dengan `timingSafeEqual`.
- [x] Satu-satunya tulis ke DB: `system_main` (`settings.repo.ts`). Test integrasi memakai baris `DASHBOARD_ACCOUNT_MAPPING_TEST`, tidak menyentuh baris asli.
- [x] Rate limit login memakai IP socket; header `X-Forwarded-For` hanya dipercaya bila `TRUST_PROXY=1`.
- [x] Bundle browser tidak memuat `mysql2`, `DATABASE_URL`, atau rahasia (dicek pada hasil build).
