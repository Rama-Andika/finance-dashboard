# Fase 4 – i18n & util format

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [03_phase-app-shell-route.md](./03_phase-app-shell-route.md) · Berikutnya: [05_phase-db-layer.md](./05_phase-db-layer.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (03_phase-app-shell-route.md) sudah lulus "✅ Cek selesai".

---

## Langkah 4.1 — Setup i18n

📁 File:
- ➕ `src/i18n/index.ts`
- ➕ `src/i18n/locales/en.json`
- ➕ `src/i18n/locales/id.json`
- ✏️ `src/routes/__root.tsx`

`src/i18n/index.ts`:

```ts
import i18next, { type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Lang } from '~/lib/finance/types'
import en from './locales/en.json'
import id from './locales/id.json'

/** Create a new instance per root render (SSR-safe: no state shared between requests). */
export function createI18n(lang: Lang): i18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    lng: lang,
    fallbackLng: 'en',
    resources: { en: { translation: en }, id: { translation: id } },
    interpolation: { escapeValue: false },
    initAsync: false, // synchronous init (called `initImmediate` in older i18next versions)
  })
  return instance
}
```

✏️ `__root.tsx`: bungkus `children` dengan `<I18nextProvider i18n={useMemo(() => createI18n(prefs.lang), [prefs.lang])}>`.

Aturan kunci i18n:
- Format kunci: `area.subarea.nama` dengan `camelCase`, contoh `nav.cashPosition`, `metric.revenue.title`, `common.export.csv`.
- `en.json` dan `id.json` **harus punya kunci yang sama persis**.
- Teks ID memakai istilah README Neraca UI ("Utang Usaha", "Dana dalam pencairan", "Lewat jatuh tempo"). Tanpa tanda seru, tanpa emoji.

Kunci minimal yang wajib ada sejak langkah ini (tambah sesuai kebutuhan di fase berikutnya):

```json
{
  "nav": { "summary": "", "revenue": "", "cashPosition": "", "cashFlow": "", "pnl": "", "payables": "", "receivables": "", "paymentPlan": "", "budget": "", "settingsGroup": "", "accountMapping": "" },
  "common": { "entity": "", "period": "", "allEntities": "", "apply": "", "cancel": "", "selectAll": "", "clear": "", "signOut": "", "theme": "", "language": "", "loading": "", "noData": "", "dash": "—" },
  "auth": { "title": "", "loginId": "", "password": "", "submit": "", "invalid": "", "tooMany": "" },
  "period": { "thisMonth": "", "lastMonth": "", "thisQuarter": "", "ytd": "", "last12m": "", "includeP13": "", "next7": "", "next14": "", "next30": "" }
}
```

(Nilai `""` di atas hanya kerangka; isi teks EN dan ID yang sesuai.)

✅ Cek selesai:
- Mengganti bahasa di TopBar mengubah semua label menu tanpa reload penuh, dan bertahan setelah reload.
- Test kecil `src/i18n/keys.test.ts`: kunci `en.json` sama persis dengan `id.json` (bandingkan daftar kunci rata/flatten) → lulus.

## Langkah 4.2 — Helper uang (`money.ts`)

📁 File: ➕ `src/lib/finance/money.ts`, ➕ `src/lib/finance/money.test.ts`

```ts
import Decimal from 'decimal.js'
import type { Money } from './types'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const D = (v: Money | number | null | undefined): Decimal =>
  new Decimal(v === null || v === undefined || v === '' ? 0 : v)

export const sum = (values: (Money | null | undefined)[]): Money =>
  values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0)).toFixed(2)

export const toMoney = (d: Decimal): Money => d.toFixed(2)

/** Safe division: divisor 0 → null (the UI shows "—"). */
export const safeDiv = (a: Money, b: Money): string | null =>
  D(b).isZero() ? null : D(a).div(D(b)).toString()
```

✅ Cek selesai (test wajib):
- `sum(['0.1', '0.2'])` → `'0.30'`.
- `sum([])` → `'0.00'`; `sum([null, '5'])` → `'5.00'`.
- `safeDiv('10', '0')` → `null`; `safeDiv('1', '4')` → `'0.25'`.
- Angka besar `'123456789012345678.99'` + `'0.01'` → `'123456789012345679.00'` (tidak kehilangan digit).

## Langkah 4.3 — Format angka (`number.ts`)

📁 File: ➕ `src/lib/format/number.ts`, ➕ `src/lib/format/number.test.ts`

Fungsi dan aturan **persis**:

```ts
import type { Lang, Money } from '~/lib/finance/types'

export function formatMoneyShort(value: Money, lang: Lang): string
export function formatMoneyFull(value: Money, lang: Lang, opts?: { decimals?: 0 | 2 }): string
export function formatPercent(ratio: string | null, lang: Lang): string
export function formatAxisShort(value: number, lang: Lang): string
```

Aturan `formatMoneyShort` (kartu KPI, U3):

| | ID | EN |
|---|---|---|
| Awalan mata uang | `Rp` | `IDR` |
| Jarak setelah awalan | spasi tipis U+2009 | spasi tipis U+2009 |
| Pemisah desimal | `,` | `.` |
| Pemisah ribuan (untuk angka < 1.000) | — | — |
| Satuan | ≥ 10¹² `T` · ≥ 10⁹ `M` · ≥ 10⁶ `Jt` · ≥ 10³ `Rb` | ≥ 10¹² `T` · ≥ 10⁹ `B` · ≥ 10⁶ `M` · ≥ 10³ `K` |
| Jarak sebelum satuan | spasi tak-putus U+00A0 | tanpa spasi |
| Desimal | 2, `ROUND_HALF_UP` | 2, `ROUND_HALF_UP` |
| Negatif | tanda minus U+2212 di depan awalan | sama |

- Satuan dipilih **setelah** pembulatan: bila hasil bulat di satuan sekarang ≥ 1000, naik satu satuan (contoh: 999.995.000 → `Rp 1,00 M`, bukan `1.000,00 Jt`).
- Nilai |x| < 1000 ditulis tanpa satuan dengan 0 desimal: `Rp 950`.

Aturan `formatMoneyFull` (tabel & tooltip):
- ID: pemisah ribuan `.`, desimal `,` → `1.234.500`. EN: ribuan `,`, desimal `.` → `1,234,500`.
- Default 0 desimal (`ROUND_HALF_UP`); `decimals: 2` untuk tooltip bila diminta.
- Negatif ditulis dalam **kurung**: `(1.234.500)`. Tanpa awalan mata uang (mata uang ada di judul kolom, "Sisa (Rp)").

Aturan `formatPercent`: `ratio` adalah pecahan (0,0284) → ID `2,84%`, EN `2.84%`; `null` → `—`.

Aturan `formatAxisShort` (sumbu grafik): sama dengan `formatMoneyShort` tetapi tanpa awalan mata uang dan tanpa desimal bila bulat: `10 M`, `−5 M` (ID) / `10B`, `−5B` (EN).

✅ Cek selesai (test wajib, string ditulis dengan escape `\u2009`, `\u00a0`, `\u2212`):

| Input | ID | EN |
|---|---|---|
| `formatMoneyShort('42560118400', …)` | `Rp\u200942,56\u00a0M` | `IDR\u200942.56B` |
| `formatMoneyShort('1500000', …)` | `Rp\u20091,50\u00a0Jt` | `IDR\u20091.50M` |
| `formatMoneyShort('999995000', …)` | `Rp\u20091,00\u00a0M` | `IDR\u20091.00B` |
| `formatMoneyShort('-1200000', …)` | `\u2212Rp\u20091,20\u00a0Jt` | `\u2212IDR\u20091.20M` |
| `formatMoneyShort('950', …)` | `Rp\u2009950` | `IDR\u2009950` |
| `formatMoneyFull('42560118400', …)` | `42.560.118.400` | `42,560,118,400` |
| `formatMoneyFull('-1234500', …)` | `(1.234.500)` | `(1,234,500)` |
| `formatPercent('0.0284', …)` | `2,84%` | `2.84%` |
| `formatPercent(null, …)` | `—` | `—` |

## Langkah 4.4 — Format tanggal (`date.ts`)

📁 File: ➕ `src/lib/format/date.ts`, ➕ `src/lib/format/date.test.ts`

```ts
const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const

export function formatDate(iso: IsoDate, lang: Lang): string        // '2026-10-28' → '28 Okt 2026' / '28 Oct 2026'
export function formatMonth(iso: IsoDate, lang: Lang): string       // '2026-10-01' → 'Okt' / 'Oct'
export function formatMonthYear(iso: IsoDate, lang: Lang): string   // → 'Okt 2026' / 'Oct 2026'
export function todayIn(timeZone: string, now?: Date): IsoDate      // uses Intl.DateTimeFormat('en-CA', { timeZone })
export function addDays(iso: IsoDate, n: number): IsoDate
export function diffDays(a: IsoDate, b: IsoDate): number            // a − b in calendar days
```

- Jangan memakai locale `date-fns` untuk nama bulan (singkatan `id` di date-fns berbeda: "Agt").
- `addDays` dan `diffDays` bekerja pada tanggal saja (parse `YYYY-MM-DD` sebagai UTC tengah malam) supaya tidak terpengaruh zona waktu atau DST.

✅ Cek selesai (test wajib):
- `formatDate('2026-10-28','id')` → `28 Okt 2026`; `'en'` → `28 Oct 2026`; `formatDate('2026-08-01','id')` → `1 Agu 2026`.
- `diffDays('2026-10-28','2026-09-28')` → `30`; `diffDays('2026-03-01','2026-02-28')` → `1`.
- `addDays('2026-12-31', 1)` → `2027-01-01`.
- `todayIn('Asia/Jakarta', new Date('2026-10-27T18:30:00Z'))` → `2026-10-28`.

## Langkah 4.5 — Builder CSV (`csv.ts`)

📁 File: ➕ `src/lib/format/csv.ts`, ➕ `src/lib/format/csv.test.ts`

```ts
export type CsvFormat = 'comma-dot' | 'semicolon-comma'   // U5
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null; kind: 'text' | 'money' | 'date' | 'number' }
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[], format: CsvFormat): string
```

Aturan:
- Selalu diawali BOM `\uFEFF`.
- `comma-dot`: pemisah kolom `,`, desimal `.`. `semicolon-comma`: pemisah kolom `;`, desimal `,`.
- `money`: 2 desimal, **tanpa** pemisah ribuan, negatif dengan `-` biasa (bukan kurung). `date`: ISO `YYYY-MM-DD`. `text`: apa adanya (papaparse yang memberi tanda kutip bila perlu).
- Baris baru `\r\n`.
- Gunakan `Papa.unparse({ fields, data }, { delimiter, newline: '\r\n', quotes: false })`.

✅ Cek selesai (test wajib):
- Hasil dimulai dengan `\uFEFF`.
- Nilai `'1234.5'` → `1234.50` (comma-dot) dan `1234,50` (semicolon-comma).
- Teks berisi pemisah kolom (mis. `PT A, Tbk`) dibungkus tanda kutip.
- Nilai `'-10'` → `-10.00`.
