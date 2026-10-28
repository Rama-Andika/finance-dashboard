# Fase 8 – Pohon CoA, keranjang, Settings

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [07_phase-filter-global.md](./07_phase-filter-global.md) · Berikutnya: [09_phase-metrik-repo-server-function.md](./09_phase-metrik-repo-server-function.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (07_phase-filter-global.md) sudah lulus "✅ Cek selesai".

---

## Langkah 8.1 — Repository CoA

📁 File: ➕ `src/server/repo/coa.repo.ts`

```sql
SELECT coa_id AS coaId, acc_ref_id AS parentId, code, name, status, level,
       account_group AS accountGroup, sub_account_group AS subAccountGroup, saldo_normal AS saldoNormal
FROM coa
ORDER BY code, coa_id;
```

✅ Cek selesai: `npm run typecheck` lulus.

## Langkah 8.2 — Pembangun pohon CoA

📁 File: ➕ `src/lib/finance/coa-tree.ts`, ➕ `src/lib/finance/coa-tree.test.ts`, ➕ `tests/fixtures/coa.fixture.ts`

```ts
export type CoaRow = { coaId: Id; parentId: Id; code: string; name: string; status: 'HEADER' | 'POSTABLE';
  level: number; accountGroup: AccountGroup; subAccountGroup: string; saldoNormal: 'DEBET' | 'CREDIT' }

export type CoaNode = Omit<CoaRow, 'parentId'> & { parentId: Id | null; children: CoaNode[]; isOrphan?: boolean; isCycle?: boolean }

export type CoaTree = { roots: CoaNode[]; byId: Map<Id, CoaNode>; orphanFolderId: '__orphans__' }

export function buildCoaTree(rows: CoaRow[]): CoaTree
export function postableDescendants(tree: CoaTree, coaId: Id): Id[]   // includes itself when POSTABLE
export function ancestorsOf(tree: CoaTree, coaId: Id): Id[]
```

Aturan (§4.3):
1. Induk = `parentId`; `'0'` = akar. **Jangan** memakai pola kode untuk struktur.
2. Anak diurutkan berdasarkan `code` (perbandingan string biasa), lalu `coaId`.
3. `parentId` menunjuk akun yang tidak ada → node masuk folder virtual `__orphans__` (nama i18n `coa.orphanFolder`, "Akun tanpa induk"), `isOrphan: true`.
4. Siklus (A → B → A): putus di node pertama yang ditemukan berulang, tandai `isCycle: true`, pindahkan ke folder `__orphans__`.
5. Folder `__orphans__` hanya dibuat bila ada isinya; letaknya paling bawah.

✅ Cek selesai (test wajib, fixture dibuat sendiri dengan ID 18 digit sebagai string):
- Struktur dari `parentId` benar (akar = HEADER yang `parentId = '0'`).
- Folder Bank langsung di bawah "1 Harta" tanpa folder "112" tetap benar (kode tidak dipakai untuk struktur).
- Orphan masuk `__orphans__`; siklus terdeteksi dan tidak membuat infinite loop.
- Urutan anak per kode.
- `postableDescendants(HEADER)` mengembalikan semua POSTABLE di bawahnya, termasuk akun yang ditambahkan ke fixture belakangan.
- ID `'504404509311573860'` tetap utuh (dibandingkan sebagai string).

## Langkah 8.3 — Tanda saldo per grup

📁 File: ➕ `src/lib/finance/sign.ts`, ➕ `src/lib/finance/sign.test.ts`

```ts
export const DEBIT_SIDE_GROUPS: readonly AccountGroup[] =
  ['Liquid Assets', 'Fixed Assets', 'Other Assets', 'Cost Of Sales', 'Expense', 'Other Expense']

export function accountSide(group: AccountGroup): 'debit' | 'credit'
/** Amount signed by the account group's natural side (G17). */
export function signedAmount(group: AccountGroup, debet: Money, credit: Money): Money
```

✅ Cek selesai (test wajib):
- `signedAmount('Revenue', '0', '100')` → `'100.00'`; `signedAmount('Expense', '100', '0')` → `'100.00'`.
- Akun lawan: Akumulasi Penyusutan di grup `Fixed Assets` dengan kredit 50 → `'-50.00'` (mengurangi total grup), walau `saldoNormal = 'DEBET'`.
- Cadangan Piutang di grup `Liquid Assets` dengan kredit 30 → `'-30.00'`.

## Langkah 8.4 — Resolver keranjang & toggle pohon

📁 File: ➕ `src/lib/finance/basket-resolver.ts`, ➕ `src/lib/finance/basket-resolver.test.ts`

```ts
export type AccountMapping = { version: 1; updatedAt: string; baskets: Record<BasketKey, { include: Id[] }> }
export type ResolvedBaskets = Record<BasketKey, Id[]> & { missing: Id[] }

/** data-model §5.3: HEADER → all POSTABLE descendants; POSTABLE → itself; dedupe; unknown ID → missing. */
export function resolveBaskets(mapping: AccountMapping, tree: CoaTree): ResolvedBaskets

/** Checkbox state of a node for the UI: 'checked' (☑), 'partial' (◐), 'unchecked'. */
export function checkState(include: Id[], tree: CoaTree, coaId: Id): 'checked' | 'partial' | 'unchecked'

/** Checkbox click. Returns the new, normalized include list. */
export function toggleNode(include: Id[], tree: CoaTree, coaId: Id): Id[]
```

Aturan `toggleNode`:
- Mencentang node yang belum tercentang penuh → tambahkan `coaId` node itu; hapus semua keturunannya dari `include` (sudah tercakup).
- Melepas node yang tercentang penuh karena dirinya ada di `include` → hapus `coaId` itu.
- Melepas node yang tercentang penuh karena leluhurnya ada di `include` → ganti leluhur itu dengan anak-anak langsungnya (secara berulang sampai node yang dilepas), lalu buang node yang dilepas. Akibatnya, akun baru di bawah leluhur itu **tidak lagi** ikut otomatis (sesuai UI ◐, §5.3).
- Hasil diurutkan dan tanpa duplikat.

✅ Cek selesai (test wajib):
- HEADER di `include` → semua POSTABLE keturunan ter-resolve, termasuk akun baru.
- ID yang tidak ada di pohon → masuk `missing`, tidak error.
- `toggleNode` mencentang HEADER yang beberapa anaknya sudah tercentang → `include` hanya berisi HEADER.
- Melepas satu anak dari HEADER tercentang → `include` berisi saudara-saudaranya, dan `checkState(HEADER)` = `'partial'`.

## Langkah 8.5 — Skema & validasi Settings, ID baris `system_main`

📁 File: ➕ `src/lib/settings/mapping-schema.ts`, ➕ `src/lib/settings/mapping-schema.test.ts`, ➕ `src/lib/settings/mapping-validate.ts`, ➕ `src/lib/settings/mapping-validate.test.ts`, ➕ `src/server/oid.ts`, ➕ `src/server/oid.test.ts`

`mapping-schema.ts`:

```ts
const idList = z.array(z.string().regex(/^\d{1,20}$/)).max(1000)
export const mappingSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  baskets: z.object({
    cash: z.object({ include: idList }),
    bank: z.object({ include: idList }),
    deposit: z.object({ include: idList }),
    inTransit: z.object({ include: idList }),
    fixedCost: z.object({ include: idList }),
  }),
})

/** Parse valueprop. Broken/invalid JSON → null (caller falls back to defaults + warning, data-model §5.4). */
export function parseMapping(valueprop: string | null): AccountMapping | null

/** New-client default (S7): every POSTABLE with sub_account_group 'Cash' in the cash basket; others empty. */
export function defaultMapping(tree: CoaTree, nowIso: string): AccountMapping
```

`mapping-validate.ts`:

```ts
export type MappingIssue =
  | { kind: 'conflict'; coaId: Id; baskets: BasketKey[] }   // same account in >1 of cash/bank/deposit/inTransit → BLOCKS saving
  | { kind: 'cashBankEmpty' }                               // warning: Cash Position = 0
  | { kind: 'missing'; coaId: Id }                          // warning: "deleted account", ignored in calculations
export function validateMapping(mapping: AccountMapping, tree: CoaTree): { blocking: MappingIssue[]; warnings: MappingIssue[] }
```

- Bentrok dicek **setelah resolve** (HEADER di Kas yang anaknya juga di Bank = bentrok). `fixedCost` tidak ikut cek bentrok.

`src/server/oid.ts` (meniru `OIDGenerator.generateOID()` ERP, dipakai hanya bila baris Settings belum ada):

```ts
/** ERP OID = (epochMs + 0x0100000000000000 × appIdx) followed by one random digit 0–8. */
export function generateErpOid(appIdx: number, nowMs: number, randomDigit: number): string {
  const base = BigInt(nowMs) + 0x0100000000000000n * BigInt(appIdx)
  return `${base.toString()}${randomDigit}`
}
```

- `appIdx` dari env `ERP_APP_ID_INDEX` (default 7, sama dengan default ERP untuk aplikasi Fin & Inv). Lihat README §9, K4.
- Bila langkah 5.2 mencatat `sysmain_id` ber-`auto_increment`, OID tetap dibuat (MySQL menerima nilai eksplisit).

✅ Cek selesai (test wajib):
- `parseMapping('{rusak')` → `null`; `parseMapping(JSON.stringify(validMapping))` → objek sama.
- `defaultMapping` mencentang akun `subAccountGroup = 'Cash'` saja.
- Bentrok Kas vs Bank terdeteksi sebagai `blocking`; keranjang kas+bank kosong → `warnings` berisi `cashBankEmpty`.
- `generateErpOid(7, 1700000000000, 3)` → `'5044048582654955523'` (= `(1700000000000n + 7n * 0x0100000000000000n).toString() + '3'`), string 19 digit tanpa kehilangan presisi.

## Langkah 8.6 — Repository & server function Settings

📁 File: ➕ `src/server/repo/settings.repo.ts`, ➕ `src/functions/settings.fn.ts`, ➕ `src/queries/settings.queries.ts`

`settings.repo.ts`:

```sql
-- getMappingRow()
SELECT sysmain_id AS sysmainId, valueprop
FROM system_main
WHERE name = 'DASHBOARD_ACCOUNT_MAPPING'
LIMIT 1;

-- upsertMapping(sysmainId, json)   (G3, G9; convention O7)
INSERT INTO system_main (sysmain_id, name, valueprop, valtype, distype, groupprop, note, company_id, active)
VALUES (?, 'DASHBOARD_ACCOUNT_MAPPING', ?, 'STRING', '', 'Application', 'Finance Dashboard account mapping', 0, 1)
ON DUPLICATE KEY UPDATE valueprop = VALUES(valueprop);
```

- `sysmainId`: pakai `sysmainId` baris lama bila ada; bila belum ada → `generateErpOid(env.ERP_APP_ID_INDEX, Date.now(), randomInt(0, 9))` (`randomInt` dari `node:crypto`, batas atas eksklusif → digit 0–8).
- Ini **satu-satunya** query tulis di seluruh aplikasi (G9).

`settings.fn.ts`:

| Server function | Method | Input | Output |
|---|---|---|---|
| `getAccountMappingFn` | GET | — | `{ mapping: AccountMapping; isDefault: boolean; corrupted: boolean; issues: { blocking; warnings } }` |
| `saveAccountMappingFn` | POST | `mappingSchema` | `{ ok: true; mapping }` atau `{ ok: false; blocking: MappingIssue[] }` |
| `getCoaTreeFn` | GET | `metricInputSchema` | `{ nodes: Array<{ coaId; parentId; code; name; status; accountGroup; subAccountGroup; isOrphan?; isCycle? }>; balances: Record<Id, Money> }` (`balances` kosong `{}` sampai Fase 9 langkah 9.2) |

- `isDefault = true` bila baris belum ada; `corrupted = true` bila `parseMapping` mengembalikan `null` (lalu pakai default).
- `saveAccountMappingFn`: validasi Zod → `validateMapping` → bila ada `blocking`, **jangan** simpan → simpan dengan `updatedAt` = waktu server ISO → kosongkan cache `src/server/cache.ts` yang bergantung pada keranjang.

✅ Cek selesai: `npm run typecheck` lulus; `sql-guard.test.ts` lulus.

## Langkah 8.7 — Halaman Pemetaan Akun

📁 File: ✏️ `src/routes/_authed/settings/account-mapping.tsx`, ➕ `src/components/settings/CoaTreePicker.tsx`, ➕ `src/components/settings/BasketPreview.tsx`

Isi halaman:
1. `Notice` warning "Selesaikan pengaturan akun" bila `isDefault`; `Notice` danger bila `corrupted` ("Pengaturan tersimpan rusak, sementara memakai default").
2. `Tabs` berisi 5 keranjang (S2): Kas, Bank, Deposito, Dana dalam pencairan, Biaya Tetap.
3. `CoaTreePicker`: pohon dengan expand/collapse, kolom cari (kode/nama), checkbox tiga keadaan (☑ / ◐ / ☐ dari `checkState`), kode akun dengan font mono. Keterangan kecil di node ◐: "Akun baru di folder ini tidak ikut otomatis". Pohon besar (±630 akun) dirender dengan TanStack Virtual.
4. Daftar bentrok (`blocking`) dan peringatan (`warnings`) di atas tombol Simpan. Tombol "Simpan pemetaan" (primary) nonaktif bila ada `blocking`.
5. `BasketPreview`: daftar akun hasil resolve untuk tab aktif (kode, nama) + saldo per hari ini (kolom saldo tampil "—" sampai Fase 9 langkah 9.2).
6. Setelah simpan berhasil: `queryClient.invalidateQueries({ queryKey: ['metric'] })`, `queryClient.invalidateQueries({ queryKey: ['settings'] })`, lalu `router.invalidate()`.

✅ Cek selesai:
- ⛔ IZIN USER (menulis ke `system_main` DB **lokal**; user DB di `.env` perlu hak `INSERT, UPDATE` pada `system_main`): centang HEADER Kas → simpan → reload → centang tetap ada; isi `valueprop` di DB lokal sama dengan format §5.2.
- Membuat bentrok Kas/Bank → tombol Simpan nonaktif dan daftar bentrok tampil.

## Langkah 8.8 — Test integrasi Settings ⛔ IZIN USER

📁 File: ➕ `tests/integration/settings.int.test.ts`

- `valueprop` diisi JSON rusak (di DB **lokal**) → logika `getAccountMappingFn` (dipanggil langsung lewat `settings.repo.ts` + `parseMapping`, tanpa HTTP/session) menghasilkan default + `corrupted: true`.
- Simpan → baca ulang → objek identik, ID 18 digit utuh.
- Kembalikan `valueprop` ke kondisi awal di akhir test.

✅ Cek selesai: `npm run test:db -- settings` lulus.
