# Fase 7 – Filter global

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [06_phase-auth.md](./06_phase-auth.md) · Berikutnya: [08_phase-coa-keranjang-settings.md](./08_phase-coa-keranjang-settings.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (06_phase-auth.md) sudah lulus "✅ Cek selesai".

---

## Langkah 7.1 — Skema search params

📁 File: ➕ `src/lib/filters/search-schema.ts`, ➕ `src/lib/filters/search-schema.test.ts`

```ts
import { z } from 'zod'

export const PRESETS = ['this-month', 'last-month', 'this-quarter', 'ytd', 'last-12m'] as const   // F3
export const HORIZONS = ['7', '14', '30'] as const                                                 // F4
export type Preset = (typeof PRESETS)[number]

export const globalSearchSchema = z.object({
  entity: z.string().regex(/^[A-Za-z0-9_.~,-]{1,2000}$/).catch('all'),   // 'all' or a comma-separated list of codes (F1)
  preset: z.enum(PRESETS).catch('this-month'),
  p13: z.boolean().catch(false),                                          // "Include period 13" toggle
})
export type GlobalSearch = z.infer<typeof globalSearchSchema>

export const metricInputSchema = globalSearchSchema
export type MetricInput = GlobalSearch

export const paymentPlanSearchSchema = z.object({
  horizon: z.enum(HORIZONS).catch('7'),
  inflow: z.boolean().catch(false),          // "Include projected inflows" toggle
})

export const drillStepSchema = z.object({
  kind: z.enum(['section', 'folder', 'account', 'entity', 'vendor', 'customer', 'bucket', 'day', 'channel', 'date', 'subrow', 'card']),
  id: z.string().max(200),
  label: z.string().max(200),
})
export const drillSchema = z.object({
  metric: z.string().max(40),
  steps: z.array(drillStepSchema).max(8),
})
export const drillSearchSchema = z.object({ drill: drillSchema.optional().catch(undefined) })
```

✏️ `src/routes/_authed.tsx`: tambahkan `validateSearch: globalSearchSchema` dan
`search: { middlewares: [retainSearchParams(['entity', 'preset', 'p13'])] }` (impor `retainSearchParams` dari `@tanstack/react-router`) supaya filter terbawa saat pindah halaman.

✅ Cek selesai (test wajib):
- `{}` → `{ entity: 'all', preset: 'this-month', p13: false }`.
- `{ preset: 'kemarin' }` → preset kembali `'this-month'`.
- `{ entity: "A01,B02" }` lolos; `{ entity: "x' OR 1=1" }` → `'all'`.

## Langkah 7.2 — Resolusi periode

📁 File: ➕ `src/lib/finance/periods.ts`, ➕ `src/lib/finance/periods.test.ts`, ➕ `tests/fixtures/periods.fixture.ts`

```ts
export type ResolvedPeriod = Pick<ResolvedFilter, 'd1' | 'asOf' | 'periodIds' | 'compare' | 'today'> & {
  months: string[]             // 'YYYY-MM' months in range
  missingMonths: string[]      // months without a type-0 period row
  hasOpenPeriod: boolean       // range contains an Open/Pre Closed period
}
export function resolvePeriod(preset: Preset, includeP13: boolean, today: IsoDate, periods: Period[]): ResolvedPeriod
```

Aturan (F2: tahun buku Jan–Des; §1.2: `asOf` tidak melewati hari ini):

| Preset | Bulan | `d1` | `asOf` | Pembanding (`compare`) |
|---|---|---|---|---|
| `this-month` | bulan hari ini | tgl 1 bulan ini | hari ini | bulan lalu penuh |
| `last-month` | bulan lalu | tgl 1 bulan lalu | akhir bulan lalu | bulan sebelumnya penuh |
| `this-quarter` | bulan-bulan kuartal ini s.d. bulan ini | awal kuartal | hari ini | kuartal sebelumnya penuh |
| `ytd` | Jan s.d. bulan ini | 1 Jan tahun ini | hari ini | Jan s.d. bulan yang sama tahun lalu |
| `last-12m` | 11 bulan lalu s.d. bulan ini | tgl 1 bulan (hari ini − 11 bulan) | hari ini | 12 bulan sebelum itu |

- `periodIds` = `periode_id` bertipe `0` yang `start_date`-nya jatuh di salah satu bulan dalam rentang.
- Periode tipe `1` (Periode 13) ikut **hanya bila** `includeP13 = true`, preset `ytd` atau `last-12m`, dan `end_date` ∈ [`d1`, `asOf`].
- Periode tipe `2` dan `3` tidak pernah ikut (lihat README §9, K7).
- Pembanding dihitung dengan aturan yang sama untuk rentangnya; `compare.asOf` = akhir rentang pembanding.

✅ Cek selesai (test wajib, `today = '2026-10-28'`):
- `this-month` → `d1 '2026-10-01'`, `asOf '2026-10-28'`, 1 periode; compare `2026-09-01`…`2026-09-30`.
- `last-month` → `2026-09-01`…`2026-09-30`.
- `this-quarter` → `2026-10-01`…`2026-10-28` (kuartal 4).
- `ytd` → 10 periode; dengan `includeP13` tetap 10 (Periode 13 tahun 2026 berakhir Desember, di luar rentang).
- `last-12m` → `2025-11-01`…`2026-10-28`, 12 periode; dengan `includeP13` dan fixture Periode 13 tahun 2025 (end `2025-12-31`) → 13 periode.
- Bulan tanpa baris periode muncul di `missingMonths`.

## Langkah 7.3 — Entitas & periode dari DB

📁 File: ➕ `src/server/repo/entities.repo.ts`, ➕ `src/server/repo/periods.repo.ts`, ➕ `src/lib/filters/entity-token.ts`, ➕ `src/lib/filters/entity-token.test.ts`, ➕ `src/server/context.ts`, ➕ `src/functions/filters.fn.ts`, ➕ `src/queries/keys.ts`, ➕ `src/queries/filters.queries.ts`

`entities.repo.ts`:

```sql
-- getEntitySegment(): the entity segment (D21)
SELECT segment_id AS segmentId, column_name AS columnName
FROM segment
WHERE `count` = 1;

-- listEntities(segmentId)
SELECT pl.location_id AS locationId, pl.code AS code, pl.name AS name, pl.is_active AS isActive,
       sd.segment_detail_id AS segmentDetailId
FROM pos_location pl
LEFT JOIN segment_detail sd ON sd.location_id = pl.location_id AND sd.segment_id = ?
ORDER BY pl.name, pl.location_id;
```

- `getEntitySegment` harus menghasilkan **tepat 1 baris** dan `columnName` harus cocok `/^segment([1-9]|1[0-5])_id$/`; bila tidak, lempar error yang jelas.
- Gabungkan baris per `locationId` menjadi `Entity` (satu entitas bisa punya beberapa `segmentDetailId`).
- `isActive`: `Number(isActive) === 1`. Entitas nonaktif tetap ditampilkan (§2.2 `pos_location`).

`periods.repo.ts`:

```sql
SELECT periode_id AS periodeId, name, start_date AS startDate, end_date AS endDate,
       status, type, table_name AS tableName
FROM periode
ORDER BY start_date, type;
```

`entity-token.ts`:

```ts
export function parseEntityToken(token: string, entities: Entity[]): { locationIds: Id[] | 'all'; unknownCodes: string[] }
export function serializeEntityToken(selected: Id[], entities: Entity[]): string   // all selected → 'all'
```

- Kode dipisah koma; kode tidak dikenal masuk `unknownCodes` dan diabaikan; bila semua kode tidak dikenal → `'all'` + peringatan.
- Kode **harus unik**. Saat pertama kali dijalankan (⛔ IZIN USER) cek: `SELECT code, COUNT(*) AS n FROM pos_location GROUP BY code HAVING n > 1;` Bila ada hasil, berhenti dan tanya user.

`src/server/context.ts` (server-only):

```ts
export async function resolveFilter(input: MetricInput): Promise<ResolvedFilter & { entitySegmentColumn: string; entityCount: number; hasOpenPeriod: boolean }>
```

- Memakai cache memori 10 menit untuk daftar entitas, segmen entitas, dan periode (`src/server/cache.ts`, dibuat di langkah ini dengan fungsi `memo(key, ttlMs, loader)`; diperluas di Fase 14).
- `locationIds = 'all'` → `segmentDetailIds = 'all'` (tanpa filter lokasi, termasuk baris "Tanpa lokasi" dan lokasi tidak dikenal).
- `today = todayIn(env.APP_TIMEZONE)`.

`filters.fn.ts`:

```ts
export type FilterOptions = {
  entities: Array<{ code: string; name: string; isActive: boolean }>       // no long IDs (F1)
  presets: Array<{ preset: Preset; from: IsoDate; to: IsoDate }>           // month hints for PeriodSelect
  today: IsoDate
}

export const getFilterOptionsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<FilterOptions> => {
    // dynamically import repo & context, then build FilterOptions
  })
```

`src/queries/keys.ts`:

```ts
export const qk = {
  filterOptions: () => ['filter-options'] as const,
  accountMapping: () => ['settings', 'account-mapping'] as const,
  coaTree: (input: unknown) => ['settings', 'coa-tree', input] as const,
  metric: (name: string, input: unknown) => ['metric', name, input] as const,
  drill: (input: unknown) => ['drill', input] as const,
  dataChecks: (input: unknown) => ['data-checks', input] as const,
}
```

✅ Cek selesai:
- Test `entity-token.test.ts` lulus: semua terpilih → `'all'`; `'A01,ZZZ'` → `locationIds ['<id A01>']`, `unknownCodes ['ZZZ']`.
- ⛔ IZIN USER: `getFilterOptionsFn` mengembalikan daftar entitas DB `demo` (±87–96 lokasi) tanpa properti `locationId`.

## Langkah 7.4 — EntityPicker & PeriodSelect

📁 File: ➕ `src/components/neraca/EntityPicker.tsx`, ➕ `src/components/neraca/PeriodSelect.tsx`, ✏️ `src/components/neraca/TopBar.tsx`

EntityPicker (README EntityPicker, F1):
- Popover (`ui/popover`); di layar < 768px menjadi sheet layar penuh (`ui/sheet`).
- Isi: kolom cari (cocok ke nama **dan** kode), baris hitungan "3 dari 87 dipilih" (selalu terlihat), tombol "Pilih semua" / "Kosongkan", daftar datar: checkbox + nama (`body-strong`) + kode (`code-sm`), entitas nonaktif diberi caption "nonaktif".
- Perubahan baru berlaku saat **Terapkan**; **Batal** mengembalikan pilihan semula. Terapkan nonaktif bila 0 entitas dipilih.
- Terapkan → `navigate({ search: (s) => ({ ...s, entity: serializeEntityToken(...) }) })`.
- Label tombol di TopBar: semua → `common.allEntities` ("Semua entitas"); sebagian → "24 dari 87".

PeriodSelect (README PeriodSelect, F3):
- Menu 5 preset; tiap baris menampilkan petunjuk bulan dari `getFilterOptionsFn` (mis. "Jan – Okt 2026") dengan `ink-muted`.
- Baris toggle "Termasuk Periode 13" (`ui/switch`), aktif hanya untuk `ytd` dan `last-12m`.
- Di halaman `/payment-plan`, isi menu diganti preset 7/14/30 hari (`horizon`), dan toggle Periode 13 disembunyikan.
- Label tombol: "Bulan ini · Okt 2026".

✅ Cek selesai:
- Memilih 2 entitas lalu Terapkan → URL berisi `entity=KODE1,KODE2`; pindah halaman lewat sidebar → parameter tetap ada.
- Memilih preset → URL `preset=ytd`; reload → pilihan sama.
- Keyboard: popover bisa dibuka, dinavigasi, dan ditutup dengan Esc.
