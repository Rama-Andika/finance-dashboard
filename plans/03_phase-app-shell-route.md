# Fase 3 – App shell & route

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [02_phase-neraca-ui.md](./02_phase-neraca-ui.md) · Berikutnya: [04_phase-i18n-format.md](./04_phase-i18n-format.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (02_phase-neraca-ui.md) sudah lulus "✅ Cek selesai".

---

## Langkah 3.1 — Preferensi tema & bahasa (cookie, SSR-safe)

🎯 Tujuan: tema (light/dark, default light, U1) dan bahasa (EN default, ID, U2) diingat lewat cookie supaya HTML dari server sudah benar sejak awal (tidak berkedip).

📁 File: ➕ `src/functions/prefs.fn.ts`

```ts
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'

export const prefsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  lang: z.enum(['en', 'id']),
})
export type Prefs = z.infer<typeof prefsSchema>

const ONE_YEAR = 60 * 60 * 24 * 365
const cookieOpts = { path: '/', sameSite: 'lax', httpOnly: true, maxAge: ONE_YEAR } as const

export const getPrefsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<Prefs> => {
  const theme = getCookie('nr_theme') === 'dark' ? 'dark' : 'light'
  const lang = getCookie('nr_lang') === 'id' ? 'id' : 'en'
  return { theme, lang }
})

export const setPrefsFn = createServerFn({ method: 'POST' })
  .validator(prefsSchema.partial())
  .handler(async ({ data }) => {
    if (data.theme) setCookie('nr_theme', data.theme, cookieOpts)
    if (data.lang) setCookie('nr_lang', data.lang, cookieOpts)
    return { ok: true as const }
  })
```

✏️ `src/routes/__root.tsx`:
- Tambahkan `beforeLoad: async () => ({ prefs: await getPrefsFn() })`.
- `RootDocument` membaca `Route.useRouteContext().prefs` lalu menulis `<html lang={prefs.lang} data-theme={prefs.theme}>`.
- Hapus `data-theme="light"` yang ditulis langsung di langkah 1.4.

✅ Cek selesai:
- Tanpa cookie: HTML awal (View Source) memuat `<html lang="en" data-theme="light">`.
- Setelah memanggil `setPrefsFn({ data: { theme: 'dark', lang: 'id' } })` lalu reload: View Source memuat `<html lang="id" data-theme="dark">`.

## Langkah 3.2 — Struktur route

📁 File (semua ➕, isi awal masing-masing hanya judul halaman lewat `<h1>` sementara):

| File | URL | Judul (EN / ID) |
|---|---|---|
| `src/routes/login.tsx` | `/login` | Sign in / Masuk |
| `src/routes/_authed.tsx` | (layout, tanpa URL sendiri) | — |
| `src/routes/_authed/index.tsx` | `/` | redirect ke `/summary` |
| `src/routes/_authed/summary.tsx` | `/summary` | Summary / Ringkasan |
| `src/routes/_authed/revenue.tsx` | `/revenue` | Revenue / Pendapatan |
| `src/routes/_authed/cash-position.tsx` | `/cash-position` | Cash Position / Posisi Kas |
| `src/routes/_authed/cash-flow.tsx` | `/cash-flow` | Cash Flow / Arus Kas |
| `src/routes/_authed/profit-loss.tsx` | `/profit-loss` | Profit & Loss / Laba Rugi |
| `src/routes/_authed/payables.tsx` | `/payables` | Payables / Utang |
| `src/routes/_authed/receivables.tsx` | `/receivables` | Receivables / Piutang |
| `src/routes/_authed/payment-plan.tsx` | `/payment-plan` | Payment Plan / Rencana Bayar |
| `src/routes/_authed/budget.tsx` | `/budget` | Budget vs Actual / Anggaran |
| `src/routes/_authed/settings/account-mapping.tsx` | `/settings/account-mapping` | Account Mapping / Pemetaan Akun |

Penempatan metrik di halaman (dipakai mulai Fase 10):

| Halaman | Isi |
|---|---|
| Ringkasan | Posisi Kas (kartu forest), KPI Pendapatan, Laba Bersih, Utang Usaha; grafik Arus Kas + Komposisi Pendapatan/Beban; Runway & 3 rasio; tabel tagihan jatuh tempo 7 hari |
| Pendapatan | Revenue (§6.1) |
| Posisi Kas | Cash Position + Deposito + Dana dalam pencairan (§6.2) + Runway (§6.11) |
| Arus Kas | Cash Flow (§6.3) + tab **Biaya Dibayar** (Expense Paid, §6.5) |
| Laba Rugi | P&L (§6.4) + tab **Biaya Tetap** (Fixed Cost, §6.8) + Gross/Net Margin |
| Utang | Outstanding Liability & AP Aging (§6.6) |
| Piutang | AR Aging (§6.7) |
| Rencana Bayar | Daily Payment Plan (§6.9) |
| Anggaran | Budget vs Actual (§6.10) |
| Pemetaan Akun | Settings keranjang (§5) |

> Penempatan Expense Paid, Fixed Cost, dan Runway adalah default rencana ini (lihat README §9, K8).

📁 `src/routes/_authed/index.tsx`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({
  beforeLoad: () => {
    throw redirect({ to: '/summary' })
  },
})
```

✏️ Hapus `src/routes/index.tsx` (halaman uji Fase 1) **sebelum** membuat `src/routes/_authed/index.tsx`, karena keduanya memakai URL `/`.

✅ Cek selesai:
- Setiap URL di tabel bisa dibuka dan menampilkan judulnya.
- `/` berpindah ke `/summary`.

## Langkah 3.3 — SidebarNav, TopBar, AppShell

📁 File:
- ➕ `src/components/neraca/SidebarNav.tsx`
- ➕ `src/components/neraca/TopBar.tsx`
- ➕ `src/components/layout/AppShell.tsx`
- ➕ `src/components/layout/MobileDrawer.tsx`
- ✏️ `src/routes/_authed.tsx` (render `AppShell` + `<Outlet />`)

Isi SidebarNav (urutan **wajib** sama dengan README SidebarNav):

| Urutan | Kunci i18n | URL | Ikon Lucide |
|---|---|---|---|
| 1 | `nav.summary` | `/summary` | `LayoutDashboard` |
| 2 | `nav.revenue` | `/revenue` | `TrendingUp` |
| 3 | `nav.cashPosition` | `/cash-position` | `Wallet` |
| 4 | `nav.cashFlow` | `/cash-flow` | `ArrowLeftRight` |
| 5 | `nav.pnl` | `/profit-loss` | `ChartColumn` |
| 6 | `nav.payables` | `/payables` | `Receipt` |
| 7 | `nav.receivables` | `/receivables` | `HandCoins` |
| 8 | `nav.paymentPlan` | `/payment-plan` | `CalendarDays` |
| 9 | `nav.budget` | `/budget` | `Target` |
| grup `nav.settingsGroup` | `nav.accountMapping` | `/settings/account-mapping` | `ListTree` |

- Nama produk "Neraca" (Plus Jakarta Sans 700) didahului ikon `Asterisk`.
- Item aktif: `aria-current="page"` (kelas `nr-nav-item` sudah memberi isian lime).
- Bagian bawah: panel `nr-freshness` berisi waktu data dibaca dan status periode (diisi Fase 7; sementara teks contoh).
- Bila sebuah nama ikon tidak ada di `lucide-react` 1.63.0, pilih ikon terdekat di lucide.dev dan catat di `docs/progress.md`.

Isi TopBar (urutan kiri → kanan sesuai README TopBar):
1. Judul halaman (`page-title`).
2. Tombol Entitas (membuka EntityPicker, Fase 7).
3. Tombol Periode (membuka PeriodSelect, Fase 7).
4. Tombol ikon tema (`Sun`/`Moon`) → `setPrefsFn({ data: { theme } })` lalu `router.invalidate()`.
5. Tombol bahasa (`EN`/`ID`) → `setPrefsFn({ data: { lang } })` lalu `router.invalidate()`.
6. Tombol ikon notifikasi (`Bell`) yang membuka panel "Data perlu dicek" (Fase 13), dengan angka jumlah temuan.
7. Avatar + nama user (Fase 6) dengan menu "Keluar".

> Kolom pencarian di README TopBar **tidak** dibuat di versi ini (lihat README §9, K9).

Responsif (README Neraca UI):
- ≥ 1024px: sidebar penuh `--sidebar-width`.
- 768–1023px: sidebar ikon saja (label disembunyikan, tetap ada `aria-label`).
- < 768px: sidebar menjadi drawer (`MobileDrawer` memakai `ui/sheet`, dibuka tombol `Menu` di TopBar); kedua tombol filter turun ke baris kedua selebar penuh.

✅ Cek selesai:
- Di lebar 1280px, 900px, dan 375px tampilan sesuai aturan di atas (cek dengan DevTools responsive).
- Navigasi keyboard: Tab mencapai semua item menu; fokus terlihat (cincin `--focus`).
- `npm run typecheck` lulus.
