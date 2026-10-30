-- =====================================================================================================
-- Cek rekonsiliasi "Dana dalam pencairan": saldo buku besar akun transit  vs  register bank_payment
-- =====================================================================================================
-- BACA-SAJA. Hanya SELECT dan SET variabel sesi. Tidak mengubah data ERP.
-- CATATAN: bila tabel gl TIDAK punya kolom canceled_date (mis. ERP klien tertentu), hapus kondisi yang memuat
--          canceled_date di Q3, Q5, dan Q6 sebelum menjalankannya (dashboard sendiri mengabaikannya otomatis, D31).
-- Dijalankan MANUAL oleh user (di DB klien, sebaiknya di luar jam sibuk / di replica).
-- bank_payment ±3,2 juta baris, gl_detail ±13,6 juta baris: query sudah dibatasi tanggal, tapi tetap berat.
-- Kompatibel MySQL 5.7 (tanpa CTE / window function).
--
-- CARA PAKAI
--   1. Jalankan bagian 0 (variabel) lalu Q0 s.d. Q2.
--   2. Dari Q1, tentukan daftar coa_id akun transit (harus sama dengan keranjang "Dana dalam pencairan"
--      di Settings > Account Mapping). Ganti SEMUA tulisan  <TRANSIT_COA_IDS>  di bawah dengan daftar itu,
--      mis.  101,102,103   (angka coa_id, dipisah koma).
--   3. Jalankan Q3 s.d. Q9 satu per satu dan kirim hasilnya.
--
-- CATATAN
--   * Tabel GL: bila @as_of berada di tahun yang sudah diarsip, ganti  gl -> gl_20XX  dan  gl_detail -> gl_detail_20XX
--     (lihat kolom periode.table_name pada hasil Q2).
--   * Tanda saldo: akun transit diasumsikan sisi DEBIT (Liquid Assets): saldo = debet - kredit.
--     Bila Q1 menunjukkan akun transit bergrup sisi kredit, balik tandanya.
--   * Rentang tanggal memakai batas setengah-terbuka ( >= awal AND < hari berikutnya ), jadi benar
--     walau kolom tanggalnya bertipe DATETIME.
-- =====================================================================================================


-- ---------- 0. Variabel -----------------------------------------------------------------------------
SET @as_of      = '2025-10-15';                            -- GANTI: tanggal acuan (mis. akhir bulan terakhir, hari ini)
SET @as_of_next = DATE_ADD(@as_of, INTERVAL 1 DAY);
SET @from_check = DATE_SUB(@as_of, INTERVAL 60 DAY);       -- jendela untuk cek anomali (Q6..Q9)
-- SET SESSION max_execution_time = 300000;                -- opsional: batasi 5 menit per SELECT


-- ---------- Q0. Tipe kolom tanggal (menentukan apakah "<= tanggal" aman) ------------------------------
SELECT table_name, column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ( (table_name = 'gl'                  AND column_name = 'trans_date')
     OR (table_name = 'bank_payment'        AND column_name IN ('transaction_date', 'payment_date', 'due_date'))
     OR (table_name = 'bank_payment_history' AND column_name = 'date') );


-- ---------- Q1. Akun apa saja yang dipakai bank_payment (untuk memastikan daftar akun transit) --------
SELECT bp.coa_id, c.code, c.name, c.account_group, c.sub_account_group,
       bp.type, bp.status, COUNT(*) AS n, SUM(bp.amount) AS amount
FROM bank_payment bp
LEFT JOIN coa c ON c.coa_id = bp.coa_id
GROUP BY bp.coa_id, c.code, c.name, c.account_group, c.sub_account_group, bp.type, bp.status
ORDER BY c.code, bp.type, bp.status;


-- ---------- Q2. Periode saldo awal (C = Closed terakhir sebelum @as_of, P* = periode sesudahnya) -------
SELECT c.periode_id AS c_periode_id, c.name AS c_name, c.end_date AS c_end_date,
       (SELECT p.periode_id FROM periode p WHERE p.type = 0 AND p.start_date > c.end_date ORDER BY p.start_date LIMIT 1) AS p_star_id,
       (SELECT p.name       FROM periode p WHERE p.type = 0 AND p.start_date > c.end_date ORDER BY p.start_date LIMIT 1) AS p_star_name,
       (SELECT p.table_name FROM periode p WHERE p.type = 0 AND p.start_date > c.end_date ORDER BY p.start_date LIMIT 1) AS p_star_table
FROM periode c
WHERE c.type = 0 AND c.status = 'Closed' AND c.end_date < @as_of
ORDER BY c.end_date DESC
LIMIT 1;

-- Isi dua variabel berikut dari hasil Q2 (p_star_id dan c_end_date + 1 hari):
SET @p_star    = 0;                       -- GANTI: p_star_id
SET @from_date = '2025-09-01';            -- GANTI: c_end_date + 1 hari


-- ---------- Q3. Rekonsiliasi per akun x entitas  (INTI) ----------------------------------------------
-- gl_balance        : saldo buku besar akun transit pada @as_of (saldo awal P* + mutasi posted)
-- reg_correct       : register bank_payment yang BELUM cair pada @as_of
--                     (status 0, atau status 1 tetapi payment_date setelah @as_of)  <- rumus yang benar untuk tanggal lampau
-- reg_dashboard     : rumus dashboard saat ini (hanya status = 0)
-- diff_correct      : gl_balance - reg_correct        ; diff_dashboard : gl_balance - reg_dashboard
SELECT x.coa_id, c.code, c.name,
       x.segment1_id, pl.code AS location_code, pl.name AS location_name,
       SUM(x.gl_amt)                       AS gl_balance,
       SUM(x.reg_correct)                  AS reg_correct,
       SUM(x.reg_dashboard)                AS reg_dashboard,
       SUM(x.gl_amt) - SUM(x.reg_correct)  AS diff_correct,
       SUM(x.gl_amt) - SUM(x.reg_dashboard) AS diff_dashboard
FROM (
    -- saldo awal periode P*
    SELECT o.coa_id AS coa_id, o.segment1_id AS segment1_id,
           o.opening_balance AS gl_amt, 0 AS reg_correct, 0 AS reg_dashboard
    FROM coa_opening_balance_location o
    WHERE o.periode_id = @p_star
      AND o.coa_id IN (<TRANSIT_COA_IDS>)

    UNION ALL
    -- mutasi jurnal posted dari hari setelah akhir C sampai @as_of
    SELECT STRAIGHT_JOIN d.coa_id, d.segment1_id,
           d.debet - d.credit, 0, 0
    FROM gl g
    JOIN gl_detail d ON d.gl_id = g.gl_id
    WHERE g.posted_status = 1
      AND g.canceled_date IS NULL
      AND g.trans_date >= @from_date
      AND g.trans_date <  @as_of_next
      AND d.coa_id IN (<TRANSIT_COA_IDS>)

    UNION ALL
    -- register bank_payment yang belum cair
    SELECT bp.coa_id, bp.segment1_id,
           0,
           bp.amount,
           CASE WHEN bp.status = 0 THEN bp.amount ELSE 0 END
    FROM bank_payment bp
    WHERE bp.type IN (1, 2)
      AND bp.coa_id IN (<TRANSIT_COA_IDS>)
      AND bp.transaction_date < @as_of_next
      AND ( bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= @as_of_next) )
) x
LEFT JOIN coa c ON c.coa_id = x.coa_id
LEFT JOIN segment_detail sd ON sd.segment_detail_id = x.segment1_id
LEFT JOIN pos_location pl ON pl.location_id = sd.location_id
GROUP BY x.coa_id, c.code, c.name, x.segment1_id, pl.code, pl.name
ORDER BY ABS(SUM(x.gl_amt) - SUM(x.reg_correct)) DESC;

-- Q3b. Ringkasan per akun (tanpa entitas): bungkus Q3 dengan GROUP BY coa_id, atau jumlahkan kolomnya di spreadsheet.


-- ---------- Q4. Umur register belum cair (rumus benar) -----------------------------------------------
SELECT bp.coa_id, c.code, c.name,
       CASE WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 0 THEN '0 hari'
            WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 3 THEN '1-3 hari'
            WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 7 THEN '4-7 hari'
            WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 30 THEN '8-30 hari'
            ELSE '> 30 hari' END AS umur,
       COUNT(*) AS n, SUM(bp.amount) AS amount
FROM bank_payment bp
LEFT JOIN coa c ON c.coa_id = bp.coa_id
WHERE bp.type IN (1, 2)
  AND bp.coa_id IN (<TRANSIT_COA_IDS>)
  AND bp.transaction_date < @as_of_next
  AND ( bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= @as_of_next) )
GROUP BY bp.coa_id, c.code, c.name,
         CASE WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 0 THEN '0 hari'
              WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 3 THEN '1-3 hari'
              WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 7 THEN '4-7 hari'
              WHEN DATEDIFF(@as_of, DATE(bp.transaction_date)) <= 30 THEN '8-30 hari'
              ELSE '> 30 hari' END
ORDER BY c.code, MIN(bp.transaction_date);


-- ---------- Q5. Harian: transaksi register vs mutasi GL (mencari hari yang tidak cocok) ----------------
-- reg_created : register dibuat (transaction_date)      <-> gl_debit  : sisi debit akun transit (penjualan non-tunai diposting)
-- reg_settled : register cair (payment_date, status 1)  <-> gl_credit : sisi kredit akun transit (pencairan diposting)
SELECT y.day,
       SUM(y.reg_created) AS reg_created, SUM(y.gl_debit)  AS gl_debit,
       SUM(y.reg_created) - SUM(y.gl_debit)  AS gap_created,
       SUM(y.reg_settled) AS reg_settled, SUM(y.gl_credit) AS gl_credit,
       SUM(y.reg_settled) - SUM(y.gl_credit) AS gap_settled
FROM (
    SELECT DATE(bp.transaction_date) AS day, SUM(bp.amount) AS reg_created, 0 AS gl_debit, 0 AS reg_settled, 0 AS gl_credit
    FROM bank_payment bp
    WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>)
      AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next
    GROUP BY DATE(bp.transaction_date)

    UNION ALL
    SELECT DATE(bp.payment_date), 0, 0, SUM(bp.amount), 0
    FROM bank_payment bp
    WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
      AND bp.payment_date >= @from_check AND bp.payment_date < @as_of_next
    GROUP BY DATE(bp.payment_date)

    UNION ALL
    SELECT STRAIGHT_JOIN DATE(g.trans_date), 0, SUM(d.debet), 0, SUM(d.credit)
    FROM gl g
    JOIN gl_detail d ON d.gl_id = g.gl_id
    WHERE g.posted_status = 1 AND g.canceled_date IS NULL
      AND g.trans_date >= @from_check AND g.trans_date < @as_of_next
      AND d.coa_id IN (<TRANSIT_COA_IDS>)
    GROUP BY DATE(g.trans_date)
) y
GROUP BY y.day
ORDER BY y.day;


-- ---------- Q6. Anomali data register (ringkasan; semua dalam jendela @from_check .. @as_of) ------------
SELECT 'settled_without_history' AS check_name, COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
LEFT JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next
  AND h.bank_payment_id IS NULL

UNION ALL
SELECT 'unsettled_but_has_history', COUNT(*), COALESCE(SUM(bp.amount), 0)
FROM bank_payment bp
JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 0
  AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next

UNION ALL
SELECT 'history_journal_missing_or_not_posted', COUNT(*), COALESCE(SUM(bp.amount), 0)
FROM bank_payment bp
JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
LEFT JOIN gl g ON g.gl_id = h.gl_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next
  AND ( g.gl_id IS NULL OR g.posted_status <> 1 OR g.canceled_date IS NOT NULL )

UNION ALL
SELECT 'settled_without_payment_date', COUNT(*), COALESCE(SUM(bp.amount), 0)
FROM bank_payment bp
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND bp.payment_date IS NULL
  AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next

UNION ALL
SELECT 'unsettled_older_than_7_days', COUNT(*), COALESCE(SUM(bp.amount), 0)
FROM bank_payment bp
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 0
  AND bp.transaction_date < DATE_SUB(@as_of, INTERVAL 7 DAY);

-- Q6b. Contoh baris (ubah kondisi WHERE sesuai check yang n-nya > 0), maksimal 50 baris:
SELECT bp.bank_payment_id, bp.number, bp.type, bp.status, bp.coa_id, bp.segment1_id, bp.amount,
       bp.transaction_date, bp.payment_date, h.gl_id, h.date AS history_date
FROM bank_payment bp
LEFT JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND bp.transaction_date >= @from_check AND bp.transaction_date < @as_of_next
  AND h.bank_payment_id IS NULL                       -- <- contoh: 'settled_without_history'
ORDER BY bp.amount DESC
LIMIT 50;


-- ---------- Q7. bank_payment di luar type 1 dan 2 yang memakai akun transit (tidak dihitung dashboard) --
SELECT bp.type, bp.status, COUNT(*) AS n, SUM(bp.amount) AS amount,
       MIN(bp.transaction_date) AS first_date, MAX(bp.transaction_date) AS last_date
FROM bank_payment bp
WHERE bp.coa_id IN (<TRANSIT_COA_IDS>)
  AND bp.type NOT IN (1, 2)
GROUP BY bp.type, bp.status
ORDER BY bp.type, bp.status;


-- ---------- Q8. payment_date (tanggal cair) vs tanggal posting jurnal pencairan (history.date) ---------
SELECT DATEDIFF(DATE(h.date), DATE(bp.payment_date)) AS days_diff,
       COUNT(*) AS n,
       SUM(bp.amount) AS amount,
       SUM(CASE WHEN DATE_FORMAT(h.date, '%Y-%m') <> DATE_FORMAT(bp.payment_date, '%Y-%m') THEN 1 ELSE 0 END) AS cross_month_n
FROM bank_payment bp
JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND bp.payment_date >= @from_check AND bp.payment_date < @as_of_next
GROUP BY DATEDIFF(DATE(h.date), DATE(bp.payment_date))
ORDER BY days_diff;


-- ---------- Q9. Jurnal pencairan: nilai register vs nilai kredit di akun transit (bruto vs neto/MDR) ----
-- Satu jurnal pencairan bisa melunasi banyak baris register (batch). Selisih = biaya MDR/komisi atau salah posting.
-- Kolom seg_register vs seg_gl menunjukkan apakah entitasnya sama.
SELECT h.gl_id, g.journal_number, DATE(g.trans_date) AS journal_date, bp.coa_id,
       COUNT(*)       AS n_payments,
       SUM(bp.amount) AS register_amount,
       (SELECT SUM(d.credit - d.debet) FROM gl_detail d
         WHERE d.gl_id = h.gl_id AND d.coa_id = bp.coa_id) AS gl_credit_net,
       SUM(bp.amount) - (SELECT SUM(d.credit - d.debet) FROM gl_detail d
         WHERE d.gl_id = h.gl_id AND d.coa_id = bp.coa_id) AS diff,
       GROUP_CONCAT(DISTINCT bp.segment1_id ORDER BY bp.segment1_id) AS seg_register,
       (SELECT GROUP_CONCAT(DISTINCT d.segment1_id ORDER BY d.segment1_id) FROM gl_detail d
         WHERE d.gl_id = h.gl_id AND d.coa_id = bp.coa_id) AS seg_gl
FROM bank_payment bp
JOIN bank_payment_history h ON h.bank_payment_id = bp.bank_payment_id
JOIN gl g ON g.gl_id = h.gl_id
WHERE bp.type IN (1, 2) AND bp.coa_id IN (<TRANSIT_COA_IDS>) AND bp.status = 1
  AND g.trans_date >= @from_check AND g.trans_date < @as_of_next
GROUP BY h.gl_id, g.journal_number, DATE(g.trans_date), bp.coa_id
HAVING ABS(diff) >= 1
ORDER BY ABS(diff) DESC
LIMIT 100;
