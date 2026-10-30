# Halaman Summary — Katalog Query SQL

> **Untuk developer.** Daftar semua query yang berjalan saat halaman Summary dimuat, ditulis ulang dari kode sumber dalam bentuk SQL dengan parameter `?` / `:nama`. Penjelasan untuk tim finance ada di [`summary-page.md`](./summary-page.md).
>
> **Cara baca:**
> - Setiap query punya ID (`Q1`, `Q2`, …) dan petunjuk file sumbernya. Query ditranskripsi dari kode; bila kode berubah, kodenya yang benar.
> - `<SEG>` = kolom segmen entitas, dicari dari `segment` yang `count = 1` (klien ini `segment1_id`) dan divalidasi `assertSegmentColumn`.
> - `<GL>` / `<GL_DETAIL>` = `gl` / `gl_detail` atau tabel arsip `gl_20XX` / `gl_detail_20XX`, ditentukan `periode.table_name` (`src/server/db/gl-tables.ts`, pola `^gl(_20\d{2})?$`).
> - Daftar `IN (...)` dipecah per **1.000** id (`IN_LIST_LIMIT`); satu query logis bisa menjadi beberapa eksekusi. Bila ada dua atau tiga daftar (periode × akun × entitas), tiap kombinasi potongan menjadi satu eksekusi (`sliceCombos` di `src/server/db/chunk.ts`).
> - Semua SQL harus kompatibel **MySQL 5.7** (tanpa CTE / window function). Dijaga oleh `src/server/repo/sql-guard.test.ts`.
> - Kondisi `canceled_date IS NULL` pada `gl` **hanya ditambahkan bila tabel itu punya kolomnya** (`notCanceledClause`, lihat Q24). Pada ERP tanpa kolom itu, kondisinya tidak muncul di SQL.
> - Drizzle membuat nilai parameter jadi `?`. Alias kolom camelCase memakai `AS`.
>
> **Belum dijalankan.** Dokumen ini tidak dibuat dengan mengeksekusi query ke database.
>
> **Terakhir diperbarui:** 2026-10-30

## Daftar isi

1. [Query referensi (dipakai semua kartu)](#1-query-referensi)
2. [Saldo akun per tanggal](#2-saldo-akun-per-tanggal)
3. [Mutasi per periode (Revenue, P&L, Composition)](#3-mutasi-per-periode)
4. [AP (Payables dan tabel tagihan)](#4-ap-payables-dan-tabel-tagihan)
5. [Cash Flow dan Runway](#5-cash-flow-dan-runway)
6. [Status Pengakuan Biaya](#6-status-pengakuan-biaya)
7. [Query pembangun snapshot `dash_*`](#7-query-pembangun-snapshot-dash_)
8. [Matriks: kartu → query](#8-matriks-kartu--query)
9. [Cache dan jumlah eksekusi](#9-cache-dan-jumlah-eksekusi)
10. [Query tambahan (Q22–Q24)](#10-query-tambahan-q22q24)
11. [Riwayat Perubahan](#riwayat-perubahan)

---

## 1. Query referensi

Dibaca setiap request, tetapi di-cache di memori (`src/server/context.ts`, TTL 10 menit; pengaturan keranjang 2 menit).

### Q1 — Daftar akun (CoA)
`src/server/repo/coa.repo.ts` · `listCoa`

```sql
SELECT coa_id AS coaId, acc_ref_id AS parentId, code, name, status, level,
       account_group AS accountGroup, sub_account_group AS subAccountGroup, saldo_normal AS saldoNormal
FROM coa
ORDER BY code, coa_id;
```

### Q2 — Daftar periode
`src/server/repo/periods.repo.ts` · `listPeriods`

```sql
SELECT periode_id AS periodeId, name AS name, start_date AS startDate, end_date AS endDate,
       status AS status, type AS type, table_name AS tableName
FROM periode
ORDER BY start_date, type;
```

`type`: 0 = reguler, 1 = periode 13. `status`: `Open` / `Pre Closed` / `Closed`.

### Q3 — Kolom segmen entitas
`src/server/repo/entities.repo.ts` · `getEntitySegment`

```sql
SELECT segment_id AS segmentId, column_name AS columnName
FROM segment
WHERE `count` = 1;
```

Harus tepat 1 baris, kalau tidak aplikasi melempar error.

### Q4 — Daftar entitas
`src/server/repo/entities.repo.ts` · `listEntities`

```sql
SELECT pl.location_id AS locationId, pl.code AS code, pl.name AS name, pl.is_active AS isActive,
       sd.segment_detail_id AS segmentDetailId
FROM pos_location pl
LEFT JOIN segment_detail sd ON sd.location_id = pl.location_id AND sd.segment_id = :segmentId
ORDER BY pl.name, pl.location_id;
```

Satu lokasi bisa punya lebih dari satu `segment_detail_id`; keduanya digabung menjadi satu entitas di kode.

### Q5 — Pengaturan keranjang akun
`src/server/repo/settings.repo.ts` · `getMappingRow`

```sql
SELECT sysmain_id AS sysmainId, valueprop AS valueprop
FROM system_main
WHERE name = 'DASHBOARD_ACCOUNT_MAPPING'
LIMIT 1;
```

`valueprop` berisi JSON keranjang (`cash`, `bank`, `deposit`, `inTransit`, `fixedCost`). Folder (HEADER) di-resolve menjadi akun POSTABLE turunannya di JavaScript, bukan di SQL.

### Q6 — Daftar entitas dari filter
Tidak ada query: token `entity` di URL (id lokasi) dicocokkan ke hasil Q4, lalu diubah menjadi daftar `segment_detail_id` (`:segIds`) yang dipakai semua query di bawah. Bila memilih semua entitas, `:segIds = 'all'` dan klausa `AND <SEG> IN (...)` dihilangkan.

---

## 2. Saldo akun per tanggal

Dipakai **Cash Position**, Cash Flow (kas awal dan akhir), Runway (Current Ratio), dan rekonsiliasi AP. Logika: `src/server/services/balance.service.ts` + `src/lib/finance/period/balance.ts`.

### Menentukan periode saldo awal (di JavaScript, tanpa SQL)

Dari hasil Q2, hanya periode `type = 0`:
- **C** = periode `Closed` terakhir dengan `end_date < :asOf`.
- **P\*** = periode tepat setelah C. Bila tidak ada C, P\* = periode reguler paling awal.
- `:fromDate` = `C.end_date + 1 hari` (atau `P*.start_date` bila tidak ada C).

Lalu: bila Q7 mengembalikan > 0 baris untuk P\*, pakai **jalur tabel saldo awal** (Q8 + Q9). Bila 0, pakai **jalur cadangan** (Q9 saja, rentang `1900-01-01` s.d. `:asOf`).

### Q7 — Hitung baris saldo awal
`gl.repo.ts` · `countOpeningRows`

```sql
SELECT COUNT(*) AS n
FROM coa_opening_balance_location
WHERE periode_id = :periodeId;
```

### Q8 — Saldo awal per akun
`gl.repo.ts` · `openingBalances`. Hanya dipakai bila `<SEG> = segment1_id`, selain itu melempar error.

```sql
SELECT o.coa_id AS coaId
       -- , o.segment1_id AS segmentDetailId        ← hanya bila per-entitas (kartu "by entity")
       , SUM(o.opening_balance) AS opening
FROM coa_opening_balance_location o
WHERE o.periode_id = :periodeId
  AND o.coa_id IN (:coaIds)
  -- AND o.segment1_id IN (:segIds)                ← bila entitas dipilih
GROUP BY o.coa_id
         -- , o.segment1_id
;
```

### Q9 — Mutasi per akun menurut tanggal
`gl.repo.ts` · `movementsByDate`. Dijalankan **per tabel GL** yang menutup rentang `:fromDate … :asOf` (`tablesBetween`).

```sql
SELECT /* STRAIGHT_JOIN hanya bila rentang ≤ 400 hari */ STRAIGHT_JOIN d.coa_id AS coaId
       -- , DATE(g.trans_date) AS transDate         ← bila byDate
       -- , d.<SEG> AS segmentDetailId              ← bila bySegment
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.trans_date >= :fromDate
  AND g.trans_date <= :asOf
  AND d.coa_id IN (:coaIds)
  -- AND d.<SEG> IN (:segIds)
GROUP BY d.coa_id
         -- , DATE(g.trans_date)
         -- , d.<SEG>
;
```

### Perhitungan akhir (JavaScript)

```
saldo(akun) = Σ opening (Q8)
            + signed(akun.account_group, Σ debet (Q9), Σ credit (Q9))
signed: grup sisi debit  → debet − credit
        grup sisi kredit → credit − debet
```

Grup sisi debit: Liquid Assets, Fixed Assets, Other Assets, Cost Of Sales, Expense, Other Expense (`src/lib/finance/coa/sign.ts`).

### Q10 — Dana belum cair (register `bank_payment`)
`src/server/repo/bank-payment.repo.ts` · `unsettledByChannel`. Dijalankan di Summary walau hasilnya tidak ditampilkan di kartu (dipakai rekonsiliasi di halaman Cash Position).

```sql
SELECT bp.coa_id AS coaId,
       bp.<SEG> AS segmentDetailId,
       DATE(bp.transaction_date) AS txDate,
       COUNT(*) AS n,
       COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2)                       -- BANK_PAYMENT_CHANNEL_TYPES
  AND ( bp.status = 0                         -- belum cair sekarang
        OR (bp.status = 1 AND bp.payment_date >= :asOfPlusOne) )   -- atau baru cair setelah asOf
  AND bp.coa_id IN (:inTransitCoaIds)
  AND bp.transaction_date < :asOfPlusOne
  -- AND bp.<SEG> IN (:segIds)
GROUP BY bp.coa_id, bp.<SEG>, DATE(bp.transaction_date);
```

Cache 60 detik.

### Rumus Cash Position di JavaScript

```
Kas      = Σ saldo(akun ∈ keranjang.cash)
Bank     = Σ saldo(akun ∈ keranjang.bank)
Deposito = Σ saldo(akun ∈ keranjang.deposit)
Transit  = Σ saldo(akun ∈ keranjang.inTransit)
CashPosition = Kas + Bank
```

Sumber: `src/server/services/cash-position.service.ts`, `src/lib/finance/cash/cash-position.ts`.

Query ekstra bila ada pembanding: seluruh Q7–Q9 diulang dengan `:asOf = compare.asOf`, `:coaIds = cash ∪ bank` (hasilnya tidak ditampilkan di Summary).

---

## 3. Mutasi per periode

Dipakai **Revenue**, **Net Profit**, **Composition**, **Gross/Net margin**. Satu pembacaan dibagi bersama (`loadPlMovements`, `src/server/services/shared/pl-movements.ts`): akun yang diminta = semua POSTABLE grup Revenue / Cost Of Sales / Expense / Other Revenue / Other Expense + akun keranjang Biaya Tetap. Halaman lain menyaring baris di memori.

Mesin: `src/server/repo/gl.repo.ts` · `movementsByPeriods`. Periode dikelompokkan per tabel GL; periode `Closed` dilayani dari cache memori / snapshot, periode `Open` / `Pre Closed` **selalu** ke ERP.

### Q11 — Mutasi per periode (ERP langsung)

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       -- , g.period_id AS periodId                 ← byPeriod (selalu untuk periode Closed)
       -- , sd.location_id AS locationId            ← byLocation (kartu Revenue)
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
-- JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (:accountGroups)   ← bila accountGroups
-- LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.<SEG>               ← bila byLocation
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.period_id IN (:periodIds)
  AND d.coa_id IN (:coaIds)
  -- AND d.<SEG> IN (:segIds)
GROUP BY d.coa_id
         -- , g.period_id
         -- , sd.location_id
;
```

`STRAIGHT_JOIN` wajib: tanpa itu optimizer mulai dari `coa` dan memindai seluruh riwayat `gl_detail` (menit pada 13 juta baris).

### Q12 — Mutasi periode Closed dari snapshot
`src/server/dash/gl-snapshot.ts` · `snapshotMovements`. Dipakai bila periodenya sudah ada di `dash_snap_gl_periods` dan `<SEG> = segment1_id`.

```sql
SELECT s.coa_id AS coaId, s.period_id AS periodId
       -- , sd.location_id AS locationId
       , SUM(s.debet) AS debet, SUM(s.credit) AS credit
FROM dash_snap_gl_monthly s
-- JOIN coa c ON c.coa_id = s.coa_id AND c.account_group IN (:accountGroups)
-- LEFT JOIN segment_detail sd ON sd.segment_detail_id = s.segment_id
WHERE s.period_id IN (:periodIds)
  AND s.coa_id IN (:coaIds)
  -- AND s.segment_id IN (:segIds)
GROUP BY s.coa_id, s.period_id
         -- , sd.location_id
;
```

### Q13 — Daftar periode yang sudah ada di snapshot GL

```sql
SELECT CAST(period_id AS CHAR) AS id FROM dash_snap_gl_periods;
```

Cache 30 detik. Bila tabel `dash_*` belum ada, error ditelan dan semua periode dibaca dari ERP (Q11).

### Rumus di JavaScript

| Kartu | Rumus | File |
|---|---|---|
| Revenue | Σ (credit − debet) akun grup Revenue | `src/lib/finance/pnl/revenue.ts` |
| Laba Kotor | Revenue − Σ (debet − credit) Cost Of Sales | `src/lib/finance/pnl/pnl.ts` |
| Laba Usaha | Laba Kotor − Σ (debet − credit) Expense | idem |
| **Net Profit** | Laba Usaha + Other Revenue − Other Expense | idem |
| Margin | Laba ÷ Revenue; Revenue = 0 → `null` | idem |
| Biaya Tetap | Σ (debet − credit) akun keranjang `fixedCost` | `src/lib/finance/pnl/fixed-cost.ts` |

OCI tidak dipisahkan (D39): setiap akun dihitung menurut grup akunnya.

Pembanding Revenue dan Net Profit: Q11/Q12 yang sama dengan `:periodIds = compare.periodIds`.

---

## 4. AP (Payables dan tabel tagihan)

Logika: `src/server/services/ap-aging.service.ts`, `src/lib/finance/ap-ar/apar.ts`. Pembacaan data: `src/server/repo/aging.repo.ts`.

Urutan sumber data (`agingInvoices` / `agingUnallocated`):
1. `asOf` ≥ tanggal snapshot hari ini → **snapshot** (Q14, Q15).
2. `asOf` = akhir bulan yang sudah dibangun → **snapshot riwayat** (`dash_snap_ap_ar_hist_*`, struktur sama dengan Q14/Q15 plus kolom tanggal).
3. Selain itu → **query langsung ke ERP** (Q16, Q17), lambat pada ERP besar.

### Q14 — Tagihan terbuka (snapshot)
`src/server/dash/snapshot.ts` · `readOpenInvoices`. Seluruh sisi AP dibaca sekali per generasi snapshot, lalu disaring entitas di memori.

```sql
SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
       tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
       invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
FROM dash_snap_ap_ar_open
WHERE module_type = 0;          -- 0 = AP, 1 = AR
```

### Q15 — Pembayaran belum dialokasikan (snapshot)

```sql
SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
       tx_date AS txDate, balance AS balance
FROM dash_snap_ap_ar_unallocated
WHERE module_type = 0;
```

### Q16 — Tagihan terbuka (ERP langsung)
`aging.repo.ts` · `liveAgingInvoices`. Nilai `:cfg.*` untuk AP: `module = 0`, `invoiceTypes = (0,1,2,3,4,5,6,12)`, `settlementTypes = (7,8,9,10,11,13,14)`.

```sql
SELECT i.ap_ar_card_id AS invoiceId,
       COALESCE(NULLIF(i.invoice_number, ''), i.transaction_number, '') AS invoiceNumber,
       i.owner_id AS partyId,
       i.location_id AS locationId,
       i.coa_id AS coaId,
       DATE(i.transaction_date) AS txDate,
       i.due_date AS dueDate,
       i.transaction_type AS itemType,
       i.amount * i.in_out AS originalAmount,
       i.amount * i.in_out
         + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance
FROM ap_ar_card i
LEFT JOIN ap_ar_card_detail d ON d.invoice_id = i.ap_ar_card_id
LEFT JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
                      AND p.transaction_date < :asOfPlusOne
                      AND p.in_out IN (-1, 1)
                      AND p.module_type = 0
                      AND p.transaction_type IN (7, 8, 9, 10, 11, 13, 14)
WHERE i.module_type = 0
  AND i.transaction_type IN (0, 1, 2, 3, 4, 5, 6, 12)
  AND i.in_out IN (-1, 1)
  AND i.transaction_date < :asOfPlusOne
  -- AND i.location_id IN (:locIds)
GROUP BY i.ap_ar_card_id, i.invoice_number, i.transaction_number, i.owner_id, i.location_id,
         i.coa_id, DATE(i.transaction_date), i.due_date, i.transaction_type, i.amount, i.in_out
HAVING balance <> 0;
```

Filter entitas di sini memakai `ap_ar_card.location_id`, bukan segmen GL.

### Q17 — Pembayaran belum dialokasikan (ERP langsung)

```sql
SELECT p.ap_ar_card_id AS cardId,
       p.owner_id AS partyId,
       p.location_id AS locationId,
       p.coa_id AS coaId,
       DATE(p.transaction_date) AS txDate,
       p.amount * p.in_out AS balance
FROM ap_ar_card p
WHERE p.module_type = 0
  AND p.transaction_type IN (7, 8, 9, 10, 11, 13, 14)
  AND p.in_out IN (-1, 1)
  AND p.transaction_date < :asOfPlusOne
  -- AND p.location_id IN (:locIds)
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id);
```

### Q18 — Nama vendor
`src/server/repo/party.repo.ts` · `listVendors`. Hanya id, kode, nama.

```sql
SELECT t.vendor_id AS id, t.code AS code, t.name AS name
FROM vendor t
WHERE t.vendor_id IN (:vendorIds);
```

### Rumus AP di JavaScript (`accumulateAging`)

```
unpaid        = Σ balance item yang > 0
vendorCredits = Σ balance item yang ≤ 0
unallocated   = Σ balance Q15/Q17
Total (angka kartu) = unpaid + vendorCredits + unallocated

umur       = asOf − COALESCE(due_date, tx_date)        (pembayaran belum dialokasikan: asOf − tx_date)
umur ≥ 0 : overdue0_30 (0–30), overdue31_60, overdue61_90, overdue90plus
umur < 0 : due1_30 (−1…−30), due31_60, due61_90, due90plus
Overdue (halaman Payables)   = Σ keempat bucket overdue*   (neto: sudah dikurangi kredit vendor & pembayaran belum dialokasikan)
Overdue (kartu Summary)      = Σ saldo POSITIF item yang bucket-nya overdue*   (overdueBills; tanpa kredit vendor)
```

Sumber: `src/lib/finance/ap-ar/apar.ts`, `src/lib/finance/ap-ar/aging.ts`.

### Rekonsiliasi AP dengan GL (jalan di Summary, tidak ditampilkan)
Akun kontrol = `ap_ar_card.coa_id` dari baris AP. Saldo GL-nya dihitung dengan Q7–Q9 (bagian 2) pada `:asOf` (`controlAccountsGlTotal`); `reconcileAging` menghitung selisih GL − subledger dan menganggap selisih di bawah Rp1 sebagai pembulatan. Hasilnya disimpan di `reconciliation`. Kode yang sama dipakai AP dan AR (`src/server/services/shared/aging.helper.ts`, `src/lib/finance/ap-ar/aging-reconciliation.ts`).

### Pembanding AP
Sama dengan Q14–Q17 pada `compare.asOf` bila snapshot (atau riwayat bulan) mencakup tanggal itu (`agingCompareIsAvailable`); kalau tidak, pembanding dilewati agar halaman tidak menunggu. Tanpa snapshot sama sekali, query langsung ke ERP yang dipakai.

### Tabel tagihan (dua tab)
Memakai Q14/Q16 dengan `:asOfPlusOne = today + 1`, lalu di JavaScript:

```
tampil bila balance > 0  DAN  COALESCE(due_date, tx_date) ≤ today + 6 hari
status    = planStatus(statusPengakuanBiaya(invoice_id))      (lihat Q19)
tab "Jatuh tempo ≤ 7 hari" = tagihan dengan COALESCE(due_date, tx_date) >= today
tab "Lewat jatuh tempo"    = tagihan dengan COALESCE(due_date, tx_date) <  today
vendor    = Q18
```

Untuk "overdue" di rencana pembayaran: `due_date < today`. Pemisahan per tab (`filterBillsByScope`), penyortiran, dan paging dilakukan di memori (`paginate`), bukan di SQL. Hasil rencana di-memo, jadi ganti tab atau halaman tidak memicu query baru. Jumlah baris dan total kedua tab (`summarizeBillScopes`) dihitung dari daftar yang sama. Kolom status disembunyikan bila Q19 tidak mengembalikan satu baris pun (`planStatusInUse`).

---

## 5. Cash Flow dan Runway

### Q20 — Baris jurnal yang menyentuh akun kas
`src/server/repo/cashflow.repo.ts` · `linesOfCashJournals`. Per tabel GL, per potongan `:periodIds` / `:cashCoaIds` / `:segIds` (masing-masing ≤ 1.000). Cache 60 detik.

```sql
SELECT d.gl_id AS glId,
       g.journal_type AS journalType,
       g.period_id AS periodId,
       d.coa_id AS coaId,
       d.<SEG> AS segmentDetailId,
       SUM(d.debet) AS debet,
       SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
JOIN (
  -- jurnal yang menyentuh akun kas pada periode terpilih
  SELECT DISTINCT STRAIGHT_JOIN d2.gl_id
  FROM <GL> g2
  JOIN <GL_DETAIL> d2 ON d2.gl_id = g2.gl_id
  WHERE g2.posted_status = 1
    -- AND g2.canceled_date IS NULL        (hanya bila kolomnya ada, Q24)
    AND g2.period_id IN (:periodIds)
    AND d2.coa_id IN (:cashCoaIds)
    -- AND d2.<SEG> IN (:segIds)
) k ON k.gl_id = g.gl_id
WHERE g.posted_status = 1
  -- AND g.canceled_date IS NULL          (hanya bila kolomnya ada, Q24)
GROUP BY d.gl_id, g.journal_type, g.period_id, d.coa_id, d.<SEG>;
```

`:cashCoaIds` = Kas ∪ Bank ∪ Deposito (selalu daftar terluas supaya hasilnya dipakai bersama halaman lain).

### Q21 — Setup arus kas ERP
`cashflow.repo.ts` · `getCashFlowSetup`

```sql
SELECT s.cash_flow_setup_id AS setupId,
       s.cash_flow_group_id AS groupId,
       grp.NAME AS groupName,
       grp.sequence AS groupSequence,
       s.sub_group AS subGroup,
       s.sequence_sub_group AS subSequence,
       s.coa_id AS coaId,
       s.value_displayed AS valueDisplayed,
       c.account_group AS accountGroup,
       c.sub_account_group AS subAccountGroup
FROM cash_flow_setup s
JOIN cash_flow_group grp ON grp.cash_flow_group_id = s.cash_flow_group_id
LEFT JOIN coa c ON c.coa_id = s.coa_id
ORDER BY grp.sequence, s.sequence_sub_group;
```

Hanya dipakai klasifikasi Operating/Investing/Funding, yang tidak tampil di Summary tetapi tetap dieksekusi oleh `computeCashFlow`.

### Kas awal dan akhir (Cash Flow)
- Kas awal = saldo Kas ∪ Bank ∪ Deposito pada `d1 − 1 hari` → bagian 2 (Q7–Q9).
- Kas akhir (cek) = saldo yang sama pada `asOf`.

### Rumus grafik bulanan (JavaScript, `cash-flow.service.ts` dan `lib/finance/cash/cashflow.ts`)

Pemilihan jurnal yang benar-benar menggerakkan kas (`settledJournals`) satu fungsi yang sama dengan alokasi kas untuk Runway dan drill-down.

```
per jurnal (kelompok baris Q20 per glId):
  netKas   = Σ (debet − credit) baris akun kas milik entitas terpilih
  lawan    = baris selain itu
  lewati bila netKas = 0, atau lawan kosong (transfer internal)
  bulan    = start_date periode dari baris kas pertama (periodId)
  netKas > 0 → Cash In bulan itu += netKas
  netKas < 0 → Cash Out bulan itu += |netKas|
Net = Cash In − Cash Out
```

### Runway (`src/server/services/runway.service.ts`)

1. **3 bulan penuh sebelum bulan `asOf`**: dari Q2, ambil bulan reguler dengan `end_date < asOf` dan bulan mulai < bulan `asOf`, 3 terbaru.
2. Q20 untuk periode-periode itu, lalu alokasi kas per jurnal (`allocateCash`); jumlahkan `portion` per bulan.
3. `avgBurn = rata-rata net 3 bulan`. `avgBurn ≥ 0` → "arus kas positif". Selain itu `runway = CashPosition ÷ |avgBurn|` (1 desimal; kas ≤ 0 → `0.0`).

### Current Ratio
Saldo semua akun POSTABLE grup **Liquid Assets** dan **Current Liabilities** pada `asOf` (bagian 2, Q7–Q9 dengan `:coaIds` = gabungan keduanya):

```
CurrentRatio = Σ saldo(Liquid Assets) ÷ |Σ saldo(Current Liabilities)|     (2 desimal; pembagi 0 → null)
```

Gross dan Net margin memakai hasil P&L di bagian 3.

---

## 6. Status Pengakuan Biaya

### Q19 — Dokumen Pengakuan Biaya aktif per tagihan
`src/server/repo/payment-plan.repo.ts` · `listActivePlanStatuses`. Satu query untuk semua tagihan, cache 5 menit.

```sql
SELECT bd.invoice_id AS invoiceId, b.status AS status
FROM bankpo_payment_detail bd
JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
WHERE b.type = 0
  AND b.status IN ('Posted', 'Partialy Paid', 'Not Posted');
```

Pemetaan di JavaScript (`planStatus`): ada `Posted` atau `Partialy Paid` → `approved`; kalau tidak ada tapi ada `Not Posted` → `submitted`; selain itu `notSubmitted`. Ejaan `Partialy` mengikuti data ERP.

---

## 7. Query pembangun snapshot `dash_*`

Berjalan di dalam proses server (`src/server/dash/scheduler.ts`), bukan saat halaman dimuat. Menulis **hanya** ke tabel berawalan `dash_` (dijaga `dashTable()` dan `src/server/dash/guard.test.ts`).

### Snapshot GL bulanan
`src/server/dash/gl-snapshot.ts` · `buildPeriod`. Satu transaksi per periode `Closed` yang belum ada.

```sql
DELETE FROM dash_snap_gl_monthly WHERE period_id = :periodId;

INSERT INTO dash_snap_gl_monthly (period_id, coa_id, segment_id, debet, credit)
SELECT STRAIGHT_JOIN g.period_id, d.coa_id, COALESCE(d.segment1_id, 0), SUM(d.debet), SUM(d.credit)
FROM <GL> g JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1 AND g.canceled_date IS NULL AND g.period_id = :periodId
GROUP BY g.period_id, d.coa_id, COALESCE(d.segment1_id, 0);

INSERT INTO dash_snap_gl_periods (period_id, built_at, row_count, duration_ms)
VALUES (:periodId, UTC_TIMESTAMP(), :rowCount, :durationMs)
ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms);
```

Periode yang tidak lagi `Closed` dihapus dari kedua tabel snapshot.

### Snapshot AP/AR
`src/server/dash/refresh-ap-ar.ts`. Dibangun dari tiga pemindaian sederhana (satu join besar memakan ±10 menit pada data demo), gabungannya dikerjakan di JavaScript. Dijalankan per sisi (`module_type` 0 dan 1).

```sql
-- (a) total pelunasan per tagihan  (di-stream, disimpan dalam Map)
SELECT d.invoice_id, SUM(d.amount)
FROM ap_ar_card_detail d
JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
WHERE p.module_type = :module AND p.transaction_type IN (:settlementTypes)
  AND p.in_out IN (-1, 1) AND p.transaction_date < :asOfPlusOne
GROUP BY d.invoice_id;

-- (b) semua tagihan (di-stream); yang saldonya ≠ 0 disimpan
--     saldo = amount × in_out + SUM dari (a)
SELECT i.ap_ar_card_id, i.amount * i.in_out
FROM ap_ar_card i
WHERE i.module_type = :module AND i.transaction_type IN (:invoiceTypes)
  AND i.in_out IN (-1, 1) AND i.transaction_date < :asOfPlusOne;

-- (c) kolom deskriptif untuk tagihan terbuka, per potongan 1.000 id
SELECT ap_ar_card_id, owner_id, location_id, coa_id, DATE(transaction_date), due_date, transaction_type,
       COALESCE(NULLIF(invoice_number, ''), transaction_number, '')
FROM ap_ar_card WHERE ap_ar_card_id IN (:ids);

-- (d) pembayaran belum dialokasikan
SELECT p.ap_ar_card_id, p.owner_id, p.location_id, p.coa_id, DATE(p.transaction_date), p.amount * p.in_out
FROM ap_ar_card p
WHERE p.module_type = :module AND p.transaction_type IN (:unallocatedTypes)
  AND p.in_out IN (-1, 1) AND p.transaction_date < :asOfPlusOne
  AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id);

-- (e) sidik jari ERP, untuk melewati rebuild bila tidak ada yang berubah
SELECT COUNT(*), MAX(ap_ar_card_id) FROM ap_ar_card;
SELECT COUNT(*), MAX(ap_ar_card_detail_id) FROM ap_ar_card_detail;
```

Hasil ditulis ke tabel bayangan `dash_snap_ap_ar_open_new` / `dash_snap_ap_ar_unallocated_new`, lalu ditukar dengan satu `RENAME TABLE` atomik. Rebuild minimal tiap 1 jam walau sidik jari sama (edit baris yang ada tidak mengubah sidik jari). Status ditulis ke `dash_snap_meta`.

---

## 8. Matriks: kartu → query

| Komponen Summary | Query |
|---|---|
| Cash Position | Q1, Q2, Q3, Q4, Q5, Q7, Q8, Q9, Q10, Q22 untuk baris giro/cek beredar (+ ulang Q7–Q9 untuk pembanding) |
| Revenue | Q1–Q5, Q11 atau Q12 (+ Q13), plus Q11/Q12 untuk pembanding |
| Net Profit | Q1–Q5, Q11 atau Q12 (+ Q13), plus pembanding |
| Payables | Q1, Q14–Q15 (atau Q16–Q17), Q18, rekonsiliasi GL (Q7–Q9) |
| Cash Flow (grafik) | Q1–Q5, Q7–Q9 (kas awal/akhir), Q20, Q21 |
| Composition — Revenue | sama dengan kartu Revenue |
| Composition — Expense | Q11 / Q12 (akun keranjang Biaya Tetap termasuk di pembacaan bersama) |
| Tabel tagihan (dua tab) | Q14 (atau Q16), Q19, Q18, Cash Position hari ini (Q7–Q10) |
| Runway | Q20 (3 bulan sebelumnya), Cash Position, P&L |
| Gross / Net margin | hasil P&L (Q11 / Q12) |
| Current Ratio | Q1, Q7–Q9 untuk akun Liquid Assets + Current Liabilities |

---

## 9. Cache dan jumlah eksekusi

| Cache | TTL | Lokasi |
|---|---|---|
| Q1–Q4 | 10 menit | `context.ts` |
| Q5 | 2 menit | `shared/mapping.helper.ts` |
| Saldo akun (Q7–Q9) | 60 detik | `balance.service.ts` |
| Q10 dan Q20 | 60 detik | repo masing-masing |
| Q19 | 5 menit | `payment-plan.repo.ts` |
| Q22 (giro/cek beredar) | 60 detik | `bank-payment.repo.ts` |
| Q24 (kolom `canceled_date`) | 1 jam per tabel GL | `db/gl-columns.ts` |
| Hasil metrik (Revenue, P&L, …) | 60 detik (`memoMetric`) | `server/cache.ts` |
| Hasil turunan snapshot AP | selama snapshot yang sama (maks 6 jam) | `dash/snapshot.ts` |
| Mutasi periode `Closed` (Q11) | LRU permanen; periode `Open` / `Pre Closed` tidak pernah di-cache | `gl.repo.ts` |

Semua metrik dijalankan paralel (`Promise.all` di `summary.service.ts`), dan beberapa memakai pembacaan yang sama (P&L, Fixed Cost, Revenue-pembanding berbagi Q11).

---

## 10. Query tambahan (Q22–Q24)

Query yang ditambahkan pada gelombang 2 (keputusan D31 dan D35 di `decisions.md`).

### Q22 — Giro/cek beredar
`src/server/repo/bank-payment.repo.ts` · `outstandingGiro`. Cache 60 detik. Dipakai kartu Cash Position (informasi, bukan bagian angka utama).

```sql
SELECT COALESCE(SUM(bp.amount), 0) AS amount
FROM bank_payment bp
WHERE bp.type IN (0, 4, 7)                    -- BG, cek tangguh, e-banking
  AND bp.transaction_date < :asOfPlusOne
  AND ( bp.status = 0 OR (bp.status = 1 AND bp.payment_date >= :asOfPlusOne) )
  -- AND bp.<SEG> IN (:segIds)
;
```

### Q23 — Tidak dipakai
Nomor ini dikosongkan: query "terposting sampai" dibatalkan (D34) sehingga tidak ada di kode.

### Q24 — Apakah tabel GL punya kolom `canceled_date`
`src/server/db/gl-columns.ts` · `glTableHasCanceledDate`. Cache 1 jam per nama tabel (`gl`, `gl_2024`, …).

```sql
SELECT COUNT(*) AS n
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = :glTable
  AND column_name = 'canceled_date';
```

---

## 11. Riwayat Perubahan

| Tanggal | Perubahan |
|---|---|
| 2026-10-30 | Dokumen dibuat dari pembacaan kode (belum ada perubahan pada halaman Summary). |
| 2026-10-30 | Rencana gelombang 2: Q10 memakai aturan belum cair pada asOf; Q22 dan Q24 ditambahkan (Q23 dibatalkan); istilah Pengakuan Biaya. |
| 2026-10-30 | Disinkronkan dengan kode terbaru: tabel tagihan dua tab (`filterBillsByScope`, `planStatusInUse`), rekonsiliasi AP/AR (`reconcileAging`), `settledJournals`, `sliceCombos`, Q20 menandai kondisi `canceled_date` sebagai opsional, matriks dan tabel cache ditambah Q22 dan Q24. Tidak ada query yang berubah isinya. |
| 2026-10-30 | Fitur OCI dinonaktifkan (D39): akun OCI tidak lagi dikeluarkan dari baris P&L dan tidak ikut dibaca sebagai kelompok tersendiri di Q11/Q12. |
