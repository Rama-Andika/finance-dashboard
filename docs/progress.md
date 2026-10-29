# Progress — Finance Dashboard

| Tanggal | Langkah | Hasil | Cek |
|---|---|---|---|
| 2026-10-28 | 0.1 | Dibuat file docs/progress.md | File ada dengan 3 heading utama (Lulus) |
| 2026-10-28 | 0.2 | Memindahkan docs/.dbclient.cnf ke .dbclient.cnf di root | Test-Path .dbclient.cnf = True, docs/.dbclient.cnf = False (Lulus) |
| 2026-10-28 | 0.3 | Verifikasi .gitignore | Memuat baris .env, .dbclient.cnf, schema/*.csv (Lulus) |
| 2026-10-28 | 0.4 | Membuat file .env.example | File ada, berisi contoh variabel tanpa rahasia (Lulus) |
| 2026-10-28 | 0.5 | Verifikasi status git | git status bersih dari file rahasia (.dbclient.cnf, schema/*.csv) (Lulus) |
| 2026-10-28 | 1.1 | Cek prasyarat Node & npm | Node v24.14.1 (>= 22.12.0), npm 11.11.0 (Lulus) |
| 2026-10-28 | 1.2 | Buat file konfigurasi dasar | package.json, tsconfig.json, vite.config.ts, vitest.config.ts, tests/empty-module.ts dibuat (Lulus) |
| 2026-10-28 | 1.3 | Install paket runtime & dev | Semua paket terpasang sesuai versi pasti, npm ls bersih (Lulus) |
| 2026-10-28 | 1.4 | Setup Router, root route & halaman uji | routeTree.gen.ts terbuat, dev server tampil 'Finance Dashboard - scaffold OK', typecheck & build lulus (Lulus) |
| 2026-10-28 | 2.1 | Verifikasi sumber design system Neraca UI | README.md, tokens.json, components/bundle.css, dan 16 folder komponen ada (Lulus) |
| 2026-10-28 | 2.2 | Pembuatan token CSS light/dark (tokens.css) | 58 token (warna, font, spacing, radius, shadow, layout) terdefinisi sesuai tokens.json (Lulus) |
| 2026-10-28 | 2.3 | Pembuatan kelas komponen Neraca UI (neraca.css) | bundle.css disalin, kelas preview (.nr-stage, .nr-col) dibuang, 0 warna hex (Lulus) |
| 2026-10-28 | 2.4 | Setup Tailwind, entry CSS & font | app.css, print.css dibuat, Google Fonts dimuat di __root.tsx, build lolos (Lulus) |
| 2026-10-28 | 2.5 | Pasang komponen shadcn/ui | 9 komponen ui terpasang, dependensi terkunci (cn@0.5.0, radix-ui@1.8.1), 0 warna hex, typecheck lulus (Lulus) |
| 2026-10-28 | 2.6 | Buat komponen dasar Neraca UI & dev-ui | types.ts dibuat, 10 komponen Neraca UI diimplementasikan, /dev-ui lulus uji (status 200, typecheck & build lulus) (Lulus) |
| 2026-10-28 | 3.1 | Preferensi tema & bahasa (cookie SSR-safe) | prefs.fn.ts dibuat, __root.tsx membaca prefs dan set html lang & data-theme (Lulus) |
| 2026-10-28 | 3.2 | Struktur routing TanStack Router | 13 route dibuat, index redirect ke /summary, login & halaman metrik terdaftar (Lulus) |
| 2026-10-28 | 3.3 | Implementasi SidebarNav, TopBar, AppShell | AppShell responsif dibuat (desktop/tablet/mobile drawer), typecheck & build lulus (Lulus) |
| 2026-10-28 | 4.1 | Setup i18n & keys test | en.json & id.json dibuat identik, I18nextProvider terpasang, keys.test.ts lulus (Lulus) |
| 2026-10-28 | 4.2 | Helper uang decimal.js (money.ts) | sum, toMoney, safeDiv diimplementasikan, 4 test lulus (Lulus) |
| 2026-10-28 | 4.3 | Format angka (number.ts) | formatMoneyShort, formatMoneyFull, formatPercent, formatAxisShort, 10 test lulus (Lulus) |
| 2026-10-28 | 4.4 | Format tanggal (date.ts) | formatDate, formatMonth, formatMonthYear, todayIn, addDays, diffDays, 5 test lulus (Lulus) |
| 2026-10-28 | 4.5 | Builder CSV (csv.ts) | buildCsv dengan BOM, format comma-dot/semicolon-comma, 4 test lulus (Lulus) |
| 2026-10-29 | 5.1 | Variabel lingkungan server (env.ts) | envSchema Zod dibuat, typecheck lulus (Lulus) |
| 2026-10-29 | 5.2 | Cek DB lokal demo | MariaDB 10.4.32; Index UNIQUE name ada (Non_unique=0); Extra sysmain_id kosong (bukan auto_increment) (Lulus) |
| 2026-10-29 | 5.3 | Koneksi mysql2 + Drizzle & helper | client.ts, query.ts, in-list.ts dibuat, typecheck lulus (Lulus) |
| 2026-10-29 | 5.4 | Introspeksi skema Drizzle & penyesuaian | drizzle-kit pull sukses, schema.ts disesuaikan (G10, G11 mode string, G28 sanitasi vendor/customer/sysuser), typecheck lulus (Lulus) |
| 2026-10-29 | 5.5 | Helper dinamis GL | gl-tables.ts & gl-tables.test.ts (5 test) lulus (Lulus) |
| 2026-10-29 | 5.6 | Penjaga kompatibilitas MySQL 5.7 (test statis) | sql-guard.test.ts dibuat, scan static repo tanpa pelanggaran, test lulus (Lulus) |
| 2026-10-29 | 6.1 | Session cookie terenkripsi | session.ts dibuat dengan iron-session & CookieStore TanStack Start, typecheck lulus (Lulus) |
| 2026-10-29 | 6.2 | Rate limit & pembanding password | rate-limit.ts, password.ts dibuat beserta unit test (3 test lulus) (Lulus) |
| 2026-10-29 | 6.3 | Repository login sysuser | auth.repo.ts dibuat (satu-satunya akses kolom password), sql-guard lulus (Lulus) |
| 2026-10-29 | 6.4 | Server function auth & middleware | auth.fn.ts, login-limiter.ts, middleware.ts dibuat, typecheck lulus (Lulus) |
| 2026-10-29 | 6.5 | Guard halaman & halaman login | _authed.tsx guard, login.tsx form, TopBar logout menu dibuat & typecheck lulus (Lulus) |
| 2026-10-29 | 6.6 | Test integrasi login (⛔ IZIN USER) | setup.ts & auth.int.test.ts dibuat, 5 test integrasi DB lulus (Lulus) |
| 2026-10-29 | 7.1 | Skema search params | search-schema.ts, search-schema.test.ts (5 test) & _authed search middleware dibuat (Lulus) |
| 2026-10-29 | 7.2 | Resolusi periode | periods.ts & periods.test.ts (6 test) dibuat sesuai aturan Jan-Des & pembanding (Lulus) |
| 2026-10-29 | 7.3 | Entitas & periode dari DB | entities.repo, periods.repo, entity-token (7 test), cache.ts, context.ts, filters.fn dibuat; kode pos_location dicek unik (Lulus) |
| 2026-10-29 | 7.4 | EntityPicker & PeriodSelect | Komponen popover/sheet EntityPicker, PeriodSelect, dan integrasi TopBar selesai; build & 51 unit test lulus (Lulus) |
| 2026-10-29 | 8.1 | Repository CoA | coa.repo.ts dibuat, typecheck lulus (Lulus) |
| 2026-10-29 | 8.2 | Pembangun pohon CoA | coa-tree.ts & coa-tree.test.ts (9 test) dibuat, struktur parentId & deteksi siklus/orphan teruji (Lulus) |
| 2026-10-29 | 8.3 | Tanda saldo per grup | sign.ts & sign.test.ts (5 test) dibuat, saldo normal & akun lawan teruji (Lulus) |
| 2026-10-29 | 8.4 | Resolver keranjang & toggle pohon | basket-resolver.ts & basket-resolver.test.ts (5 test) dibuat, toggle tri-state & resolve keranjang teruji (Lulus) |
| 2026-10-29 | 8.5 | Skema & validasi Settings & OID | mapping-schema.ts, mapping-validate.ts, oid.ts beserta 9 unit test lulus (Lulus) |
| 2026-10-29 | 8.6 | Repo & server function Settings | settings.repo.ts, settings.fn.ts, settings.queries.ts dibuat; sql-guard & typecheck lulus (Lulus) |
| 2026-10-29 | 8.7 | Halaman Pemetaan Akun | account-mapping.tsx, CoaTreePicker (virtualized), BasketPreview selesai; 79 unit test lulus (Lulus) |
| 2026-10-29 | 8.8 | Test integrasi Settings (⛔ IZIN USER) | settings.int.test.ts dibuat, 2 test integrasi DB lulus (Lulus) |
| 2026-10-29 | 9.0 | Kontrak umum metrik | MetricMeta, Breakdown, compareTotal di types.ts & buildMetricMeta di context.ts (Lulus) |
| 2026-10-29 | 9.1 | Repository GL | gl.repo.ts dibuat (fetchPeriodMutations, fetchDateRangeMutations, fetchDailyTrend, fetchMonthlyTrend, fetchOpeningBalances) (Lulus) |
| 2026-10-29 | 9.2 | Engine saldo Neraca & Buku Besar | balance.ts, balance.test.ts (6 test), balance.service.ts, getCoaTreeFn diimplementasikan (Lulus) |
| 2026-10-29 | 9.3 | Posisi Kas & Dana dalam Pencairan | bank-payment.repo.ts, cash-position.ts, cash-position.test.ts (4 test), cash-position.service.ts, cash-position.fn.ts (Lulus) |
| 2026-10-29 | 9.4 | Pendapatan & tren harian/bulanan | revenue.ts, revenue.test.ts (3 test), revenue.service.ts, revenue.fn.ts (Lulus) |
| 2026-10-29 | 9.5 | Laba Rugi (P&L) bulanan & subtotal | pnl.ts, pnl.test.ts (2 test), pnl.service.ts, pnl.fn.ts (Lulus) |
| 2026-10-29 | 9.6 | Arus Kas langsung & cek identitas | cashflow.repo.ts, cashflow.ts, cashflow.test.ts (7 test), cashflow.fixture.ts, cash-flow.service.ts, cash-flow.fn.ts (Lulus) |
| 2026-10-29 | 9.7 | Biaya Dibayar (Expense Paid) | apar.repo.ts, expense-paid.ts, expense-paid.test.ts (3 test), expense-paid.service.ts, expense-paid.fn.ts (Lulus) |
| 2026-10-29 | 9.8 | Outstanding Liability & AP Aging | aging.ts, aging.test.ts (5 test), apar.ts, apar.test.ts (4 test), apar.fixture.ts, ap-aging.service.ts, ap-aging.fn.ts (Lulus) |
| 2026-10-29 | 9.9 | Piutang Usaha & AR Aging | ar-aging.service.ts, ar-aging.fn.ts dibuat, integrasi Part A & B (Lulus) |
| 2026-10-29 | 9.10 | Biaya Tetap Bulanan (Fixed Cost) | fixed-cost.ts, fixed-cost.test.ts (2 test), fixed-cost.service.ts, fixed-cost.fn.ts (Lulus) |
| 2026-10-29 | 9.11 | Rencana Pembayaran Harian (Payment Plan) | payment-plan.ts, payment-plan.test.ts (3 test), payment-plan.service.ts, payment-plan.fn.ts (Lulus) |
| 2026-10-29 | 9.12 | Anggaran vs Realisasi (Budget vs Actual) | budget.repo.ts, budget.ts, budget.test.ts (4 test), budget.service.ts, budget.fn.ts (Lulus) |
| 2026-10-29 | 9.13 | Cash Runway & Rasio | runway.ts, runway.test.ts (3 test), runway.service.ts, runway.fn.ts (Lulus) |
| 2026-10-29 | 9.14 | Ringkasan & queryOptions | summary.service.ts, summary.fn.ts, metrics.queries.ts (12 queryOptions) (Lulus) |
| 2026-10-29 | 9.15 | Test integrasi metrik ke DB lokal | metrics.int.test.ts (12 test integrasi DB lulus, 100% money regex & identityOk), mysql57-compat.int.test.ts (Lulus) |
| 2026-10-29 | 10.1 | Komponen grafik & tabel Neraca UI | CashflowChart, DonutBreakdown, AgingBar, DataTable (TanStack Table + Virtual) dibuat, diuji di dev-ui.tsx di tema light & dark (Lulus) |
| 2026-10-29 | 10.2 | Pola route halaman metrik & generator | chartSearchSchema, drillSearchSchema, paymentPlanSearchSchema, MetricSkeleton, MetricError, regenerasi routeTree.gen.ts selesai (Lulus) |
| 2026-10-29 | 10.3 | 9 Halaman metrik lengkap | /summary, /revenue, /cash-position, /cash-flow, /profit-loss, /payables, /receivables, /payment-plan, /budget selesai; typecheck 0 error, 125 unit tests & 19 DB integration tests lulus (Lulus) |
| 2026-10-29 | 11.1 | State drill-down & Sheet UI | DrillSheet, JournalList, AppShell integration, URL bookmarkable `drill`, breadcrumbs, back, escape, focus restoration selesai (Lulus) |
| 2026-10-29 | 11.2 | Query drill-down & Server service | computeDrill, getDrillFn, cardSettlementHistory, journalLines, pagination +200, 13 test integrasi DB lulus (Lulus) |
| 2026-10-29 | 12.1 | Dialog Export CSV | ExportCsvDialog, ExportCsvButton, formatExportFilename, localStorage memory, semicolon-comma (Excel ID) & comma-dot format, UTF-8 BOM, Blob download (Lulus) |
| 2026-10-29 | 12.2 | Print & PDF styling | print.css (@media print A4 portrait, white bg, break-inside avoid, hide sidebar/topbar/drill-sheet, table un-mobile), PrintButton, PrintHeader di semua halaman (Lulus) |
| 2026-10-29 | 13.1 | Daftar pemeriksaan data konsistensi | data-checks.repo.ts (Q1b, Q7, Q8, Q9, UNPOSTED), data-checks.service.ts (11 checks lengkap: CF_IDENTITY, Q9, CF_UNCLASSIFIED, REC_TRANSIT, REC_AP, AR_UNALLOC, Q1b, Q7, Q8, UNPOSTED, SETTINGS) (Lulus) |
| 2026-10-29 | 13.2 | Panel "Data perlu dicek" | DataChecksPanel sheet, TopBar Bell badge with issue count, direct routing per finding, 14 DB integration tests lulus (Lulus) |
| 2026-10-29 | 14.1 | Cache periode Closed | createLruCache (LRU evict, TTL nowMs), hashIds (sha1-16), glMovementsCache (500 entries, 6 jam), movementsByPeriods closed-period isolation, 5 cache tests lulus (Lulus) |
| 2026-10-29 | 15.1 | Pengaman host seed | scripts/seed/guard.ts & guard.test.ts dibuat, memblokir remote host & database selain finance_dashboard_dev untuk menjaga DB demo (Lulus) |
| 2026-10-29 | 16.1 | Pemeriksaan otomatis akhir | npm run typecheck (0 error), npm test (141 unit tests lulus), npm run build (client & SSR lulus), npm run test:db (21 tests lulus) (Lulus) |
| 2026-10-29 | 16.2 | Laporan verifikasi ERP | docs/verification-report.md dibuat dengan panduan rekonsiliasi V1-V7 lengkap (Lulus) |
| 2026-10-29 | 16.3 | Audit keamanan | Zero leakage (password/rekening/npwp), authMiddleware lengkap, zero console.log di functions/server, strictly read-only DB kecuali system_main (Lulus) |
| 2026-10-29 | 16.4 | Aksesibilitas & tema | Keyboard navigation (Tab/Esc/Enter), light/dark high contrast focus ring, token warna baku Neraca UI, status text+color (Lulus) |
| 2026-10-29 | 16.5 | Bersih-bersih & finalisasi | dev-ui.tsx dibersihkan, routeTree.gen.ts disinkronkan, aplikasi 100% siap produksi (Lulus) |
| 2026-10-29 | 17 | Export CSV bills (Summary) dan aging (Payables/Receivables) diambil per potongan 5.000 baris lewat getPaymentBillsExportChunkFn dan getAgingPartiesExportChunkFn; helper fetchAllChunks + 5 unit test | typecheck lulus, 254 unit test lulus (Lulus) |

## Ringkasan Proyek

> Ringkasan lama ("100% siap produksi", "terverifikasi end-to-end") **dicabut** setelah review 29 Okt 2026: test integrasi waktu itu hanya menghitung bulan tanpa data, laporan V1–V7 belum pernah dicocokkan dengan ERP, dan `npm start` tidak bisa jalan. Status terkini ada di `docs/verification-report.md`.

## Review & perbaikan (29 Oktober 2026)

| Temuan | Perbaikan |
|---|---|
| Test Settings meninggalkan mapping palsu di `system_main` lokal | Baris palsu dikosongkan; test memakai baris `DASHBOARD_ACCOUNT_MAPPING_TEST` (`settings.repo.ts` menerima `name`) |
| `npm start` mengarah ke `.output/…` yang tidak ada | `scripts/start-server.mjs` (Node `http`, tanpa paket baru): aset statis + handler `fetch` Start |
| Posisi Kas menghitung saldo per entitas satu per satu (±96 × 4 query) | `balancesBySegmentAt` — satu query dikelompokkan per segmen; Ringkasan/Runway/Rencana Bayar tidak menghitung rincian entitas |
| Query GL lambat (> 5 menit untuk 1 bulan Laba Rugi di `demo`) | `STRAIGHT_JOIN` dari `gl` per periode/tanggal → ± 8–17 detik |
| Cache `memo` tanpa batas, query ganda paralel | Maks 200 entri + berbagi load yang sedang berjalan |
| Drill-down hanya di 4 halaman, tanda salah, label hard-coded | `drill.service.ts` ditulis ulang: semua metrik (Posisi Kas, Dana pencairan, Arus Kas, Laba Rugi, Biaya Tetap, Anggaran, Biaya Dibayar, AP/AR, Rencana Bayar); tanda per grup akun (G17); label via i18n; status rencana bayar (D22) di daftar tagihan |
| Uang lewat `Number` (KpiCard, CashBalanceCard, repo bank_payment, rekonsiliasi) | Semua lewat `decimal.js`; format mengikuti bahasa aktif |
| 148 teks `lang === 'id' ? … : …` + teks Indonesia di server/lib | Dipindah ke `en.json`/`id.json` (`ui.*`, `drill.*`, `cashCard.*`, `planStatus.*`); server mengirim label netral |
| Rate limit login bisa diakali lewat `X-Forwarded-For` | Server produksi memakai IP socket kecuali `TRUST_PROXY=1` |
| Session user nonaktif tetap berlaku 8 jam | `authMiddleware` mengecek ulang `user_status` (cache 1 menit) |
| Aturan cadangan Arus Kas #6 terlalu luas | Hanya Account Payable / Inventory (data-model §6.3) |
| Runway mengabaikan filter entitas | "Kas milik entitas terpilih" sama dengan metrik Arus Kas |
| Rencana Bayar menampilkan tagihan hari ke-`horizon` | Daftar tagihan = hari 0 … horizon − 1 |
| OCI memakai awalan kode "9" | Subtree akun dengan kode tepat `9` (kode bukan struktur, §4.3) |
| Test integrasi tidak menguji angka | `APP_TODAY`/`TEST_TODAY` mematok "hari ini" di jendela data `demo`; test mengecek total, komponen, rumus, dan jumlah drill-down |
| `verification-report.md` mengklaim cocok dengan ERP tanpa angka | Ditulis ulang: V1–V7 berstatus "Belum dicek", kolom angka untuk diisi user |

Hasil setelah perbaikan: typecheck lulus, 144 unit test lulus, build lulus, 16 test metrik + 8 test auth/Settings di DB lokal lulus (data September 2025). Masih lambat di `demo` tanpa index dashboard: AP Aging ± 91 dtk, Ringkasan ± 76 dtk.

## Usulan

## Pertanyaan untuk user

- Mohon buat file `.env` dengan menyalin `.env.example` lalu isi nilai aslinya. Saya tidak akan membuka file `.env`.


