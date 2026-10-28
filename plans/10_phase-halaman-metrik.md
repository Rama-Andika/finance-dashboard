# Fase 10 – Halaman metrik

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [09_phase-metrik-repo-server-function.md](./09_phase-metrik-repo-server-function.md) · Berikutnya: [11_phase-drill-down.md](./11_phase-drill-down.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (09_phase-metrik-repo-server-function.md) sudah lulus "✅ Cek selesai".

---

## Langkah 10.1 — Komponen grafik & tabel

📁 File: ➕ `src/components/neraca/CashflowChart.tsx`, ➕ `src/components/neraca/DonutBreakdown.tsx`, ➕ `src/components/neraca/AgingBar.tsx`, ➕ `src/components/neraca/DataTable.tsx`

Baca README & `preview.html` masing-masing di `docs/design/neraca-ui/components/` sebelum menulis.

| Komponen | Props | Aturan penting |
|---|---|---|
| `CashflowChart` | `{ title: string; data: Array<{ month: string; cashIn: Money; cashOut: Money }>; net: Money; rangeLabel: string; range: 'ytd' \| 'last-12m'; onRangeChange: (r) => void; lang: Lang; onSelectMonth?: (month: string) => void }` | Recharts `BarChart` dengan `stackOffset="sign"`: `cashIn` positif (`fill: var(--chart-income)`), `cashOut` negatif (`fill: var(--chart-expense)`); ujung luar membulat `radius-xs`; grid horizontal saja `var(--chart-grid)`; garis nol `ReferenceLine y={0}` `var(--chart-axis)`; sumbu Y `formatAxisShort`; tooltip memakai kelas `nr-tooltip`; bulan terpilih diberi halo `lime-soft` + garis `lime-strong`; animasi 300ms satu kali, mati bila `prefers-reduced-motion` |
| `DonutBreakdown` | `{ tabs: [{ id: 'revenue'; label }, { id: 'expense'; label }]; activeTab; onTabChange; items: Breakdown[]; totalLabel: string; lang: Lang; onSelect?: (id: string) => void }` | Maks 5 segmen: 4 terbesar + "Lainnya" (`chart-5`); warna `chart-1` … `chart-5`; cincin 18px, celah 2px; total `figure-md` di tengah; legenda: chip persen (teks `on-chart-1` / `on-lime` / `ink`), nama, angka rata kanan |
| `AgingBar` | `{ title: string; asOf: IsoDate; total: Money; segments: Array<{ key: 'notDue' \| 'd0_30' \| 'd31_60' \| 'd61_90' \| 'd90plus'; label: string; amount: Money }>; lang: Lang; onSelect?: (key) => void }` | Satu batang 100% (div, bukan Recharts); `notDue` = Σ 4 bucket `due…` dari server, `d0_30` … `d90plus` = 4 bucket `overdue…`; warna: `notDue` `chart-5`, `d0_30` `chart-4`, `d31_60` `warning-soft` + tepi `warning`, `d61_90` `warning`, `d90plus` `danger`; setiap segmen punya label + angka |
| `DataTable<T>` | `{ columns: ColumnDef<T>[]; data: T[]; getRowId: (r: T) => string; getSubRows?: (r: T) => T[] \| undefined; onRowClick?: (r: T) => void; mobileCard: (r: T) => ReactNode; emptyMessage: string }` | TanStack Table; header `surface-sunken` `radius-md`; baris 44px; angka `formatMoneyFull` rata kanan `tabular-nums`; negatif dalam kurung warna `ink`; baris bisa di-expand (F5); > 200 baris → TanStack Virtual; < 768px → daftar kartu dari `mobileCard`. Tabel dibungkus `div.nr-table-wrap`, wadah kartu ponsel diberi kelas `mobile-cards` (dipakai `print.css`) |

Aturan khusus grafik:
- Recharts butuh `number`. Konversi `Number(money)` **hanya** untuk koordinat grafik (pengecualian G12). Angka yang **ditampilkan** (tooltip, legenda, total) selalu diformat dari string asli.
- Setiap grafik punya `aria-label` ringkas (contoh di `CashflowChart/preview.html`) dan padanan tabel lewat drill-down.

Rentang grafik bulanan (README CashflowChart: pilihan periode milik kartu): tambahkan ke `src/lib/filters/search-schema.ts`:

```ts
export const chartSearchSchema = z.object({ chart: z.enum(['ytd', 'last-12m']).catch('ytd') })
```

`getCashFlowFn` dan `getRevenueFn` menerima `chart` (opsional) dan menghitung `monthly`/`trend` untuk rentang itu, terpisah dari preset halaman. Parameter `chart` **tidak** ikut `retainSearchParams`.

✅ Cek selesai:
- Halaman `dev-ui.tsx` (langkah 2.6) menampilkan keempat komponen dengan data contoh di tema light & dark; dibandingkan dengan `preview.html`.
- `npm run typecheck` lulus.

## Langkah 10.2 — Pola route halaman metrik

Setiap file `src/routes/_authed/<route>.tsx` mengikuti pola ini:

```tsx
export const Route = createFileRoute('/_authed/pendapatan')({
  validateSearch: chartSearchSchema.extend(drillSearchSchema.shape),
  loaderDeps: ({ search }) => ({ entity: search.entity, preset: search.preset, p13: search.p13, chart: search.chart }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(revenueQuery(deps)),
  pendingComponent: RevenueSkeleton,      // skeleton shaped like the content (no spinner)
  errorComponent: MetricError,            // danger Notice + "Try again" button (router.invalidate)
  component: RevenuePage,
})
```

- `validateSearch` per halaman: halaman dengan grafik bulanan (Ringkasan, Pendapatan, Arus Kas) memakai `chartSearchSchema.extend(drillSearchSchema.shape)`; `/payment-plan` memakai `paymentPlanSearchSchema.extend(drillSearchSchema.shape)`; halaman lain cukup `drillSearchSchema`. Parameter global (`entity`, `preset`, `p13`) sudah divalidasi di `_authed.tsx`.
- `loaderDeps` hanya memuat parameter yang memengaruhi data (jangan masukkan `drill`, supaya membuka side sheet tidak memuat ulang halaman).

Isi umum setiap halaman (urutan dari atas):
1. `Notice` warning bila `meta.hasOpenPeriod` ("Periode Okt 2026 belum ditutup. Angka masih bisa berubah.") dan bila `meta.missingMonths` tidak kosong.
2. Baris KPI (desktop 4 kolom, tablet 2, ponsel 1). Paling banyak **satu** `CashBalanceCard` (forest) per layar.
3. Baris grafik (2/3 + 1/3 bila ada dua grafik).
4. Tabel lebar penuh.
5. Tombol "Ekspor CSV" dan "Cetak" di header kartu tabel (Fase 12).

## Langkah 10.3 — Isi tiap halaman

| Halaman | KPI | Grafik | Tabel | Server function |
|---|---|---|---|---|
| Ringkasan | `CashBalanceCard` (Posisi Kas); KpiCard Pendapatan, Laba Bersih, Utang Usaha | CashflowChart (2/3) + DonutBreakdown Pendapatan/Beban per folder (1/3) | Tagihan jatuh tempo 7 hari ke depan (vendor, nomor, jatuh tempo, sisa, status rencana bayar); di bawahnya baris kecil Runway + Gross Margin + Net Margin + Current Ratio | `getSummaryFn` |
| Pendapatan | Total Pendapatan (+ pembanding) | Tren bulanan (bar, `chart-income`) + Donut komposisi folder | Folder → akun (expand), kolom per bulan + total | `getRevenueFn` |
| Posisi Kas | `CashBalanceCard`; KpiCard Dana dalam pencairan; KpiCard Runway | — | (1) Kas/Bank → folder → akun dengan saldo; (2) Dana dalam pencairan per channel: nilai, jumlah transaksi, umur tertua, pill "Lewat 3 hari"; (3) saldo per entitas, saldo negatif dengan ikon info | `getCashPositionFn`, `getRunwayFn` |
| Arus Kas | Kas awal, Arus kas bersih, Kas akhir | Waterfall (Recharts `BarChart` bertumpuk: kas awal → operasi → investasi → pendanaan → kas akhir) + CashflowChart | Laci → sub-baris (baris "Belum terklasifikasi" dengan ikon peringatan); label "Sumber klasifikasi: …"; panel kecil perbandingan dengan cara ERP. Tab **Biaya Dibayar**: KPI total + tabel kategori | `getCashFlowFn`, `getExpensePaidFn` |
| Laba Rugi | Pendapatan, Laba Kotor, Laba Bersih (+ margin) | — | Baris P&L (§6.4) dengan subtotal tebal, kolom per bulan + total, margin %, ikon info di Laba Usaha ("belum dikurangi depresiasi"), OCI di bawah Laba Bersih. Tab **Biaya Tetap**: stacked bar Fixed vs Variable + garis rata-rata, tabel folder | `getPnlFn`, `getFixedCostFn`, `getRunwayFn` (margin) |
| Utang | Utang Usaha (neto) + rincian 3 komponen | AgingBar | Per vendor: total + 8 bucket + subtotal "Sampai saat ini"; filter akun kontrol & vendor; Notice rekonsiliasi | `getApAgingFn` |
| Piutang | Piutang (neto), Piutang non-dagang | AgingBar | Per pelanggan seperti Utang | `getArAgingFn` |
| Rencana Bayar | Saldo awal, Total keluar, Saldo akhir terendah | Garis saldo proyeksi (Recharts `LineChart`, titik negatif bertanda `danger`) | Per hari: saldo awal, masuk, keluar, saldo akhir (negatif → pill danger "Saldo minus"), ringkasan status; baris Overdue paling atas; toggle "Sertakan proyeksi penerimaan" | `getPaymentPlanFn` |
| Anggaran | Actual vs Budget per baris utama | — | Baris P&L & folder: Budget, Actual, Variance, Variance % (`DeltaPill` dengan `higherIsBetter`); bagian terpisah "Target Operasional" | `getBudgetFn` |

Angka di KpiCard memakai `formatMoneyShort` + tooltip `formatMoneyFull`. Pembanding (caption di bawah angka) = `compare` dari server, dengan teks pembanding sesuai preset ("Bulan lalu", "Kuartal lalu", "Periode sama tahun lalu", "12 bulan sebelumnya").

✅ Cek selesai (per halaman):
- ⛔ IZIN USER (memakai DB lokal): halaman tampil tanpa error untuk preset `this-month`, `last-month`, `ytd` dengan `entity=all` dan dengan 2 entitas.
- Tampilan di 1280px, 900px, 375px sesuai README (tabel jadi kartu di ponsel).
- Tema dark: tidak ada teks yang tidak terbaca (kontras sesuai token).
- Tidak ada teks UI yang tidak lewat i18n (cari string berhuruf di JSX, kecuali kode & angka).
