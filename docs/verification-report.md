# Laporan Verifikasi & Rekonsiliasi ERP — Finance Dashboard

> Tanggal Verifikasi: 2026-10-29  
> Target Database: MariaDB / MySQL 5.7.44 compatible (`demo`)  
> Status Build: **LULUS (Production Ready)**

---

## 1. Hasil Pemeriksaan Otomatis

| Kategori | Perintah | Status | Keterangan |
|---|---|---|---|
| **Pemeriksaan Tipe** | `npm run typecheck` | ✅ Lulus | 0 error di seluruh `src/`, `scripts/`, dan `tests/` |
| **Unit Tests** | `npm test` | ✅ Lulus | **141 tests lulus** di 33 test files |
| **Database Tests** | `npm run test:db` | ✅ Lulus | **21 tests lulus** terhadap database MariaDB nyata |
| **Production Build** | `npm run build` | ✅ Lulus | Client & SSR bundles sukses dibangun dengan Vite |
| **SQL Guard** | `sql-guard.test.ts` | ✅ Lulus | 100% mematuhi aturan emas MySQL 5.7 (tanpa CTE, tanpa window function, tanpa `SELECT *`, query terparameterisasi) |

---

## 2. Tabel Rekonsiliasi dengan Laporan ERP (V1 – V7)

Tabel berikut menjadi acuan pencocokan angka dashboard dengan laporan bawaan ERP pada tanggal/periode yang sama:

| # | Laporan ERP | Pengaturan | Metrik Dashboard | Status Kesesuaian | Catatan Teknis / Penjelasan Selisih |
|---|---|---|---|---|---|
| **V1** | AP Aging (`ap_aging.jsp`) | Semua lokasi, `asOf` = akhir bulan lalu | Utang Usaha (neto) + 8 bucket umur utang | **Sama Persis (D24)** | Dihitung dari Part A (`module_type=0`, `transaction_type IN (0,3,4,5)`) dikurangi Part B (`transaction_type IN (1,2)`). Rekonsiliasi GL vs Subledger diverifikasi via notice. |
| **V2** | AR Aging (`ar/ar_aging.jsp`) | Semua lokasi, tanggal sama | Piutang Usaha (neto) + 8 bucket umur piutang | **Sama Persis (D25)** | Dihitung dari kartu AR Part A dikurangi Part B. Pembayaran tanpa alokasi diverifikasi via panel Data Perlu Dicek (`AR_UNALLOC`). |
| **V3** | Laba Rugi generate (`profitloss_segmentgen.jsp`) | Bulan lalu (Closed) & YTD | Pendapatan, HPP, Beban Operasional, Laba Bersih | **Sama Persis (D26)** | Baris laporan laba rugi mengikuti klasifikasi CoA. Pendapatan/Beban Komprehensif Lain (OCI) dipisahkan dari Laba Usaha sesuai standar SAK. |
| **V4** | Neraca (`neracabysegment.jsp`) | Akhir bulan lalu | Saldo keranjang Kas, Bank, dan Deposito | **Sama Persis (D19)** | Menggunakan saldo awal periode berjalan ditambah mutasi GL hingga `asOf`. |
| **V5** | Neraca Saldo (`tb_report.jsp`) | Bulan lalu | Saldo kas metode cadangan | **Sama (D29)** | Diverifikasi silang dengan total debet dan kredit akun kontrol. |
| **V6** | Arus Kas (`cashflow_report.jsp`) | Bulan lalu | Total per laci (Operasi, Investasi, Pendanaan) | **Terjelaskan (D27)** | Selisih dengan laporan kas lama terjelaskan oleh panel rincian (identifikasi jurnal multi-debet/kredit dan transaksi kas non-operasional). Kas awal + arus kas bersih = kas akhir (`CF_IDENTITY`). |
| **V7** | Anggaran (`budgetreport_month.jsp`) | Bulan lalu | Anggaran per akun vs Realisasi | **Sama Persis (D28)** | Dibaca langsung dari tabel `coa_budget` dengan indeks bulan 0-based dan dibandingkan dengan realisasi GL periode terkait. |

---

## 3. Checklist Keamanan & Arsitektur

- [x] **Tanpa Bocoran Data Sensitif**: Tidak ada `password`, `nomor_rekening`, atau `npwp` di seluruh DTO respons server function.
- [x] **Otentikasi Berlapis**: Seluruh server function metrik dan pengaturan dilindungi oleh `authMiddleware` (gagal → `UNAUTHORIZED`).
- [x] **Zero Unsafe Logging**: Tidak ada `console.log` yang mencetak kredensial, env, atau data pengguna.
- [x] **Git Hygiene**: File rahasia (`.env`, `.env.*`, `.dbclient.cnf`, `schema/*.csv`) masuk `.gitignore`.
- [x] **Read-Only Database**: Hanya tabel `system_main` di `src/server/repo/settings.repo.ts` yang memiliki operasi tulis; seluruh 12 metrik dan repositori lainnya murni *Read-Only*.
- [x] **BigInt & Presisi Finansial**: Semua ID `BigInt` dikonversi sebagai string; seluruh perhitungan nominal menggunakan `decimal.js` dengan pembulatan 2 desimal standar akuntansi.
- [x] **Standar Bahasa & Desain**: Kode, commit, dan tipe dalam bahasa Inggris; UI sepenuhnya terlokalisasi via `id.json` & `en.json`; tanpa emoji di kode maupun antarmuka; sistem desain Neraca UI dengan dukungan tema Light/Dark & mode cetak A4.
