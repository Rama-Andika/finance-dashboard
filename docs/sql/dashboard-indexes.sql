-- =====================================================================
-- Index tambahan untuk Finance Dashboard
-- Target   : MySQL 5.7.44 (berlaku untuk MySQL 5.6+, 8.0, dan MariaDB 10.x)
-- Dokumen  : docs/decisions.md (O11, D23), docs/data-model.md (§4.6, §6, §9.2)
-- =====================================================================
--
-- KENAPA PERLU?
--   Dashboard menjumlahkan jutaan baris (gl_detail ±13,6 juta, ap_ar_card ±1,9 juta).
--   Index membuat query dashboard membaca "daftar isi" yang sudah urut,
--   bukan membaca seluruh tabel. Index TIDAK mengubah data apa pun.
--
-- TENTANG "ALGORITHM=INPLACE, LOCK=NONE" (Online DDL, MySQL 5.6+)
--   Index dibangun TANPA mengunci tabel: ERP, kasir/POS, dan posting jurnal
--   tetap bisa membaca & menulis selama proses berjalan (hanya sedikit lebih
--   lambat). Ada kunci metadata sangat singkat di awal & akhir proses.
--   Jika MySQL menolak dengan pesan "LOCK=NONE is not supported", hentikan
--   dan hubungi tim DB — jangan hapus klausa itu tanpa maintenance window.
--
-- SEBELUM MENJALANKAN
--   1. Backup database.
--   2. Tetap disarankan di luar jam sibuk (pembuatan index memakai CPU & disk).
--   3. Jalankan LANGKAH 0 (cek versi, ukuran tabel, index yang sudah ada).
--   4. Pastikan ruang disk kosong ±3 GB (perkiraan tambahan total ±2–2,5 GB
--      + file sementara selama index dibangun).
--   5. Jalankan SATU BLOK PER TABEL, tunggu selesai, baru lanjut.
--   6. Kalau index dengan kolom yang sama sudah ada (lihat LANGKAH 0), hapus
--      baris ADD INDEX yang bersangkutan dari blok.
--
-- Semua index diberi awalan "idx_dash_" supaya mudah dikenali & dihapus.
-- =====================================================================


-- ---------------------------------------------------------------------
-- LANGKAH 0 — Cek kondisi server (hanya membaca)
-- ---------------------------------------------------------------------
SELECT VERSION();   -- versi SERVER (bisa berbeda dari versi program klien "mysql --version")

SELECT table_name, engine, table_rows,
       ROUND((data_length + index_length) / 1024 / 1024) AS ukuran_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('gl', 'gl_detail', 'coa_opening_balance_location',
                     'ap_ar_card', 'coa_budget');

SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS kolom
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN ('gl', 'gl_detail', 'coa_opening_balance_location',
                     'ap_ar_card', 'coa_budget')
GROUP BY table_name, index_name
ORDER BY table_name, index_name;


-- ---------------------------------------------------------------------
-- BLOK 1 — gl (±1,5 juta baris · tambahan ±100 MB)
--   idx_dash_gl_period_posted : angka bulanan → WHERE period_id IN (...) AND posted_status = 1
--   idx_dash_gl_date_posted   : angka harian  → WHERE trans_date BETWEEN ? AND ? AND posted_status = 1
-- ---------------------------------------------------------------------
ALTER TABLE gl
  ADD INDEX idx_dash_gl_period_posted (period_id, posted_status),
  ADD INDEX idx_dash_gl_date_posted (trans_date, posted_status),
  ALGORITHM=INPLACE, LOCK=NONE;


-- ---------------------------------------------------------------------
-- BLOK 2 — gl_detail (±13,6 juta baris · tambahan ±1,6–2,3 GB) ← PALING LAMA
--   idx_dash_gld_gl_cover : "covering index" — semua kolom untuk SUM ada di index,
--                           sehingga MySQL tidak perlu membuka baris tabel aslinya.
--                           → JOIN gl ON gl_id, SUM(debet/credit) GROUP BY coa_id, segment1_id
--   idx_dash_gld_coa_seg  : saldo akun tertentu per lokasi (Kas/Bank/Deposito, drill-down)
--                           → WHERE coa_id IN (...) AND segment1_id IN (...)
-- ---------------------------------------------------------------------
ALTER TABLE gl_detail
  ADD INDEX idx_dash_gld_gl_cover (gl_id, coa_id, segment1_id, debet, credit),
  ADD INDEX idx_dash_gld_coa_seg (coa_id, segment1_id, gl_id),
  ALGORITHM=INPLACE, LOCK=NONE;


-- ---------------------------------------------------------------------
-- BLOK 3 — coa_opening_balance_location (±250 ribu baris · tambahan ±15 MB)
--   saldo awal → WHERE periode_id = ? AND coa_id IN (...) AND segment1_id IN (...)
-- ---------------------------------------------------------------------
ALTER TABLE coa_opening_balance_location
  ADD INDEX idx_dash_cobl_per_coa_seg (periode_id, coa_id, segment1_id),
  ALGORITHM=INPLACE, LOCK=NONE;


-- ---------------------------------------------------------------------
-- BLOK 4 — ap_ar_card (±1,9 juta baris · tambahan ±150 MB)
--   idx_dash_apar_mod_loc_date : Outstanding, AR Aging, Expense Paid
--                                → WHERE module_type = ? AND location_id IN (...) AND transaction_date <= ?
--   idx_dash_apar_mod_loc_due  : Aging, Daily Payment Plan
--                                → WHERE module_type = ? AND location_id IN (...) AND due_date BETWEEN ? AND ?
-- ---------------------------------------------------------------------
ALTER TABLE ap_ar_card
  ADD INDEX idx_dash_apar_mod_loc_date (module_type, location_id, transaction_date),
  ADD INDEX idx_dash_apar_mod_loc_due (module_type, location_id, due_date),
  ALGORITHM=INPLACE, LOCK=NONE;


-- ---------------------------------------------------------------------
-- BLOK 4b — USULAN, JANGAN DIJALANKAN SEBELUM DIPERIKSA DBA
--   Di DB demo ada index `idx_dash_apar_mod_type_date` yang dipakai query aging/Expense Paid
--   (filter module_type + transaction_type IN (...) + transaction_date), tetapi definisinya tidak
--   tercatat di skrip ini. Kolom di bawah adalah perkiraan dari bentuk query; cocokkan dengan
--   SHOW CREATE TABLE ap_ar_card di DB demo, lalu uji dengan EXPLAIN sebelum dipasang di produksi.
-- ---------------------------------------------------------------------
-- ALTER TABLE ap_ar_card
--   ADD INDEX idx_dash_apar_mod_type_date (module_type, transaction_type, transaction_date),
--   ALGORITHM=INPLACE, LOCK=NONE;
--
-- Pemeriksaan lain yang perlu dilihat lewat EXPLAIN (mungkin sudah ada di ERP):
--   bankpo_payment_detail(invoice_id)  → daftar status voucher Payment Plan
--   bank_payment(type, status, coa_id, transaction_date) → In Transit / Data Check Q9


-- ---------------------------------------------------------------------
-- BLOK 5 — coa_budget (±465 ribu baris · tambahan ±20 MB)
--   Saat ini tabel ini TIDAK punya index selain primary key.
--   Budget vs Actual → WHERE bgt_year = ? AND bgt_month IN (...) AND coa_id IN (...) AND segment1_id IN (...)
-- ---------------------------------------------------------------------
ALTER TABLE coa_budget
  ADD INDEX idx_dash_budget_ym_coa_seg (bgt_year, bgt_month, coa_id, segment1_id),
  ALGORITHM=INPLACE, LOCK=NONE;


-- ---------------------------------------------------------------------
-- VERIFIKASI — pastikan index dipakai (lihat kolom "key" pada hasil EXPLAIN)
-- ---------------------------------------------------------------------
-- EXPLAIN
-- SELECT d.coa_id, d.segment1_id, SUM(d.debet) - SUM(d.credit)
-- FROM gl g
-- JOIN gl_detail d ON d.gl_id = g.gl_id
-- WHERE g.period_id = <isi periode_id> AND g.posted_status = 1
-- GROUP BY d.coa_id, d.segment1_id;


-- =====================================================================
-- ROLLBACK — hapus index dashboard bila diperlukan (data tidak berubah)
-- =====================================================================
-- ALTER TABLE gl                           DROP INDEX idx_dash_gl_period_posted, DROP INDEX idx_dash_gl_date_posted,     ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE gl_detail                    DROP INDEX idx_dash_gld_gl_cover,     DROP INDEX idx_dash_gld_coa_seg,       ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE coa_opening_balance_location DROP INDEX idx_dash_cobl_per_coa_seg,                                        ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE ap_ar_card                   DROP INDEX idx_dash_apar_mod_loc_date, DROP INDEX idx_dash_apar_mod_loc_due, ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE coa_budget                   DROP INDEX idx_dash_budget_ym_coa_seg,                                       ALGORITHM=INPLACE, LOCK=NONE;
