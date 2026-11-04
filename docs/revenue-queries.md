# Halaman Revenue — Katalog Query SQL

> **Untuk developer.** Daftar semua query yang berjalan saat halaman Revenue dimuat dan saat drill-down dibuka, ditulis ulang dari kode sumber dalam bentuk SQL dengan parameter `?` / `:nama`. Penjelasan untuk tim finance ada di [`revenue-page.md`](./revenue-page.md).
>
> **Cara baca:**
> - Query yang **sama persis** dengan katalog Summary memakai ID yang sama (`Q1`–`Q5`, `Q11`–`Q13`, `Q24`) dan **SQL-nya tidak diulang**: lihat [`summary-queries.md`](./summary-queries.md). Di sini hanya ditulis nilai parameter khusus Revenue. Query yang khusus halaman ini memakai ID `R1`, `R2`, … dan SQL-nya ditulis lengkap.
> - Query ditranskripsi dari kode; bila kode berubah, kodenya yang benar.
> - `<SEG>` = kolom segmen entitas (klien ini `segment1_id`), dicari dari `segment` yang `count = 1` dan divalidasi `assertSegmentColumn`.
> - `<GL>` / `<GL_DETAIL>` = `gl` / `gl_detail` atau tabel arsip `gl_20XX` / `gl_detail_20XX`, ditentukan `periode.table_name` (`src/server/db/gl-tables.ts`, pola `^gl(_20\d{2})?$`).
> - Daftar `IN (...)` dipecah per **1.000** id (`IN_LIST_LIMIT`); satu query logis bisa menjadi beberapa eksekusi (`sliceCombos`, `src/server/db/chunk.ts`).
> - Semua SQL harus kompatibel **MySQL 5.7** (tanpa CTE / window function). Dijaga oleh `src/server/repo/sql-guard.test.ts`.
> - Kondisi `canceled_date IS NULL` hanya ditambahkan bila tabel GL itu punya kolomnya (`notCanceledClause`, Q24).
> - Drizzle membuat nilai parameter jadi `?`. Alias kolom camelCase memakai `AS`.
>
> **Belum dijalankan.** Dokumen ini tidak dibuat dengan mengeksekusi query ke database.
>
> **Terakhir diperbarui:** 2026-11-04

## Daftar isi

1. [Query referensi (Q1–Q5)](#1-query-referensi-q1q5)
2. [Mutasi Revenue periode terpilih (R1, R2)](#2-mutasi-revenue-periode-terpilih)
3. [Mutasi periode pembanding (R3)](#3-mutasi-periode-pembanding)
4. [Rumus di JavaScript](#4-rumus-di-javascript)
5. [Drill-down (R4–R6)](#5-drill-down)
6. [Matriks: bagian halaman → query](#6-matriks-bagian-halaman--query)
7. [Cache dan jumlah eksekusi](#7-cache-dan-jumlah-eksekusi)
8. [Riwayat Perubahan](#riwayat-perubahan)

---

## 1. Query referensi (Q1–Q5)

Dibaca setiap request tetapi di-cache di memori (lihat bagian 7). Isinya sama dengan [`summary-queries.md`](./summary-queries.md) bagian 1; **tidak ada yang berubah untuk Revenue.**

| ID | Isi | Dipakai Revenue untuk |
|---|---|---|
| Q1 | Daftar akun `coa` | Menentukan akun POSTABLE grup Revenue, membentuk folder, memberi nama akun dan folder |
| Q2 | Daftar periode `periode` | Filter → `period_id`; status (Closed / Open / Pre Closed); tabel GL per periode; bulan per periode untuk tren |
| Q3 | Kolom segmen entitas (`segment`, `count = 1`) | Nama kolom `<SEG>` |
| Q4 | Daftar entitas (`pos_location` + `segment_detail`) | Daftar baris tabel Pendapatan per Entitas; menerjemahkan filter entitas menjadi `:segIds` |
| Q5 | Pengaturan keranjang akun (`system_main`, `DASHBOARD_ACCOUNT_MAPPING`) | **Tidak** dipakai untuk menghitung Revenue. Terbaca hanya karena pembacaan pembanding R3 meminta akun keranjang Biaya Tetap juga |

`:segIds` = daftar `segment_detail_id` dari entitas terpilih; bila semua entitas dipilih, `:segIds = 'all'` dan klausa `AND d.<SEG> IN (...)` dihilangkan.

Filter periode → `:periodIds` terjadi di JavaScript (`resolvePeriod`, `src/lib/finance/period/periods.ts`), tanpa SQL: satu periode reguler (`type = 0`) per bulan dalam rentang, ditambah periode 13 (`type = 1`) yang tanggal akhirnya jatuh dalam rentang bila toggle aktif dan rentangnya YTD / 12 bulan / kustom. Pembanding dihitung sama untuk rentang pembanding (aturan di `revenue-page.md` bagian 1).

---

## 2. Mutasi Revenue periode terpilih

Mesin: `src/server/repo/gl/gl.repo.ts` · `movementsByPeriods`, dipanggil `src/server/services/pnl/revenue.service.ts` · `computeRevenue`. Periode dikelompokkan per tabel GL dan tiap tabel dibaca **paralel**.

Parameter Revenue: `:coaIds` = semua akun **POSTABLE** dengan `account_group = 'Revenue'` (`postableAccountIds(tree, ['Revenue'])`, tanpa akun yatim), `byPeriod = true`, `byLocation = true`, tanpa `accountGroups` (jadi tanpa `JOIN coa`).

Per periode: `Closed` → cache LRU di memori, lalu snapshot (R2) bila periodenya sudah dibangun dan `<SEG> = segment1_id`, selain itu ERP (R1). `Open` / `Pre Closed` → **selalu** ERP (R1), tidak pernah di-cache.

### R1 — Mutasi Revenue (ERP langsung) = Q11 dengan `byPeriod` + `byLocation`

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       , g.period_id AS periodId
       , sd.location_id AS locationId
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.<SEG>
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL                    -- hanya bila kolomnya ada (Q24)
  AND g.period_id IN (:periodIds)
  AND d.coa_id IN (:revenueCoaIds)
  -- AND d.<SEG> IN (:segIds)                    -- bila entitas dipilih
GROUP BY d.coa_id, g.period_id, sd.location_id;
```

- `LEFT JOIN segment_detail`: jurnal tanpa entitas (atau entitas yang tidak punya `segment_detail`) tetap terbaca dengan `locationId = NULL`; mereka hanya masuk total, tidak masuk baris entitas.
- Bila filter memilih entitas tertentu, `AND d.<SEG> IN (:segIds)` **membuang** jurnal tanpa entitas.
- `STRAIGHT_JOIN` wajib (lihat `summary-queries.md` Q11). Jangan dihapus.
- Satu `:segIds` dan satu `:coaIds` > 1.000 id menghasilkan beberapa eksekusi (potongan).
- Untuk periode `Closed` yang jatuh ke ERP, `byPeriod` dipaksa `true` (supaya hasil bisa di-cache per periode); `byLocation` mengikuti pilihan Revenue.

### R2 — Mutasi Revenue periode Closed dari snapshot = Q12 dengan `byLocation`

`src/server/dash/gl-snapshot.ts` · `snapshotMovements`. Dipakai bila periode ada di `dash_snap_gl_periods` (Q13) dan `<SEG> = segment1_id`.

```sql
SELECT s.coa_id AS coaId, s.period_id AS periodId
       , sd.location_id AS locationId
       , SUM(s.debet) AS debet, SUM(s.credit) AS credit
FROM dash_snap_gl_monthly s
LEFT JOIN segment_detail sd ON sd.segment_detail_id = s.segment_id
WHERE s.period_id IN (:periodIds)
  AND s.coa_id IN (:revenueCoaIds)
  -- AND s.segment_id IN (:segIds)
GROUP BY s.coa_id, s.period_id, sd.location_id;
```

Di snapshot, jurnal tanpa entitas disimpan dengan `segment_id = 0` (`COALESCE(d.segment1_id, 0)`), jadi `sd.location_id` juga `NULL`: perilakunya sama dengan R1.

### Q13 dan Q24 (tidak berubah)

- **Q13** daftar periode yang sudah ada di snapshot GL (cache 30 detik). Bila tabel `dash_*` belum ada, error ditelan dan semua periode Closed dibaca dari ERP (R1).
- **Q24** apakah tabel GL punya kolom `canceled_date` (cache 1 jam per tabel). Dijalankan di awal untuk semua tabel GL yang dipakai.

---

## 3. Mutasi periode pembanding

Hanya berjalan bila `compare.periodIds` tidak kosong. Tanpa `byLocation` (pembanding hanya total).

### R3 — Pembacaan bersama P&L untuk periode pembanding

`src/server/services/pnl/pl-movements.ts` · `loadPlMovements(filter, compare.periodIds)`, dibungkus `memoMetric('plMovements', { periodIds, segCol, segIds })`.

Parameter: `:coaIds` = POSTABLE grup **Revenue, Cost Of Sales, Expense, Other Revenue, Other Expense** ∪ akun keranjang **Biaya Tetap** (dari Q5 lewat `loadResolvedBaskets`), `byPeriod = true`, `byLocation = false`.

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       , g.period_id AS periodId
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL                    -- hanya bila kolomnya ada (Q24)
  AND g.period_id IN (:comparePeriodIds)
  AND d.coa_id IN (:plAndFixedCostCoaIds)
  -- AND d.<SEG> IN (:segIds)
GROUP BY d.coa_id, g.period_id;
```

Versi snapshot (R2 tanpa `locationId`) dipakai untuk periode Closed yang sudah ada di snapshot, sama dengan R1/R2.

Hasilnya **disaring di JavaScript** ke akun Revenue (`onlyAccounts`) lalu dijumlah (`sumNetRevenue`). Daftar akun lebih lebar daripada kebutuhan Revenue supaya hasil yang sama dipakai halaman P&L, Fixed Cost, dan Budget (satu pembacaan, tidak berulang). Konsekuensinya: pada halaman Revenue yang dibuka sendiri, pembacaan ini membaca lebih banyak baris daripada yang dipakai.

---

## 4. Rumus di JavaScript

| Hasil | Rumus | File |
|---|---|---|
| Revenue (`total`) | Σ (credit − debet) semua baris R1/R2, tanda dari `signedDecimal('Revenue', …)`; dibulatkan 2 desimal sekali di akhir | `lib/finance/pnl/revenue.ts` (`aggregateRevenue`) |
| Pembanding (`compareTotal`) | Σ (credit − debet) baris R3 yang akunnya Revenue; `null` bila tidak ada periode pembanding | `revenue.ts` (`sumNetRevenue`), `revenue.service.ts` |
| Folder (`byFolder`) | Σ net tiap akun POSTABLE di bawah folder; net akun = (credit − debet) dari jumlah per akun yang sudah dibulatkan 2 desimal | `revenue.ts` (`groupFolders`, `buildRevenueBreakdown`, `movementsByCoaOf`) |
| Tren (`trend`) | Σ net per bulan; bulan = `periode.start_date` (`YYYY-MM`) dari periode barisnya; bulan tanpa data = `0.00`; urutan = `filter.months` | `revenue.ts` (`revenueTrend`) |
| Per entitas (`byEntity`) | Σ net per `locationId`, satu baris per entitas di filter (0.00 bila kosong) | `revenue.ts` (`splitRevenueByEntity`) |
| Tanpa entitas (`entityUnassigned`) | `total − Σ byEntity` (string 2 desimal; bisa negatif) | idem |
| Porsi entitas | nilai ÷ (Σ entitas > 0 + Tanpa entitas bila > 0), 6 desimal; nilai ≤ 0 → `null` | `lib/finance/pnl/revenue-entity.ts` (`buildEntityTableRows`) |
| Kategori / Entitas Terbesar | nilai terbesar menurut angka (`largestByAmount`) | `lib/core/money.ts`, `components/revenue/RevenueKpiRow.tsx` |
| Perubahan % | (Revenue − Pembanding) ÷ \|Pembanding\| × 100, 2 desimal; Pembanding 0 → tidak tampil | `lib/format/kpi.ts` (`computeChangePercent`) |

**Pembentukan folder (`groupFolders`):**

```
postable   = semua akun POSTABLE grup Revenue (tanpa akun yatim)
murni(n)   = semua POSTABLE di bawah n (atau n sendiri) berasal dari grup Revenue
untuk tiap postable: naik ke induk selama murni(induk); berhenti di induk tertinggi yang murni → akar
akar tunggal  → folder = anak langsung akar (bila tak punya anak: akar itu sendiri)
akar banyak   → folder = tiap akar
```

Tidak ada angka Revenue yang dibaca dari tabel lain selain `gl` / `gl_detail` (atau `dash_snap_gl_monthly`). Tanda akun tidak memakai `coa.saldo_normal`, melainkan sisi `account_group` (`lib/finance/coa/sign.ts`).

---

## 5. Drill-down

`src/server/services/drill/gl-metrics.ts` · `glMetricDrill` (metrik `revenue`), fungsi di `src/server/services/drill/shared.ts`. Dijalankan saat pengguna mengklik; periode = `filter.periodIds` (bukan pembanding). `:folderCoaIds` = POSTABLE di bawah folder yang diklik (`accountIdsOf`).

### R4 — Folder → akun

`accountRows` memanggil `movementsByPeriods` dengan `coaIds = :folderCoaIds`, **tanpa** `byPeriod` dan **tanpa** `byLocation`. SQL sama dengan R1 tanpa kolom `periodId` dan `locationId`, dan tanpa `LEFT JOIN segment_detail` (untuk periode Closed yang jatuh ke ERP tetap membawa `period_id`, lalu dijumlah).

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.period_id IN (:periodIds)
  AND d.coa_id IN (:folderCoaIds)
  -- AND d.<SEG> IN (:segIds)
GROUP BY d.coa_id;
```

Di JavaScript: net per akun = credit − debet (`signedFor`), akun bernilai 0 dibuang, diurutkan menurut kode.

### R5 — Akun → entitas

`entityRows`. Sama dengan R1 dengan `coaIds = :accountCoaIds` dan `byLocation`:

```sql
SELECT STRAIGHT_JOIN d.coa_id AS coaId
       , sd.location_id AS locationId
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.<SEG>
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.period_id IN (:periodIds)
  AND d.coa_id IN (:accountCoaIds)
  -- AND d.<SEG> IN (:segIds)
GROUP BY d.coa_id, sd.location_id;
```

Di JavaScript: net per lokasi, hanya entitas dalam filter dan bernilai ≠ 0 yang ditampilkan (baris tanpa lokasi tidak ditampilkan di level ini). Dilewati bila filter hanya satu entitas (langsung ke R6).

### R6 — Baris jurnal

`src/server/repo/gl/gl-journal.repo.ts` · `journalLines`. Satu query per tabel GL, 200 baris per halaman, terbaru dulu. Bila periode tersebar di beberapa tabel GL, tiap tabel mengembalikan `offset + 200` baris, lalu digabung dan dipotong (`mergeJournalPages`).

```sql
SELECT STRAIGHT_JOIN g.gl_id AS glId,
       g.journal_number AS journalNumber,
       DATE(g.trans_date) AS transDate,
       g.journal_type AS journalType,
       COALESCE(g.memo, '') AS memo,
       d.coa_id AS coaId
       -- , d.<SEG> AS segmentDetailId             ← hanya bila lebih dari 1 entitas dalam filter
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <GL> g
JOIN <GL_DETAIL> d ON d.gl_id = g.gl_id
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL                      -- hanya bila kolomnya ada (Q24)
  AND g.period_id IN (:periodIds)
  AND d.coa_id IN (:coaIds)
  -- AND d.<SEG> IN (:segIds)                      -- entitas dari langkah drill, atau dari filter
GROUP BY g.gl_id, g.journal_number, DATE(g.trans_date), g.journal_type, g.memo, d.coa_id
         -- , d.<SEG>
ORDER BY g.trans_date DESC, g.gl_id DESC, d.coa_id
         -- , d.<SEG>
LIMIT :limit OFFSET :offset;
```

`:coaIds` = satu akun yang diklik (atau POSTABLE di bawahnya bila yang diklik HEADER). Hasil bukan baris mentah `gl_detail`, melainkan jumlah debet dan kredit **per jurnal per akun** (dan per entitas bila `segmentDetailId` ikut).

---

## 6. Matriks: bagian halaman → query

| Bagian halaman | Query |
|---|---|
| Kartu Revenue (angka utama) | Q1–Q4, R1 atau R2 (+ Q13, Q24) |
| Kartu Revenue (pembanding dan persentase) | Q5, R3 (atau R2 tanpa lokasi) |
| Kartu Kategori Terbesar | sama dengan angka utama (R1 / R2), `byFolder` dihitung di JavaScript |
| Kartu Entitas Terbesar | sama dengan angka utama (R1 / R2 dengan lokasi), `byEntity` dihitung di JavaScript |
| Grafik tren bulanan | sama dengan angka utama (R1 / R2 dengan `periodId`), digabung per bulan di JavaScript |
| Donut komposisi | sama dengan angka utama; **tanpa query tambahan** |
| Tabel Rincian Folder Pendapatan | sama dengan angka utama; tanpa query tambahan |
| Tabel Pendapatan per Entitas | sama dengan angka utama (kolom lokasi); "Tanpa entitas" dihitung di JavaScript; tanpa query tambahan |
| Drill-down folder → akun | R4 |
| Drill-down akun → entitas | R5 |
| Drill-down → baris jurnal | R6 |

Jumlah query SQL satu kali muat halaman (cache dingin, satu tabel GL, tanpa pemotongan 1.000 id, semua periode di ERP): Q1–Q4 (4, bila belum di-cache), Q24 (1), Q13 (1), R1 (1), Q5 (1) + R3 (1) = **9**. Bila semua periode Closed sudah di snapshot: R1 digantikan R2. Pada beban hangat (cache terisi) hanya R1/R2 untuk periode Open dan tidak ada query lain.

---

## 7. Cache dan jumlah eksekusi

| Cache | TTL | Lokasi |
|---|---|---|
| Q1–Q4 | 10 menit | `src/server/context.ts` |
| Q5 | 2 menit | `src/server/services/shared/account-mapping.ts` |
| Q13 (periode di snapshot GL) | 30 detik | `src/server/dash/gl-snapshot.ts` |
| Q24 (kolom `canceled_date`) | 1 jam per tabel GL | `src/server/db/gl-columns.ts` |
| Hasil Revenue (`computeRevenue`) | 60 detik (`memoMetric('revenue', filter)`) | `src/server/cache.ts` |
| Pembacaan bersama P&L untuk pembanding (R3) | 60 detik (`memoMetric('plMovements', …)`), dibagi dengan P&L, Fixed Cost, Budget | `pl-movements.ts` |
| Mutasi periode `Closed` | LRU di memori, tidak kedaluwarsa; kuncinya memuat opsi baca (`byLocation`, akun, entitas) sehingga pembacaan Revenue dan P&L memiliki entri sendiri-sendiri; periode `Open` / `Pre Closed` tidak pernah di-cache | `gl.repo.ts` |
| Drill-down (R4–R6) | tidak ada cache di tingkat hasil; R4 dan R5 memakai LRU periode Closed yang sama | `drill.service.ts` |

Pembacaan R1 dan R3 berjalan **paralel** (`Promise.all` di `computeRevenue`).

---

## 8. Riwayat Perubahan

| Tanggal | Perubahan |
|---|---|
| 2026-11-04 | Dokumen dibuat dari pembacaan kode halaman Revenue (belum ada perubahan pada halaman). Dibuat bersama `revenue-page.md`. |
