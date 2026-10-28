# Fase 2 – Neraca UI

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [01_phase-scaffold-manual.md](./01_phase-scaffold-manual.md) · Berikutnya: [03_phase-app-shell-route.md](./03_phase-app-shell-route.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (01_phase-scaffold-manual.md) sudah lulus "✅ Cek selesai".

---

## Langkah 2.1 — Salin sumber design system ke repo

🎯 Tujuan: sumber Neraca UI tersedia di repo, tidak bergantung pada link artifact.

> ✔️ **Sudah dilakukan** (28 Oktober 2026): 37 file dari folder `project/` artifact (versi `1793189732-cefb`) sudah ada di `docs/design/neraca-ui/` — `README.md`, `design-system.json`, `tokens.json`, `components/bundle.css`, README + `preview.html` untuk 16 komponen, dan `components/Cover/preview.html`. Langkah ini cukup **diverifikasi** dengan cek di bawah. Ulangi pengunduhan hanya bila user mengubah artifact-nya.
>
> Catatan: `preview.html` tidak memuat `tokens.css`/`bundle.css` sendiri (di artifact keduanya disisipkan otomatis). Untuk melihatnya di browser lokal, tambahkan sementara `<link rel="stylesheet">` ke `src/styles/tokens.css` dan `src/styles/neraca.css` (dibuat di langkah 2.2–2.3), atau bandingkan lewat halaman `dev-ui.tsx` (langkah 2.6).

Langkah:
1. Baca file artifact [Neraca UI](https://claude.ai/artifact/6YqBk8Tgx4MTr9eJvNvCpK) dengan tool Artifact (`action: "read"`, `path`) untuk path berikut, lalu simpan apa adanya ke `docs/design/neraca-ui/` dengan struktur sama:
   - `project/README.md` → `docs/design/neraca-ui/README.md`
   - `project/tokens.json` → `docs/design/neraca-ui/tokens.json`
   - `project/components/bundle.css` → `docs/design/neraca-ui/components/bundle.css`
   - `project/components/<Nama>/README.md` dan `project/components/<Nama>/preview.html` untuk 16 komponen: `AgingBar`, `Button`, `CashBalanceCard`, `CashflowChart`, `DataTable`, `DeltaPill`, `DonutBreakdown`, `EntityPicker`, `KpiCard`, `Notice`, `PeriodSelect`, `SidebarNav`, `StatusPill`, `Tabs`, `Tooltip`, `TopBar`.
2. Bila tool Artifact tidak tersedia atau gagal, berhenti dan minta user mengunduh file itu.

✅ Cek selesai:
- `docs/design/neraca-ui/README.md`, `tokens.json`, `components/bundle.css`, dan 16 folder komponen ada.

## Langkah 2.2 — Token CSS light/dark

📁 File: ➕ `src/styles/tokens.css`

Isi persis (nilai diambil dari `tokens.json`; tema gelap aktif bila `<html data-theme="dark">`):

```css
:root,
:root[data-theme="light"] {
  color-scheme: light;
  --canvas: #eef1ee;
  --surface: #ffffff;
  --surface-sunken: #f3f6f3;
  --surface-hover: #ebf0ec;
  --line: #dfe6e0;
  --line-strong: #7e8f86;
  --ink: #13261f;
  --ink-muted: #5e6e66;
  --forest: #1f4a3c;
  --forest-strong: #163a2f;
  --forest-line: #2e5c4c;
  --on-forest: #ffffff;
  --on-forest-muted: #bfd6cc;
  --lime: #a6e22e;
  --lime-strong: #93cf1f;
  --on-lime: #13261f;
  --lime-soft: #e7f7c9;
  --positive: #2f7a1f;
  --danger: #c8332a;
  --on-danger: #ffffff;
  --danger-soft: #fde8e6;
  --warning: #9a5200;
  --on-warning: #ffffff;
  --warning-soft: #fff1dc;
  --chart-income: var(--lime);
  --chart-expense: var(--forest);
  --chart-grid: #e6ebe7;
  --chart-axis: #c3cdc6;
  --chart-1: #1f4a3c;
  --on-chart-1: #ffffff;
  --chart-2: #a6e22e;
  --chart-3: #6fa88c;
  --chart-4: #cfeea0;
  --chart-5: #dbe4de;
  --indicator: var(--forest);
  --focus: #1f7a5a;
  --focus-on-forest: #a6e22e;
  --shadow-pop: 0 12px 32px rgba(19, 38, 31, 0.14);
  --shadow-glow: 0 0 0 6px rgba(166, 226, 46, 0.35);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #0c1310;
  --surface: #141d19;
  --surface-sunken: #1a2520;
  --surface-hover: #1f2b25;
  --line: #26332c;
  --line-strong: #5d7066;
  --ink: #e6eee9;
  --ink-muted: #9aaba2;
  --forest: #24584a;
  --forest-strong: #2c6957;
  --forest-line: #33705d;
  --on-forest: #f2f7f4;
  --on-forest-muted: #c4dbd1;
  --lime: #b2e84a;
  --lime-strong: #c2ef6a;
  --on-lime: #13261f;
  --lime-soft: #26361a;
  --positive: #b5eb52;
  --danger: #ff8a7e;
  --on-danger: #2a0f0c;
  --danger-soft: #3b1c19;
  --warning: #f2a54a;
  --on-warning: #2a1a05;
  --warning-soft: #3a2a12;
  --chart-income: var(--lime);
  --chart-expense: #5e9e84;
  --chart-grid: #223029;
  --chart-axis: #3d4f46;
  --chart-1: #5e9e84;
  --on-chart-1: #13261f;
  --chart-2: #b2e84a;
  --chart-3: #9cd0b6;
  --chart-4: #7d9a4c;
  --chart-5: #33423a;
  --indicator: var(--lime);
  --focus: #b2e84a;
  --focus-on-forest: #b2e84a;
  --shadow-pop: 0 12px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 0 6px rgba(178, 232, 74, 0.25);
}

/* non-color tokens (identical in both themes) */
:root {
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
  --sidebar-width: 232px;
  --topbar-height: 64px;
  --control-height: 36px;
  --content-max: 1440px;
}
```

✅ Cek selesai:
- Setiap token di `docs/design/neraca-ui/tokens.json` (warna, spacing, radius, shadow, layout, font) punya variabel CSS dengan nama sama. Cek dengan membandingkan daftar nama satu per satu, tulis hasilnya di `docs/progress.md`.

## Langkah 2.3 — Kelas komponen `nr-*`

📁 File: ➕ `src/styles/neraca.css`

Langkah:
1. Salin seluruh isi `docs/design/neraca-ui/components/bundle.css`.
2. Hapus dua aturan yang hanya untuk halaman preview: `.nr-stage { … }` dan `.nr-col { … }`.
3. Jangan mengubah aturan lain. Semua nilai di dalamnya sudah memakai `var(--…)`.

✅ Cek selesai:
- `neraca.css` tidak memuat warna hex (cari pola `#[0-9a-fA-F]{3,6}` → 0 hasil, kecuali di komentar).
- Kelas `.nr-stage` dan `.nr-col` tidak ada.

## Langkah 2.4 — Entry CSS, Tailwind, dan font

📁 File: ➕ `src/styles/print.css` (isi awal kosong dengan satu komentar `/* filled in phase 12 */`)

📁 File: ➕ `src/styles/app.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./tokens.css";
@import "./neraca.css";
@import "./print.css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* Map Neraca UI tokens to Tailwind utilities (bg-canvas, text-ink, rounded-lg, …) */
@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-hover: var(--surface-hover);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-forest: var(--forest);
  --color-forest-strong: var(--forest-strong);
  --color-forest-line: var(--forest-line);
  --color-on-forest: var(--on-forest);
  --color-on-forest-muted: var(--on-forest-muted);
  --color-lime: var(--lime);
  --color-lime-strong: var(--lime-strong);
  --color-on-lime: var(--on-lime);
  --color-lime-soft: var(--lime-soft);
  --color-positive: var(--positive);
  --color-danger: var(--danger);
  --color-on-danger: var(--on-danger);
  --color-danger-soft: var(--danger-soft);
  --color-warning: var(--warning);
  --color-on-warning: var(--on-warning);
  --color-warning-soft: var(--warning-soft);

  /* variables used by shadcn/ui components, mapped to Neraca tokens */
  --color-background: var(--canvas);
  --color-foreground: var(--ink);
  --color-card: var(--surface);
  --color-card-foreground: var(--ink);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--forest);
  --color-primary-foreground: var(--on-forest);
  --color-secondary: var(--surface-sunken);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--surface-sunken);
  --color-muted-foreground: var(--ink-muted);
  --color-accent: var(--surface-hover);
  --color-accent-foreground: var(--ink);
  --color-destructive: var(--danger);
  --color-border: var(--line);
  --color-input: var(--line-strong);
  --color-ring: var(--focus);
}

/* Non-color tokens. Their names match Tailwind namespaces, so they get LITERAL values
   (same as tokens.css). Never write `--font-sans: var(--font-sans)` (self-reference).
   Dark-theme shadow values still come from tokens.css (the [data-theme="dark"] rule wins). */
@theme {
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-pop: 0 12px 32px rgba(19, 38, 31, 0.14);
  --shadow-glow: 0 0 0 6px rgba(166, 226, 46, 0.35);
}
```

✏️ `src/routes/__root.tsx` — tambahkan di `head()`:

```tsx
import appCss from '~/styles/app.css?url'
// …
links: [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  { rel: 'stylesheet', href: appCss },
],
```

✅ Cek selesai:
- Halaman uji tampil dengan latar `canvas` (#eef1ee) dan font Plus Jakarta Sans (cek di DevTools → Computed → `font-family`).
- Mengganti `data-theme="light"` menjadi `"dark"` secara manual di `__root.tsx` membuat latar menjadi #0c1310. Kembalikan ke `"light"` setelah dicek.

## Langkah 2.5 — shadcn/ui ⛔ IZIN USER

🎯 Tujuan: komponen perilaku (dialog, sheet, popover, menu, checkbox, tooltip, switch) yang aksesibel, lalu diberi gaya Neraca UI.

📁 File: ➕ `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/app.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "~/components",
    "ui": "~/components/ui",
    "utils": "~/lib/cn",
    "lib": "~/lib",
    "hooks": "~/hooks"
  },
  "iconLibrary": "lucide"
}
```

📁 File: ➕ `src/lib/cn.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Langkah:
1. Salin `src/styles/app.css` ke `src/styles/app.css.bak` (cadangan).
2. Minta izin user, lalu jalankan:
   ```bash
   npx shadcn@4.23.0 add dialog sheet popover dropdown-menu checkbox tooltip switch scroll-area separator --yes
   ```
3. Bandingkan `src/styles/app.css` dengan cadangan. Bila shadcn menambahkan blok `:root { --background: … }`, `.dark { … }`, atau `@theme inline` baru yang **mengisi warna sendiri**, hapus blok tambahan itu supaya pemetaan di langkah 2.4 tetap berlaku. Hapus `app.css.bak` setelah selesai.
4. Catat paket yang ditambahkan shadcn (mis. `radix-ui` atau `@radix-ui/react-*`) beserta versinya di `docs/progress.md`.

✅ Cek selesai:
- Folder `src/components/ui/` berisi file `dialog.tsx`, `sheet.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `checkbox.tsx`, `tooltip.tsx`, `switch.tsx`, `scroll-area.tsx`, `separator.tsx`.
- `app.css` tidak memuat warna hex.
- `npm run typecheck` lulus.

## Langkah 2.6 — Komponen dasar Neraca UI

🎯 Tujuan: komponen React tipis di atas kelas `nr-*`. Setiap komponen mengikuti README-nya di `docs/design/neraca-ui/components/<Nama>/README.md` dan struktur HTML di `preview.html` yang sama. **Baca keduanya sebelum menulis komponen.**

Langkah pertama: buat ➕ `src/lib/finance/types.ts` dengan isi persis [README §5.2](README.md#52-tipe-dasar-dibuat-di-fase-2-langkah-26-file-srclibfinancetypests) (tipe `Money`, `IsoDate`, `Lang`, dst. dipakai komponen di bawah).

📁 File (semua ➕ di `src/components/neraca/`) dan props wajib:

| File | Props (TypeScript) | Catatan |
|---|---|---|
| `Button.tsx` | `{ variant?: 'primary' \| 'secondary' \| 'accent' \| 'ghost' \| 'icon'; icon?: LucideIcon; children?: ReactNode; 'aria-label'?: string } & ButtonHTMLAttributes` | `secondary` = kelas `nr-btn` saja. `icon` wajib `aria-label` |
| `DeltaPill.tsx` | `{ change: string \| null; higherIsBetter: boolean; lang: Lang }` | `change` = persen bertanda dari server (string). `null` → pill datar "–". Arah panah = tanda angka, warna = baik/buruk |
| `StatusPill.tsx` | `{ tone: 'neutral' \| 'warning' \| 'danger'; children: ReactNode }` | Selalu ada teks |
| `Notice.tsx` | `{ tone: 'warning' \| 'danger'; title: string; body?: string; action?: { label: string; onClick: () => void } }` | `role="status"` (warning) / `role="alert"` (danger) |
| `FigureTooltip.tsx` | `{ full: string; children: ReactNode }` | Tooltip angka penuh untuk angka disingkat (pakai `ui/tooltip`) |
| `Tabs.tsx` | `{ tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }` | `role="tablist"`, 2–4 tab |
| `KpiCard.tsx` | `{ label: string; value: Money \| null; compareValue: Money \| null; compareLabel: string; higherIsBetter: boolean; onOpen?: () => void; hint?: string }` | Angka disingkat + `FigureTooltip`; seluruh kartu bisa diklik bila `onOpen` ada |
| `CashBalanceCard.tsx` | `{ asOf: IsoDate; entityCount: number; cash: Money; bank: Money; deposit: Money; inTransit: Money; onOpen?: () => void }` | Satu-satunya kartu `forest` di layar |
| `Skeleton.tsx` | `{ className?: string }` | Blok `surface-sunken`, tanpa spinner |
| `EmptyState.tsx` | `{ message: string; action?: { label: string; onClick: () => void } }` | Padding `space-10` |

Komponen lain (`SidebarNav`, `TopBar`, `PeriodSelect`, `EntityPicker`, `CashflowChart`, `DonutBreakdown`, `AgingBar`, `DataTable`) dibuat di fase yang memakainya (Fase 3, 7, 10).

Aturan untuk semua komponen:
- Ikon dari `lucide-react`, `strokeWidth={1.75}`, `size={18}` (menu/tombol) atau `size={16}` (pill/tabel).
- Teks lewat props (sudah diterjemahkan oleh pemanggil); komponen tidak memanggil i18n kecuali disebutkan.
- Angka di kartu memakai `formatMoneyShort`, di tabel `formatMoneyFull` (Fase 4). Sampai Fase 4 selesai, pakai teks contoh.

✅ Cek selesai:
- Buat halaman sementara `src/routes/dev-ui.tsx` yang menampilkan semua komponen di atas dalam tema light **dan** dark (tombol ganti `data-theme` lokal). Bandingkan secara visual dengan `preview.html` masing-masing; catat perbedaan di `docs/progress.md` lalu perbaiki.
- `npm run typecheck` lulus.
- Halaman `dev-ui.tsx` **dihapus** di Fase 16 langkah 16.5.
