# Fase 1 – Scaffold manual

> Bagian dari rencana implementasi Finance Dashboard · Indeks & aturan umum: [README.md](./README.md)
> Sebelumnya: [00_phase-prasyarat-keamanan.md](./00_phase-prasyarat-keamanan.md) · Berikutnya: [02_phase-neraca-ui.md](./02_phase-neraca-ui.md)
>
> **Wajib sebelum mulai fase ini:** baca [README.md](./README.md) §1 (cara memakai), §2 (aturan emas G1–G38), dan §5 (konvensi kode). Semua langkah fase sebelumnya (00_phase-prasyarat-keamanan.md) sudah lulus "✅ Cek selesai".

---

> Proyek dibuat **manual** (bukan dengan `npx @tanstack/cli create`) supaya hasilnya pasti dan tidak menimpa folder `docs/` dan `schema/`.

## Langkah 1.1 — Cek prasyarat

Jalankan (aman, tidak perlu izin):

```bash
node -v
npm -v
```

✅ Cek selesai:
- Node ≥ 22.12.0 (saat ini v24.14.1). Bila lebih rendah, berhenti dan beri tahu user.

## Langkah 1.2 — Buat file konfigurasi dasar

📁 File: ➕ `package.json`

```json
{
  "name": "finance-dashboard",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:watch": "vitest --project unit",
    "test:db": "vitest run --project db",
    "db:pull": "drizzle-kit pull",
    "seed": "tsx scripts/seed/index.ts"
  }
}
```

📁 File: ➕ `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "~/*": ["./src/*"] }
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"]
}
```

> Jangan aktifkan `verbatimModuleSyntax` (menurut dokumentasi Start bisa membuat kode server bocor ke bundle browser).

📁 File: ➕ `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(), // MUST come before viteReact()
    viteReact(),
  ],
})
```

📁 File: ➕ `vitest.config.ts`

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // The server-only marker only matters inside the TanStack Start build; in Vitest it is replaced by an empty module.
      '@tanstack/react-start/server-only': fileURLToPath(new URL('./tests/empty-module.ts', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/integration/**/*.int.test.ts'],
          environment: 'node',
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
})
```

📁 File: ➕ `tests/empty-module.ts` berisi satu baris `export {}`.

> Unit test (`npm test`) **tidak pernah** menyentuh database. Hanya project `db` (`npm run test:db`) yang memakai database, dan itu ⛔ IZIN USER.

✅ Cek selesai:
- Lima file (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tests/empty-module.ts`) ada dengan isi persis di atas.

## Langkah 1.3 — Install paket ⛔ IZIN USER

1. Minta izin user, sebutkan daftar paket & versi dari [README §4](README.md#4-dependensi--versi).
2. Setelah diizinkan, jalankan dua perintah ini (satu baris masing-masing):

```bash
npm install --save-exact @tanstack/react-start@1.169.4 @tanstack/react-router@1.170.46 @tanstack/react-query@5.105.0 @tanstack/react-router-ssr-query@1.167.3 @tanstack/react-table@9.3.1 @tanstack/react-virtual@3.14.23 react@19.3.1 react-dom@19.3.1 zod@4.6.7 drizzle-orm@0.45.4 mysql2@3.24.6 iron-session@9.0.1 decimal.js@10.6.0 date-fns@4.4.0 i18next@26.5.11 react-i18next@17.1.9 papaparse@5.7.0 recharts@3.10.1 lucide-react@1.63.0 clsx@2.1.1 tailwind-merge@3.7.0 class-variance-authority@0.7.1
```

```bash
npm install --save-exact --save-dev vite@8.3.5 @vitejs/plugin-react@6.1.2 typescript@5.9.3 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.2 @types/papaparse@5.5.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 tw-animate-css@1.4.0 vite-tsconfig-paths@6.1.1 drizzle-kit@0.31.11 vitest@5.0.5 tsx@4.23.15 @faker-js/faker@10.6.0
```

🚫 Dilarang: `--force`, `--legacy-peer-deps`, menaikkan/menurunkan versi tanpa izin.

✅ Cek selesai:
- `npm ls --depth=0` tidak menampilkan `UNMET` atau `invalid`.
- Semua versi di `package.json` tanpa tanda `^` atau `~`.

## Langkah 1.4 — Router, root route, dan halaman uji

📁 File: ➕ `src/router.tsx`

```tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // The QueryClient MUST be created inside getRouter (one per SSR request), never at module level.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

📁 File: ➕ `src/routes/__root.tsx` (versi awal; diperluas di Fase 2, 3, 4)

```tsx
import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Neraca — Finance Dashboard' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

📁 File: ➕ `src/routes/index.tsx` (sementara; dihapus di Fase 3 langkah 3.2)

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <p>Finance Dashboard — scaffold OK</p>,
})
```

✅ Cek selesai:
- `npm run dev` berjalan; `http://localhost:3000` menampilkan "Finance Dashboard — scaffold OK".
- File `src/routeTree.gen.ts` muncul otomatis.
- `npm run typecheck` lulus.
- `npm run build` lulus.
