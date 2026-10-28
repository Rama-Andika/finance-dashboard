# Fase 9 – Repository & server function metrik

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [08_phase-coa-keranjang-settings.md](./08_phase-coa-keranjang-settings.md) · Berikutnya: [10_phase-halaman-metrik.md](./10_phase-halaman-metrik.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (08_phase-coa-keranjang-settings.md) sudah lulus "✅ Cek selesai".

---

> Pola setiap metrik: **repo** (SQL agregat, `src/server/repo/`) → **logika murni** (`src/lib/finance/`, dites dengan fixture) → **service** (`src/server/services/<metrik>.service.ts`, server-only, merangkai repo + logika, dipakai ulang oleh Ringkasan) → **server function** tipis (`src/functions/metrics/<metrik>.fn.ts`) → **queryOptions** (`src/queries/metrics.queries.ts`).
>
> Nama fungsi service: `compute<Metrik>(filter)`, contoh `computeRevenue`, `computeCashPosition`, `computeApAging`.
>
> Semua rumus diambil dari `data-model.md` §6. Bila rumus di bawah terasa berbeda dengan §6, **§6 yang benar**; berhenti dan tanya user.

## Langkah 9.0 — Kontrak hasil bersama

📁 File: ✏️ `src/lib/finance/types.ts` (tambahkan)

```ts
export type MetricMeta = {
  readAt: string              // server ISO time when data was read (sidebar freshness panel)
  d1: IsoDate
  asOf: IsoDate
  today: IsoDate
  entityCount: number         // number of selected entities (all = total entity count)
  isAllEntities: boolean
  hasOpenPeriod: boolean      // true → show the "period not closed yet" Notice
  missingMonths: string[]     // months without a period row → Notice
}

export type Breakdown = { id: string; label: string; code?: string; amount: Money; children?: Breakdown[] }
```

Setiap server function metrik mengembalikan `{ meta: MetricMeta, … }`.

## Langkah 9.1 — Repository GL umum

📁 File: ➕ `src/server/repo/gl.repo.ts`

Fungsi (semua menerima `segCol` = kolom segmen entitas dari `resolveFilter`, dan `segIds: Id[] | 'all'`):

| Fungsi | Dipakai untuk | Kunci waktu |
|---|---|---|
| `movementsByPeriods({ periods, segCol, segIds, coaIds?, accountGroups?, byPeriod, byLocation })` | P&L, Revenue, Fixed Cost, Budget actual, Cash Flow bulanan | `period_id` (G14) |
| `movementsByDate({ from, to, tables, segCol, segIds, coaIds, byDate })` | saldo per tanggal, tren harian | `trans_date` (G14) |
| `openingBalances({ periodeId, segIds, coaIds })` | saldo awal (§4.5) | — |
| `countOpeningRows(periodeId)` | cek periode punya saldo awal | — |
| `journalLines({ tables, glIds })` | drill-down jurnal (Fase 11) | — |

Kerangka SQL `movementsByPeriods` (dijalankan **per tabel GL**, hasil digabung di JS; bagian dalam `[ … ]` hanya ditambahkan bila parameternya ada):

```sql
SELECT d.coa_id AS coaId
       [, g.period_id AS periodId]
       [, sd.location_id AS locationId]
       , SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <gl> g
JOIN <gl_detail> d ON d.gl_id = g.gl_id
[JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (?, …)]
[LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.<segCol>]
WHERE g.posted_status = 1
  AND g.canceled_date IS NULL
  AND g.period_id IN (?, …)
  [AND d.<segCol> IN (?, …)]
  [AND d.coa_id IN (?, …)]
GROUP BY d.coa_id [, g.period_id] [, sd.location_id];
```

- `<gl>`, `<gl_detail>`, `<segCol>` dimasukkan dengan `sql.identifier()` setelah lolos whitelist (`glTablesOf`, regex segmen langkah 7.3).
- `periods` dikelompokkan dengan `groupPeriodsByTable` (langkah 5.5); satu query per tabel.
- Daftar `IN` lebih dari 1.000 nilai dipecah per 1.000 dan hasilnya digabung (jumlahkan per kunci dengan `decimal.js`).

`movementsByDate` sama, tetapi `WHERE g.trans_date >= ? AND g.trans_date <= ?` (tanpa `period_id`); tabel = semua `table_name` berbeda dari periode yang rentang tanggalnya beririsan dengan `[from, to]`. Bila `byDate`, tambahkan `g.trans_date AS transDate` ke `SELECT` dan `GROUP BY`.

`openingBalances`:

```sql
SELECT o.coa_id AS coaId, SUM(o.opening_balance) AS opening
FROM coa_opening_balance_location o
WHERE o.periode_id = ?
  AND o.coa_id IN (?, …)
  [AND o.segment1_id IN (?, …)]
GROUP BY o.coa_id;
```

> Tabel saldo awal selalu memakai kolom `segment1_id`. Bila kolom segmen entitas (langkah 7.3) **bukan** `segment1_id`, lempar error `"Entity segment is not segment1_id — user decision required"` dan berhenti.

✅ Cek selesai: `npm run typecheck` dan `sql-guard.test.ts` lulus.

## Langkah 9.2 — Mesin saldo (snapshot)

📁 File: ➕ `src/lib/finance/balance.ts`, ➕ `src/lib/finance/balance.test.ts`, ➕ `src/server/services/balance.service.ts`

`balance.ts` (murni):

```ts
/** data-model §4.5: C = last type-0 Closed period with end_date < asOf; P* = first type-0 period after C
 *  (C null → P* = earliest type-0 period; no periods at all → both null). */
export function pickOpeningPeriod(periods: Period[], asOf: IsoDate): { closed: Period | null; opening: Period | null }

/** Combine openings (already signed) + movements (signed per account group). Result: balance per coaId. */
export function combineBalances(
  accounts: Map<Id, { accountGroup: AccountGroup }>,
  openings: { coaId: Id; opening: Money }[],
  movements: { coaId: Id; debet: Money; credit: Money }[],
): Map<Id, Money>
```

`balance.service.ts`:

```ts
export async function balancesAt(input: { asOf: IsoDate; coaIds: Id[]; filter: ResolvedFilter & { entitySegmentColumn: string } }): Promise<{
  byCoa: Map<Id, Money>
  method: 'opening-table' | 'trial-balance'      // shown as a small info label
}>
```

Algoritma:
1. `{ closed: C, opening: P* } = pickOpeningPeriod(periods, asOf)`.
2. Bila `P*` ada **dan** `countOpeningRows(P*.periodeId) > 0` → metode `opening-table`:
   - saldo awal = `openingBalances(P*, coaIds, segIds)`;
   - mutasi = `movementsByDate({ from: addDays(C.endDate, 1) atau P*.startDate bila C null, to: asOf, coaIds })` (posted saja, §4.5 catatan).
3. Selain itu → metode `trial-balance` (cadangan D29): mutasi = `movementsByDate({ from: '1900-01-01', to: asOf, coaIds })` di **semua** tabel GL; saldo awal = 0.
4. `combineBalances(...)`.

✅ Cek selesai (test wajib `balance.test.ts`):
- Saldo awal 1.000 + debit 200 − kredit 50 pada akun `Liquid Assets` → `1150.00`.
- Akun `Current Liabilities`: saldo awal 500 + kredit 100 → `600.00`.
- `pickOpeningPeriod`: asOf 2026-10-28 dengan Sep Closed, Okt Open → C = Sep, P* = Okt. Tanpa periode Closed → C = null.
- Akun tanpa saldo awal dan tanpa mutasi → `0.00`.

✏️ Lengkapi Settings: `getCoaTreeFn` mengisi `balances` memakai `balancesAt` (asOf = hari ini, semua akun POSTABLE dari keranjang yang sedang dibuka), dan kolom saldo di `BasketPreview` (langkah 8.7) menampilkannya.

## Langkah 9.3 — Cash Position & Dana dalam pencairan (§6.2)

📁 File: ➕ `src/server/repo/bank-payment.repo.ts`, ➕ `src/server/services/cash-position.service.ts`, ➕ `src/functions/metrics/cash-position.fn.ts`

Rumus (§6.2):

```
Kas          = saldo(basket('cash'), asOf)
Bank         = saldo(basket('bank'), asOf)
CashPosition = Kas + Bank                       ← angka utama
Deposito     = saldo(basket('deposit'), asOf)   ← baris terpisah
DanaTransit  = saldo(basket('inTransit'), asOf) ← kartu terpisah
```

`bank-payment.repo.ts`:

```sql
-- unsettledByChannel(asOf, coaIds, segIds) — funds not yet settled (D30)
SELECT bp.coa_id AS coaId, bp.segment1_id AS segmentDetailId, DATE(bp.transaction_date) AS txDate,
       COUNT(*) AS n, SUM(bp.amount) AS amount
FROM bank_payment bp
WHERE bp.type IN (1, 2)
  AND bp.status = 0
  AND bp.coa_id IN (?, …)
  AND bp.transaction_date < ?            -- asOf + 1 day
  [AND bp.segment1_id IN (?, …)]
GROUP BY bp.coa_id, bp.segment1_id, DATE(bp.transaction_date);

-- settlementLag(today, coaIds) — average settlement days over the last 90 days (data-model §6.9)
SELECT bp.coa_id AS coaId,
       AVG(DATEDIFF(bp.payment_date, DATE(bp.transaction_date))) AS avgLag,
       COUNT(*) AS n
FROM bank_payment bp
WHERE bp.type IN (1, 2)
  AND bp.status = 1
  AND bp.payment_date IS NOT NULL
  AND bp.transaction_date >= ?           -- today − 90 days
  AND bp.transaction_date < ?            -- today + 1 day
  AND bp.coa_id IN (?, …)
GROUP BY bp.coa_id;
```

Output `getCashPositionFn` (input `metricInputSchema`):

```ts
{
  meta: MetricMeta
  cash: Money; bank: Money; cashPosition: Money; deposit: Money; inTransit: Money
  compare: { cashPosition: Money | null }               // balance at compare.asOf
  byFolder: Breakdown[]                                 // Cash/Bank → folder → account (drill, data-model §6.2)
  byEntity: Array<{ code: string; name: string; amount: Money; isNegative: boolean }>   // negative cash balance → info icon (NBAL)
  inTransitDetail: Array<{ coaId: Id; code: string; name: string; amount: Money; count: number; oldestAgeDays: number; overThreeDays: boolean }>
  reconciliation: { glInTransit: Money; registerUnsettled: Money; diff: Money; inSync: boolean }
}
```

- Umur dana = `diffDays(today, txDate)`; `> 3` hari → `overThreeDays: true` (ditandai ikon peringatan + kata "Lewat 3 hari").
- Rekonsiliasi: `inSync` = `|diff| < 1` (selisih di bawah Rp1 dianggap pembulatan).
- Keranjang `cash` + `bank` kosong → semua angka `0.00` + `Notice` "Atur akun Kas & Bank di Pemetaan Akun".

✅ Cek selesai:
- Test murni untuk penjumlahan & rekonsiliasi lulus (fixture kecil di `tests/fixtures/`).
- ⛔ IZIN USER: angka Cash Position DB `demo` per hari ini dicatat di `docs/progress.md` untuk dibandingkan di Fase 16.

## Langkah 9.4 — Revenue (§6.1)

📁 File: ➕ `src/lib/finance/revenue.ts`, ➕ `src/lib/finance/revenue.test.ts`, ➕ `src/server/services/revenue.service.ts`, ➕ `src/functions/metrics/revenue.fn.ts`

Rumus: `Revenue = − mutasi(grup('Revenue'))` = Σ (`credit − debet`) akun POSTABLE ber-`account_group = 'Revenue'`, per `period_id` (D18). **Tidak** termasuk Other Revenue.

> Contoh SQL di §6 memakai `trans_date`; untuk angka bulanan rencana ini memakai `period_id` sesuai D18 (README §9, K1).

Fungsi bantu (dipakai juga oleh P&L, Fixed Cost, Budget):

```ts
/** Composition folders of an account group: direct children of the smallest root covering every POSTABLE of that group. */
export function groupFolders(tree: CoaTree, group: AccountGroup): CoaNode[]
```

Aturan `groupFolders`:
1. Ambil semua POSTABLE ber-grup itu.
2. Untuk tiap akun, naik ke induk selama **semua** POSTABLE di bawah induk itu ber-grup sama. Node tertinggi yang dicapai = akar grup.
3. Bila hanya ada **satu** akar grup → folder = anak langsungnya. Bila lebih dari satu → folder = akar-akar itu.

Output `getRevenueFn`:

```ts
{
  meta: MetricMeta
  total: Money
  compareTotal: Money | null
  trend: Array<{ month: string; amount: Money }>      // 'YYYY-MM' per period in the chart range (see step 10.1)
  byFolder: Breakdown[]                               // folder → account
  byEntity: Array<{ code: string; name: string; amount: Money }>
}
```

✅ Cek selesai (test wajib):
- Fixture: Revenue kredit 1.000 + debit retur 100 → total `900.00`.
- Akun Other Revenue tidak ikut.
- `groupFolders` pada fixture CoA mengembalikan folder yang benar (mis. Retail & Grosir).

## Langkah 9.5 — Profit & Loss (§6.4)

📁 File: ➕ `src/lib/finance/pnl.ts`, ➕ `src/lib/finance/pnl.test.ts`, ➕ `src/server/services/pnl.service.ts`, ➕ `src/functions/metrics/pnl.fn.ts`

```
Revenue          = − mutasi(grup('Revenue'))
COGS             =   mutasi(grup('Cost Of Sales'))
Laba Kotor       = Revenue − COGS
OPEX             =   mutasi(grup('Expense'))
Laba Usaha       = Laba Kotor − OPEX                 (info: belum dikurangi depresiasi)
OtherRev         = − mutasi(grup('Other Revenue') − OCI)
OtherExp         =   mutasi(grup('Other Expense'))
Laba Bersih      = Laba Usaha + OtherRev − OtherExp
OCI              = − mutasi(akun OCI)
Total Laba Kompr = Laba Bersih + OCI
```

- Akun OCI = semua POSTABLE di subtree akun yang `code`-nya ada di `env.ociRootCodes` (default `['9']`, O4). Akun OCI **dikeluarkan dari semua baris lain** supaya tidak terhitung dua kali (README §9, K10).
- Bulanan per `period_id`; YTD = Σ bulan (D26). Jurnal posted saja.
- Tabel arsip mengikuti `periode.table_name` (G15).
- Margin (`÷ Revenue`) di samping Laba Kotor, Laba Usaha, Laba Bersih; Revenue = 0 → `null` ("—").

```ts
export type PnlLineKey = 'revenue' | 'cogs' | 'grossProfit' | 'opex' | 'operatingProfit'
  | 'otherRevenue' | 'otherExpense' | 'netProfit' | 'oci' | 'comprehensiveIncome'
export function buildPnl(input: { tree: CoaTree; movements: { coaId: Id; periodId: Id; debet: Money; credit: Money }[]; ociCoaIds: Set<Id> }): {
  lines: Array<{ key: PnlLineKey; amount: Money; margin: string | null; byPeriod: Record<Id, Money>; folders: Breakdown[] }>
}
```

Output `getPnlFn`: `{ meta, lines, compare: Record<PnlLineKey, Money> | null }`.

✅ Cek selesai (test wajib):
- Laba Bersih **tidak** memuat OCI; Total Laba Komprehensif = Laba Bersih + OCI.
- Revenue 0 → margin `null`.
- Fixture lengkap: Revenue 1.000, COGS 600, OPEX 200, OtherRev 50, OtherExp 30, OCI 20 → Laba Kotor 400, Laba Usaha 200, Laba Bersih 220, Total 240.

## Langkah 9.6 — Cash Flow (§6.3)

📁 File: ➕ `src/server/repo/cashflow.repo.ts`, ➕ `src/lib/finance/cashflow.ts`, ➕ `src/lib/finance/cashflow.test.ts`, ➕ `tests/fixtures/cashflow.fixture.ts`, ➕ `src/server/services/cash-flow.service.ts`, ➕ `src/functions/metrics/cash-flow.fn.ts`

**Kas & setara kas** = `basket('cash') ∪ basket('bank') ∪ basket('deposit')` (D27).

`cashflow.repo.ts`:

```sql
-- linesOfCashJournals(): all lines of posted journals that touch cash & cash equivalents in the selected periods
SELECT d.gl_id AS glId, g.journal_type AS journalType, g.period_id AS periodId,
       d.coa_id AS coaId, d.<segCol> AS segmentDetailId,
       SUM(d.debet) AS debet, SUM(d.credit) AS credit
FROM <gl> g
JOIN <gl_detail> d ON d.gl_id = g.gl_id
JOIN (
  SELECT DISTINCT d2.gl_id
  FROM <gl> g2
  JOIN <gl_detail> d2 ON d2.gl_id = g2.gl_id
  WHERE g2.posted_status = 1
    AND g2.canceled_date IS NULL
    AND g2.period_id IN (?, …)
    AND d2.coa_id IN (?, …)               -- cash & cash-equivalent accounts
    [AND d2.<segCol> IN (?, …)]
) k ON k.gl_id = g.gl_id
GROUP BY d.gl_id, g.journal_type, g.period_id, d.coa_id, d.<segCol>;

-- cashFlowSetup()
SELECT s.cash_flow_setup_id AS setupId, s.cash_flow_group_id AS groupId, grp.NAME AS groupName,
       grp.sequence AS groupSequence, s.sub_group AS subGroup, s.sequence_sub_group AS subSequence,
       s.coa_id AS coaId, s.value_displayed AS valueDisplayed,
       c.account_group AS accountGroup, c.sub_account_group AS subAccountGroup
FROM cash_flow_setup s
JOIN cash_flow_group grp ON grp.cash_flow_group_id = s.cash_flow_group_id
LEFT JOIN coa c ON c.coa_id = s.coa_id
ORDER BY grp.sequence, s.sequence_sub_group;
```

Logika murni `cashflow.ts`:

```ts
export type CfLine = { glId: Id; journalType: number; periodId: Id; coaId: Id; segmentDetailId: Id | null; debet: Money; credit: Money }

/** Step 1 (data-model §6.3): allocate cash proportionally. */
export function allocateCash(lines: CfLine[], isOurCash: (l: CfLine) => boolean): Array<{
  glId: Id; journalType: number; periodId: Id; counterCoaId: Id; portion: Money   // + inflow, − outflow
}>
```

Aturan `allocateCash` per `glId`:
1. `ourCash` = baris yang akunnya di kas & setara kas **dan** lokasinya terpilih (`isOurCash`).
2. `netKas = Σ (debet − credit)` baris `ourCash`. `netKas = 0` → jurnal diabaikan.
3. `lawan` = semua baris lain di jurnal itu (termasuk baris kas milik entitas yang **tidak** dipilih; lihat README §9, K11).
4. `lawan` kosong → transfer internal, diabaikan.
5. `porsi(lawan_i) = netKas × w_i ÷ Σ w`, dengan `w_i = |debet − credit|` baris lawan. Bila `Σ w = 0` → seluruh `netKas` ke baris lawan pertama.
6. Porsi dibulatkan 2 desimal; **selisih pembulatan** ditambahkan ke porsi dengan `w` terbesar supaya Σ porsi = `netKas` persis.

```ts
/** Step 2 (data-model §6.3): classification. */
export type CfSetupRow = { groupName: string; groupSequence: number; subGroup: string; subSequence: number;
  valueDisplayed: 0 | 1; accountGroup: string | null; subAccountGroup: string | null }
export function isSetupValid(setup: CfSetupRow[]): boolean     // valid when ≥ 1 row has an accountGroup (coa found)
export function classifyBySetup(portion: Money, counter: { accountGroup: string; subAccountGroup: string }, setup: CfSetupRow[]):
  { drawer: 'OPERATING' | 'INVESTING' | 'FUNDING'; subGroup: string } | 'UNCLASSIFIED'
export function classifyByFallback(portion: Money, counter: { accountGroup: string; subAccountGroup: string }, journalType: number):
  { drawer: 'OPERATING' | 'INVESTING' | 'FUNDING'; subGroup: string } | 'UNCLASSIFIED'
```

Aturan `classifyBySetup`:
1. Kandidat = sub-baris (`groupName` + `subGroup`) yang punya baris setup dengan pasangan (`accountGroup`, `subAccountGroup`) sama dengan akun lawan.
2. Sub-baris yang punya baris `valueDisplayed` 0 **dan** 1 → menerima porsi apa pun (neto).
3. Hanya `valueDisplayed = 1` → menerima bila porsi < 0 (uang keluar). Hanya `0` → menerima bila porsi > 0 (uang masuk).
4. Lebih dari satu kandidat menerima → pilih yang `groupSequence`, lalu `subSequence`, paling kecil.
5. Tidak ada yang menerima → `'UNCLASSIFIED'` (tampil "Belum terklasifikasi" di laci OPERATING).

Aturan `classifyByFallback` (hanya bila `isSetupValid = false`) = tabel aturan cadangan §6.3, dicek berurutan nomor 1 → 10, persis seperti di `data-model.md`.

Output `getCashFlowFn`:

```ts
{
  meta: MetricMeta
  source: 'setup' | 'fallback'                         // drives the "classification source: ERP setup / built-in rules" label
  openingCash: Money                                   // cash & equivalents balance on the day before d1 (data-model §4.5)
  drawers: Array<{ drawer: 'OPERATING' | 'INVESTING' | 'FUNDING'; total: Money;
                   rows: Array<{ subGroup: string; amount: Money; unclassified?: boolean }> }>
  netCashFlow: Money
  closingCash: Money                                   // openingCash + netCashFlow
  closingCashByBalance: Money                          // cash & equivalents balance at asOf from the balance engine
  identityOk: boolean                                  // closingCash == closingCashByBalance
  monthly: Array<{ month: string; cashIn: Money; cashOut: Money; net: Money }>   // for CashflowChart
  erpComparison: Array<{ drawer: string; dashboard: Money; erpMethod: Money; diff: Money }>
}
```

- `monthly.cashIn` = Σ `netKas` positif per periode; `cashOut` = Σ `netKas` negatif (transfer internal tidak dihitung).
- `erpComparison.erpMethod` = cara ERP: Σ seluruh baris lawan (tanpa proporsi) yang terpetakan per laci; yang tidak terpetakan diabaikan.
- `identityOk = false` → `Notice` danger dengan penjelasan (jurnal backdated / Periode 13 / filter entitas NBAL), lihat README §9, K12.

✅ Cek selesai (test wajib, `tests/fixtures/cashflow.fixture.ts`):
- **Kas awal + NetCashFlow = Kas akhir** pada fixture lengkap (T1, §8).
- Transfer Kas → Bank (semua baris di kas & setara kas) tidak dihitung.
- Jurnal campuran *Kas 100 + Piutang EDC 50 → Pendapatan 150*: porsi kas = 100 ke Pendapatan (bukan 150).
- Porsi dengan pembulatan (mis. `netKas = 100` dibagi 3 lawan sama besar) → Σ porsi tepat `100.00`.
- Akun lawan tak terpetakan → `'UNCLASSIFIED'`.
- Setup hanya `valueDisplayed = 1` untuk Fixed Assets → pembelian aset (porsi < 0) masuk "Pembelian Asset"; penjualan aset (porsi > 0) masuk sub-baris yang `valueDisplayed = 0`.
- Setup tidak valid → aturan cadangan dipakai; `journalType 14` → FUNDING.

## Langkah 9.7 — Expense Paid (§6.5)

📁 File: ➕ `src/server/repo/apar.repo.ts` (bagian Expense Paid), ➕ `src/lib/finance/expense-paid.ts`, ➕ `src/lib/finance/expense-paid.test.ts`, ➕ `src/server/services/expense-paid.service.ts`, ➕ `src/functions/metrics/expense-paid.fn.ts`

**(a) Pembayaran tagihan AP:**

```sql
-- expensePaidAllocated(d1, d2PlusOne, locIds)
SELECT p.ap_ar_card_id AS cardId, p.location_id AS locationId, i.owner_id AS vendorId,
       i.transaction_type AS itemType, SUM(d.amount) AS detailSum
FROM ap_ar_card p
JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
JOIN ap_ar_card i        ON i.ap_ar_card_id = d.invoice_id
WHERE p.module_type = 0
  AND p.transaction_type IN (9, 10, 14)
  AND p.in_out IN (-1, 1)
  AND p.transaction_date >= ?
  AND p.transaction_date < ?
  [AND p.location_id IN (?, …)]
GROUP BY p.ap_ar_card_id, p.location_id, i.owner_id, i.transaction_type;

-- expensePaidUnallocated(d1, d2PlusOne, locIds)
SELECT p.ap_ar_card_id AS cardId, p.location_id AS locationId, p.owner_id AS vendorId,
       p.amount * p.in_out AS signedAmount
FROM ap_ar_card p
LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
WHERE p.module_type = 0
  AND p.transaction_type IN (9, 10, 14)
  AND p.in_out IN (-1, 1)
  AND p.transaction_date >= ?
  AND p.transaction_date < ?
  [AND p.location_id IN (?, …)]
  AND d.ap_ar_card_detail_id IS NULL;
```

```
dibayar(a) = Σ (− detailSum) untuk itemType ∈ {0, 1, 2, 4, 5, 6, 12}    -- BUKAN type 3 (hutang aset)
           + Σ (− signedAmount) kartu tanpa detail                          -- "pembayaran belum dialokasikan", kategori tersendiri
```

- Kartu `in_out = +1` (retur melebihi tagihan) otomatis menjadi **pengurang** karena tandanya (lihat README §9, K13).
- Kartu type 7/8 **tidak** dihitung (bukan uang keluar). Voucher `bankpo_payment` **tidak** dipakai.

**(b) Pembayaran langsung tanpa tagihan:** pakai `allocateCash` (langkah 9.6) dengan kas = `basket('cash') ∪ basket('bank')` dan periode terpilih, lalu:

```
dibayar(b) = Σ (− porsi) untuk porsi < 0 yang akun lawannya ber-account_group ∈ {Cost Of Sales, Expense}
```

> `data-model.md` §6.5(b) menyebut juga `Other Expense` dengan pengecualian akun penyusutan/amortisasi/bunga/pajak, sedangkan `decisions.md` §5 menyebut "biaya operasional saja (COGS + OPEX)". Rencana ini memakai **COGS + Expense** (README §9, K14; O6).

Output `getExpensePaidFn`:

```ts
{ meta: MetricMeta; total: Money; apPayments: Money; unallocatedPayments: Money; directPayments: Money;
  byCategory: Breakdown[]   // "AP bill payments" → vendor; "unallocated payments" → vendor; expense folder → account
  byEntity: Array<{ code: string; name: string; amount: Money }> }
```

✅ Cek selesai (test wajib):
- Pembayaran tagihan aset (item type 3) tidak dihitung.
- Cicilan pokok pinjaman (journal_type 14, lawan Hutang Bank) tidak dihitung; bunga (Other Expense) tidak dihitung.
- Petty cash Beban → Kas Kecil dihitung.
- Kartu bayar tanpa detail Rp500 (`in_out = -1`) → menambah `unallocatedPayments` 500.

## Langkah 9.8 — Outstanding Liability & AP Aging (§6.6)

📁 File: ✏️ `src/server/repo/apar.repo.ts`, ➕ `src/lib/finance/apar.ts`, ➕ `src/lib/finance/apar.test.ts`, ➕ `src/lib/finance/aging.ts`, ➕ `src/lib/finance/aging.test.ts`, ➕ `tests/fixtures/apar.fixture.ts`, ➕ `src/server/services/ap-aging.service.ts`, ➕ `src/functions/metrics/ap-aging.fn.ts`

SQL bagian A dan B **persis** seperti `data-model.md` §6.6, dengan dua perubahan:

1. Alias & parameter ditulis dalam bahasa Inggris (G37): `tgl` → `txDate`, `saldo` → `balance` (termasuk `HAVING balance <> 0`), `:lokasi` → `:locationIds`; komentar SQL `-- Bagian A …` ditulis ulang dalam bahasa Inggris (`-- Part A — items …`).
2. Ditambah dua syarat kualitas data (G22) di `WHERE`:

```sql
  AND i.in_out IN (-1, 1)                 -- part A (skip in_out = 0 and NULL)
  AND p.in_out IN (-1, 1)                 -- part B
```

- `:asOf_plus_1_day` = `addDays(asOf, 1)`; `:locationIds` = `locationIds` (bila `'all'`, baris `AND i.location_id IN (…)` / `AND p.location_id IN (…)` dihapus).
- Ambil juga nama vendor:

```sql
SELECT v.vendor_id AS vendorId, v.code, v.name
FROM vendor v
WHERE v.vendor_id IN (?, …);
```

  Vendor tidak ada di master → label "(Vendor tidak dikenal)" (Q7). Lokasi tidak ada di `pos_location` → "(Lokasi tidak dikenal)" (Q8).

Status rencana bayar (D22), untuk item bagian A dengan saldo > 0:

```sql
SELECT bd.invoice_id AS invoiceId, b.status AS status
FROM bankpo_payment_detail bd
JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
WHERE b.type = 0
  AND bd.invoice_id IN (?, …);           -- split into chunks of 1,000 IDs
```

```ts
export type PlanStatus = 'notSubmitted' | 'submitted' | 'approved'   // not submitted · submitted · approved, awaiting payment
/** Priority: any 'Posted' or 'Partialy Paid' voucher → approved; else any 'Not Posted' → submitted; else → notSubmitted. */
export function planStatus(voucherStatuses: string[]): PlanStatus
```

> Ejaan `'Partialy Paid'` (satu huruf l) sesuai data ERP. Voucher `'Paid'` tidak mengubah status (README §9, K15).

Bucket umur (`aging.ts`, §6.6, tanggal saja tanpa jam):

```ts
export type AgingBucket = 'overdue0_30' | 'overdue31_60' | 'overdue61_90' | 'overdue90plus'
  | 'due1_30' | 'due31_60' | 'due61_90' | 'due90plus'
export function bucketOf(asOf: IsoDate, dueDate: IsoDate): AgingBucket   // days = diffDays(asOf, dueDate)
```

| Selisih (`asOf − due_date`) | Bucket |
|---|---|
| 0 … 30 | `overdue0_30` (jatuh tempo hari ini termasuk) |
| 31 … 60 | `overdue31_60` |
| 61 … 90 | `overdue61_90` |
| > 90 | `overdue90plus` |
| −30 … −1 | `due1_30` |
| −60 … −31 | `due31_60` |
| −90 … −61 | `due61_90` |
| < −90 | `due90plus` |

- `due_date` NULL → pakai tanggal transaksi (`txDate`) sebagai jatuh tempo (README §9, K16).

Angka yang ditampilkan:

```
Outstanding (angka utama)        = Σ saldo (A + B)      ← NETO
  ├ Tagihan belum lunas          = Σ saldo A yang > 0
  ├ Kredit vendor                = Σ saldo A yang < 0
  └ Pembayaran belum dialokasikan = Σ saldo B
```

Rekonsiliasi (info): saldo GL akun kontrol AP (`DISTINCT ap_ar_card.coa_id` dari item bagian A) pada `asOf` memakai mesin saldo (langkah 9.2) vs Σ saldo AP. Selisih ≥ Rp1 → `Notice` "Subledger & GL tidak sinkron".

Output `getApAgingFn`:

```ts
{
  meta: MetricMeta
  total: Money; unpaidBills: Money; vendorCredits: Money; unallocatedPayments: Money
  compareTotal: Money | null                           // total at compare.asOf
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money                               // "to date" subtotal = Σ of the 4 overdue buckets
  byVendor: Array<{ vendorId: Id; code: string; name: string; total: Money; buckets: Record<AgingBucket, Money> }>
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
  reconciliation: { gl: Money; subledger: Money; diff: Money; inSync: boolean }
}
```

Rincian per kartu (vendor → kartu) **tidak** dikirim di sini; diambil saat drill-down (Fase 11).

✅ Cek selesai (test wajib):
- `apar.test.ts`: `Σ detail = kartu.amount × in_out`; tagihan 100 + retur 20 dibayar sekaligus 80 → sisa 0 dan 0; pembayaran bertanggal setelah `asOf` tidak mengurangi sisa; `in_out = 0` diabaikan; tagihan ber-`payment_status = 2` di voucher `Posted` yang belum dibayar **tetap** dihitung utang dan ber-status `approved`; pembayaran yang ada di `ap_ar_card_detail` **dan** `bankpo_payment_detail` tidak dihitung dua kali.
- `aging.test.ts`: batas tepat di selisih 0, 30, 31, 60, 61, 90, 91, −1, −30, −31, −90, −91.
- `asOf` lampau tidak memakai `payment_status` (fixture: `payment_status = 2` tetapi pembayaran setelah `asOf` → tetap utang).

## Langkah 9.9 — AR Aging (§6.7)

📁 File: ✏️ `src/server/repo/apar.repo.ts`, ➕ `src/server/services/ar-aging.service.ts`, ➕ `src/functions/metrics/ar-aging.fn.ts`

Sama dengan langkah 9.8 dengan pengganti (§6.7):
- Bagian A: `i.module_type = 1 AND i.transaction_type IN (0, 3, 4, 5)`; kartu pelunasan `p.module_type = 1 AND p.transaction_type IN (1, 2)`.
- Bagian B: `p.module_type = 1 AND p.transaction_type = 2` tanpa detail (retur belum dialokasikan).
- Pembayaran pelanggan (type 1) tanpa detail **tidak** dihitung; jumlah & nilainya dikirim ke panel "Data perlu dicek" (Fase 13):

```sql
SELECT COUNT(*) AS n, COALESCE(SUM(p.amount * p.in_out), 0) AS amount
FROM ap_ar_card p
LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
WHERE p.module_type = 1 AND p.transaction_type = 1 AND p.in_out IN (-1, 1)
  AND p.transaction_date < ?             -- asOf + 1 day
  [AND p.location_id IN (?, …)]
  AND d.ap_ar_card_detail_id IS NULL;
```

- Nama dari `customer` (`customer_id`, `code`, `name` saja, G28). Tidak ada status voucher.
- Breakdown tambahan: **piutang non-dagang (type 3)** sebagai kategori sendiri.

Output `getArAgingFn`: sama bentuknya dengan AP, dengan `unpaidInvoices`, `customerCredits`, `unallocatedReturns`, `byCustomer`, `nonTrade: Money`.

✅ Cek selesai (test wajib): retur type 2 **dengan** detail memotong tagihan; retur **tanpa** detail masuk bagian B; pembayaran type 1 tanpa detail tidak mengubah total.

## Langkah 9.10 — Monthly Fixed Cost (§6.8)

📁 File: ➕ `src/lib/finance/fixed-cost.ts`, ➕ `src/lib/finance/fixed-cost.test.ts`, ➕ `src/server/services/fixed-cost.service.ts`, ➕ `src/functions/metrics/fixed-cost.fn.ts`

```
FixedCost(bulan)    = mutasi(basket('fixedCost'))                       -- bertanda sisi grup
VariableCost(bulan) = mutasi(grup('Expense') − basket('fixedCost'))
```

Output: `{ meta, months: Array<{ month: string; fixed: Money; variable: Money }>, averageFixed: Money, byFolder: Breakdown[], basketEmpty: boolean }`.

- `basketEmpty` → halaman menampilkan `EmptyState` "Atur akun Biaya Tetap di Pemetaan Akun" + tombol ke `/settings/account-mapping`.

✅ Cek selesai (test wajib): akun Expense yang ada di keranjang tidak ikut Variable; rata-rata dihitung dari bulan dalam rentang.

## Langkah 9.11 — Daily Payment Plan (§6.9)

📁 File: ➕ `src/lib/finance/payment-plan.ts`, ➕ `src/lib/finance/payment-plan.test.ts`, ➕ `src/server/services/payment-plan.service.ts`, ➕ `src/functions/metrics/payment-plan.fn.ts`

Input server function: `metricInputSchema.extend(paymentPlanSearchSchema.shape)` (`entity`, `horizon`, `inflow`; `preset` diabaikan).

```
hari ke-0          = hari ini (today)
SaldoAwal(0)       = CashPosition(today)                       (langkah 9.3 dengan asOf = today)
Overdue            = Σ saldo AP bagian A dengan due_date < today  → dibebankan di hari ke-0, baris paling atas
untuk h = 0 … horizon − 1 (tanggal = addDays(today, h)):
  Keluar(h) = Σ saldo AP bagian A dengan due_date = tanggal(h)   (+ Overdue bila h = 0)
  Masuk(h)  = 0
  bila inflow = true:
    Masuk(h) = Σ saldo AR bagian A dengan due_date = tanggal(h)
             + Σ bank_payment belum cair dengan estimasiCair = tanggal(h)
  SaldoAkhir(h)   = SaldoAwal(h) + Masuk(h) − Keluar(h)
  SaldoAwal(h+1)  = SaldoAkhir(h)
  SaldoAkhir(h) < 0 → isNegative = true
```

- `estimatedSettlementDate = max(addDays(txDate, lag(coaId)), addDays(today, 1))`; `lag = ceil(avgLag)` dari `settlementLag` (langkah 9.3); tidak ada data → `1`.
- Saldo AP/AR memakai fungsi yang sama dengan langkah 9.8/9.9 dengan `asOf = today`.
- Per hari: ringkasan status rencana bayar `{ approved: Money; submitted: Money; notSubmitted: Money }`.

Output: `{ meta, openingBalance: Money, overdue: Money, days: Array<{ date: IsoDate; opening: Money; inflow: Money; outflow: Money; closing: Money; isNegative: boolean; status: { approved: Money; submitted: Money; notSubmitted: Money } }> }`.

✅ Cek selesai (test wajib): overdue dibebankan di hari ke-0; toggle `inflow` mengubah Masuk; saldo negatif ditandai; estimasi cair tidak pernah hari ini atau sebelumnya.

## Langkah 9.12 — Budget vs Actual (§6.10)

📁 File: ➕ `src/server/repo/budget.repo.ts`, ➕ `src/lib/finance/budget.ts`, ➕ `src/lib/finance/budget.test.ts`, ➕ `src/server/services/budget.service.ts`, ➕ `src/functions/metrics/budget.fn.ts`

```sql
-- budgetAmounts(budgetType, yearMonths, segIds)   yearMonths = [{ year, month0 }] where month0 = month − 1 (G23)
SELECT b.coa_id AS coaId, b.bgt_year AS bgtYear, b.bgt_month AS bgtMonth, SUM(b.amount) AS amount
FROM coa_budget b
JOIN coa c ON c.coa_id = b.coa_id                  -- coa_ids missing from coa are dropped automatically (data-model §6.10)
WHERE b.budget_type = ?
  AND ( (b.bgt_year = ? AND b.bgt_month IN (?, …)) [OR (b.bgt_year = ? AND b.bgt_month IN (?, …))] )
  [AND b.segment1_id IN (?, …)]
GROUP BY b.coa_id, b.bgt_year, b.bgt_month;
```

- `budget_type = 1` → Budget vs Actual. `budget_type = 2` → "Target Operasional" (Revenue saja), ditampilkan terpisah, tidak dicampur.
- Actual = P&L bulanan per akun (langkah 9.5, posted, per `period_id`).
- HEADER = Σ POSTABLE di bawahnya. YTD = Σ bulan 0 … (bulan − 1).
- `Variance = Actual − Budget`; `Variance % = Variance ÷ Budget` (Budget 0 → `null`).
- Warna: grup Revenue & Other Revenue → Actual > Budget = baik; Cost Of Sales, Expense, Other Expense → Actual > Budget = buruk. Dikirim sebagai `higherIsBetter: boolean` per baris; UI memakai `DeltaPill`.

✅ Cek selesai (test wajib): Oktober → `bgt_month = 9`; YTD Oktober → bulan 0…9; Budget 0 → `null`; arah warna Revenue vs Beban benar.

## Langkah 9.13 — Cash Runway & Rasio (§6.11)

📁 File: ➕ `src/lib/finance/runway.ts`, ➕ `src/lib/finance/runway.test.ts`, ➕ `src/server/services/runway.service.ts`, ➕ `src/functions/metrics/runway.fn.ts`

```
NetBurn(bulan) = NetCashFlow(bulan)                      (langkah 9.6, per bulan)
AvgBurn        = rata-rata NetBurn 3 bulan penuh terakhir (bulan yang berakhir sebelum bulan asOf)
Runway         = AvgBurn < 0 ? CashPosition(asOf) ÷ |AvgBurn| (bulan, 1 desimal) : "Arus kas positif"
GrossMargin    = Laba Kotor ÷ Revenue                   (rentang terpilih)
NetMargin      = Laba Bersih ÷ Revenue
CurrentRatio   = saldo(grup('Liquid Assets'), asOf) ÷ saldo(grup('Current Liabilities'), asOf)
```

- Pembagi 0 → `null` ("—").
- Current Ratio diberi info: "Termasuk hutang bank jangka panjang yang tercatat di Current Liabilities" (§6.11).

Output: `{ meta, runwayMonths: string | null, cashFlowPositive: boolean, avgBurn: Money, grossMargin: string | null, netMargin: string | null, currentRatio: string | null }`.

✅ Cek selesai (test wajib): net burn positif → `cashFlowPositive = true`, `runwayMonths = null`; AvgBurn −100 dan kas 1.000 → `runwayMonths '10.0'`.

## Langkah 9.14 — Ringkasan & queryOptions

📁 File: ➕ `src/server/services/summary.service.ts`, ➕ `src/functions/metrics/summary.fn.ts`, ➕ `src/queries/metrics.queries.ts`

- `getSummaryFn` memanggil service (bukan server function) secara paralel dengan `Promise.all`: cash position, revenue, P&L, AP aging (total saja), cash flow (bulanan), runway, payment plan 7 hari (hanya daftar tagihan jatuh tempo).
- `metrics.queries.ts`: satu `queryOptions` per server function metrik, kunci `qk.metric('<nama>', input)`. Nama: `summary`, `revenue`, `cashPosition`, `cashFlow`, `pnl`, `expensePaid`, `apAging`, `arAging`, `fixedCost`, `paymentPlan`, `budget`, `runway`.

✅ Cek selesai:
- `npm test` lulus (semua test Fase 4–9).
- `npm run typecheck` lulus.

## Langkah 9.15 — Test integrasi metrik ⛔ IZIN USER

📁 File: ➕ `tests/integration/metrics.int.test.ts`, ➕ `tests/integration/mysql57-compat.int.test.ts`

- `metrics.int.test.ts`: memanggil setiap service ke DB lokal dengan filter tetap (`entity: 'all'`, preset `last-month`). Sebelum Fase 15, test hanya memastikan: tidak error, semua uang berupa string angka, identitas Cash Flow `identityOk = true` (bila gagal, catat jurnal penyebabnya di `docs/progress.md`). Setelah Fase 15, test membandingkan dengan angka yang diharapkan dari seed (T2).
- `mysql57-compat.int.test.ts`: hanya berjalan bila env `MYSQL57_URL` ada (DB MySQL 5.7.44 lokal, mis. container Docker — ⛔ IZIN USER untuk membuatnya). Menjalankan setiap query repo dengan parameter contoh dan memastikan tidak ada error sintaks (§9.2.1 baris "Pengujian").

✅ Cek selesai: `npm run test:db -- metrics` lulus.
