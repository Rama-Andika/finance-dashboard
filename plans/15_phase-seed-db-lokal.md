# Fase 15 – Seed DB lokal (opsional)

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [14_phase-cache-periode-closed.md](./14_phase-cache-periode-closed.md) · Berikutnya: [16_phase-verifikasi-akhir.md](./16_phase-verifikasi-akhir.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (14_phase-cache-periode-closed.md) sudah lulus "✅ Cek selesai". Fase ini **opsional**; bila user tidak memintanya, lanjut ke `16_phase-verifikasi-akhir.md`.

---

> Fase ini **opsional**: user sudah punya DB lokal `demo` berisi data nyata versi dev. Kerjakan hanya bila user memintanya (lihat README §9, K19). Seluruh fase ⛔ IZIN USER.

## Langkah 15.1 — Pengaman host

📁 File: ➕ `scripts/seed/guard.ts`

- Baca `TEST_DATABASE_URL`. Bila host bukan `localhost`, `127.0.0.1`, atau `::1` → cetak `"Seed may only run against a local database"` ke `console.error` lalu `process.exit(1)`.
- Bila nama database **bukan** `finance_dashboard_dev` → berhenti (mencegah menimpa DB `demo`).
- Test `scripts/seed/guard.test.ts` (tambahkan pola `scripts/**/*.test.ts` ke project `unit` di `vitest.config.ts`): host `10.0.0.5` ditolak; `127.0.0.1/demo` ditolak; `127.0.0.1/finance_dashboard_dev` diterima.

## Langkah 15.2 — DDL ramping

📁 File: ➕ `scripts/seed/ddl.sql`

- `DROP TABLE IF EXISTS` lalu `CREATE TABLE` untuk tabel di `drizzle.config.ts` (langkah 5.4), **hanya** kolom yang tercantum di `data-model.md` §2.2, nama & tipe sama dengan ERP (`BIGINT` untuk ID, `DECIMAL(22,2)` untuk nominal, `DATETIME` untuk `ap_ar_card.transaction_date`).
- Tabel saldo awal yang dibuat: `coa_opening_balance_location` (D19), bukan `coa_opening_balance` (README §9, K3).
- `system_main.name` diberi `UNIQUE`.
- Index lokal (§7.1): `gl(trans_date)`, `gl(period_id, posted_status)`, `gl_detail(gl_id)`, `gl_detail(coa_id, segment1_id)`, `ap_ar_card(module_type, due_date)`, `ap_ar_card(module_type, location_id, transaction_date)`, `ap_ar_card_detail(invoice_id)`, `ap_ar_card_detail(ap_ar_card_id)`, `coa(acc_ref_id)`.

## Langkah 15.3 — Master data & transaksi

📁 File: ➕ `scripts/seed/master-data.ts`, ➕ `scripts/seed/transactions.ts`, ➕ `scripts/seed/index.ts`, ➕ `scripts/seed/README.md`

- `faker.seed(20261028)` → hasil selalu sama.
- Master data persis tabel §7.2 (24 entitas generik "PT Contoh Ritel 01" …, CoA meniru **struktur** klien termasuk keanehannya, `cash_flow_setup` dengan 1–2 akun sengaja tidak dipetakan, periode bulanan 24 bulan dengan bulan lampau `Closed` dan bulan berjalan `Open`, `coa_budget` = actual × 0,9–1,1 dengan `bgt_month` 0-based).
- Transaksi persis tabel §7.3, termasuk pola musiman, 1–2 entitas merugi, 1 entitas kas tipis, dan edge case (reverse, batal, draft).
- Tanpa transaksi antar entitas (D2). Tanpa data sensitif (G29). Akun demo `sysuser` dari `SEED_DEMO_LOGIN_ID`/`SEED_DEMO_PASSWORD` (`user_status = 1`) dan satu akun nonaktif (`user_status = 4`).
- Validasi sebelum insert: setiap `gl_id` Σ debet = Σ credit; gagal → berhenti.
- Insert per batch 1.000 baris dalam transaksi.
- Selama membuat data, script menyimpan total **sendiri** (tanpa SQL) lalu menulis `tests/integration/expected.json`: Revenue per bulan, Cash Position per akhir bulan, Outstanding AP per akhir bulan, Laba Bersih per bulan.
- `README.md` menjelaskan cara menjalankan (`npm run seed`) dan bahwa kredensial demo ada di `.env`.

✅ Cek selesai:
- `npm run seed` dua kali menghasilkan `expected.json` yang identik.
- `npm run test:db` (dengan `DATABASE_URL` = `TEST_DATABASE_URL`) lulus dan cocok dengan `expected.json` (T2).
