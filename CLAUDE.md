# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Oxy Finance Dashboard** — a TanStack Start (SSR) app that reads a client's **ERP MySQL database directly** (server functions + Drizzle) and shows consolidated finance metrics (Summary, Revenue, Cash Position, Cash Flow, P&L, AP/AR aging, Payment Plan, Budget). Login uses the ERP's own `sysuser` accounts.

Source-of-truth documents (Indonesian), read the relevant part before touching finance logic:

- `docs/decisions.md` — numbered decisions (D#, F#, S#, U#, T#, open items O#)
- `docs/data-model.md` — ERP tables, formulas per metric (§x.y), data-quality findings
- `plans/README.md` — golden rules G1–G38 (§2), conventions (§5), open-item defaults (§7, §9 "K#")
- `docs/progress.md` — work log; append a line when finishing a planned step
- `docs/project-guide.md` — the single complete guide for the finance team and the product owner: accounting basics, glossary, every ERP and `dash_*` table, every query (SQL), every formula, every page, caching and operations, the "why do the numbers differ from the ERP" FAQ, and the central confirmation table (`KF-nn`). It replaces the old Summary and Revenue page documents. Kept in sync with the code (see Conventions)
- `docs/design/neraca-ui/` — "Neraca UI" design system (tokens, components, brand rules)

If code seems to contradict `decisions.md`/`data-model.md`, those documents win. When the meaning of ERP data (status codes, transaction types, accounts) is not written down there or in `schema/columns.csv`, stop and ask the user — do not guess.

## Commands

```bash
npm run dev            # Vite dev server on http://localhost:3000
npm run build          # client + SSR build into dist/
npm start              # production server (scripts/start-server.mjs, serves dist/)
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint (also enforces the layering: no server/DB imports in routes, components, lib; no console in src/server)
npm run lint:fix
npx prettier --write <files>   # Prettier (setup matches the code style; the old code is NOT reformatted, only format files you change)
npm test               # unit tests (Vitest project "unit": src/**/*.test.ts, scripts/**/*.test.ts)
npm run test:db        # integration tests against the LOCAL DB (tests/integration/**/*.int.test.ts)
```

Single test file / single test:

```bash
npx vitest run --project unit src/lib/finance/pnl/pnl.test.ts
npx vitest run --project unit -t "ignores cards with in_out = 0"
```

Dashboard-owned tables (`dash_*`) and snapshots:

```bash
npm run db:dash:generate   # write a new migration into drizzle-dash/ from src/server/dash/schema.ts (no DB access)
npm run db:dash:check
npm run db:dash:status     # pending dash_* migrations
npm run db:dash:migrate    # apply them (or AUTO_MIGRATE=1 at server start)
npm run dash:refresh       # rebuild the AP/AR snapshot now
npm run dash:refresh-gl    # build the monthly GL snapshot for Closed periods
npm run dash:refresh-hist  # build the month-end AP/AR history (past asOf dates; --max N limits the months)
```

`npm run seed` points at `scripts/seed/index.ts`, which does not exist yet (only the host guard in `scripts/seed/guard.ts` is implemented).

## Permission rules (from plans/README.md §1.1 and user preferences)

Ask the user in chat and wait for a clear yes before:

- installing/removing packages or scaffolding (`npm install`, `npx shadcn …`); versions are pinned exactly — never `--force`/`--legacy-peer-deps`;
- **running anything against a database**, including a plain `SELECT`, `npm run test:db`, `db:dash:migrate`, `dash:refresh*`, `drizzle-kit pull`, seed scripts;
- commits/pushes.

Never run `docs/sql/dashboard-indexes.sql` (the user runs it manually). Never read or print `.env` or `.dbclient.cnf` (checking that they exist is fine). For non-trivial work, write a plan first and get a go before implementing.

## Architecture

Request flow, strictly layered (G7 + plans §3 placement rule; where every kind of file goes: `docs/project-structure.md`):

```
src/routes/**            file-based routes; loader → queryClient.ensureQueryData(xxxOptions(deps))
  └ src/queries/**       TanStack Query queryOptions; keys in queries/keys.ts (qk)
     └ src/functions/**  createServerFn: authMiddleware → zod validator → resolveFilter → service
        └ src/server/services/**   compose repos + pure logic; return plain serializable objects
           ├ src/server/repo/**     the ONLY place SQL is written; returns raw rows (strings)
           └ src/lib/**             pure logic (no DB, no React, no src/server imports) — unit tested
```

`src/lib/` layout: `core/` (types, money, compare, i18n labels — depends on nothing), `finance/{coa,period,journal,pnl,cash,ap-ar,entity,checks}/` (metric logic per domain), plus `format/` (number, date, CSV, KPI and donut helpers), `filters/` (URL search schema and filter scope), `table/`, `settings/`. Dependencies point toward `core/`; `format/` and `table/` do not import `finance/`.

- Routes/components never import Drizzle, `mysql2`, or `src/server/**`. Server modules start with `import '@tanstack/react-start/server-only'`; Vitest aliases it to `tests/empty-module.ts`, so they stay unit-testable. Exceptions without the marker are pure helpers that scripts or drizzle-kit also load (`db/in-list|chunk|segment-column|erp-codes|bigint-string`, `dash/schema|tables`, `auth/rate-limit`, `log`, `dash/log`). Auth helpers live in `src/server/auth/`; services sit in one folder per big domain (`services/ap-ar/`, `services/cash/`, `services/pnl/`, `services/drill/`) with the small ones at the services root; helpers shared by several domains (not called from `functions/`) live in `src/server/services/shared/`.
- Repos are SQL-only, with one allowed exception: they may use `~/server/cache` (`memo`) for shared ERP reads. They do not read `env` or compute "today"; the service passes dates in. Repos sit in one folder per big domain (`repo/ap-ar/`, `repo/cash/`, `repo/gl/`, `repo/master-data/`, `repo/pnl/`) and the small ones stay at the repo root (`auth`, `settings`, `data-checks`). Row types shared with `dash/` live in `repo/ap-ar/types.ts`; AP/AR repos are split by topic (`aging`, `expense-paid`, `party`, `payment-plan`).
- `authMiddleware` (`src/functions/middleware.ts`) is required on every server function except login/logout/getCurrentUser/prefs. It re-checks `sysuser.user_status` (cached 1 min) and starts the snapshot scheduler as a safety net (it normally starts at server boot from `src/server-entry.ts`). Server functions follow the same domain folders as the services (`src/functions/ap-ar/`, `cash/`, `pnl/`); the other `*.fn.ts` files sit at the `functions/` root.
- Global filters live in the URL: `src/lib/filters/search-schema.ts` (`entity`, `preset`, `from`/`to`, `p13`, `drill`, …). `src/server/context.ts#resolveFilter` turns them into a `ResolvedFilter` (location ids, segment-detail ids, date range, period ids, comparison period, "today"). Entity tokens in the URL are location **ids**.
- "Today" = `APP_TODAY` if set, else today in `APP_TIMEZONE`. Integration tests pin it (`TEST_TODAY`, default `2025-10-15`) to fit the local `demo` data.
- Server functions return money as strings, dates as `YYYY-MM-DD`; never `Decimal`, `Date`, `Map`, `Set`, `bigint`. Labels are sent as neutral keys and translated on the client.
- Drill-down is a side sheet whose state is in the `drill` search param; `src/server/services/drill/*` builds rows for every metric down to journal lines.
- `src/server/cache.ts`: `memo`/`memoMetric` (bounded, shares in-flight loads; `memoMetric` is stale-while-revalidate (`METRIC_FRESH_SECONDS` / `METRIC_STALE_SECONDS`)) and an LRU for GL movements of Closed periods.

### Snapshot tables (`dash_*`)

The ERP tables are read-only. Heavy numbers are precomputed into the dashboard's own `dash_*` tables in the same database (`src/server/dash/`, migrations in `drizzle-dash/`, config `drizzle.dash.config.ts`, migration table `dash_migrations`):

- AP/AR open-invoice and unallocated snapshot (`dash_snap_ap_ar_open` and `dash_snap_ap_ar_unallocated`), rebuilt every `DASH_REFRESH_MINUTES` by `scheduler.ts` inside the server process (skipped when the ERP fingerprint is unchanged; atomic shadow-table swap; `dash_snap_meta` holds status shown as "Data as of …" in the sidebar). `dash_snap_ap_ar_unallocated` holds AP payments without allocation and AR direct returns (told apart by `module_type`); rows with `kind = 'ignored'` (AR customer payments without allocation) are never counted; every reader filters `kind = 'counted'`. The rebuild reads `ap_ar_card` with `FORCE INDEX (PRIMARY)` and sums settlements from two plain scans joined in Node (`loadSettlementSums`), because the optimizer's join and index choices took minutes on millions of cards. An AR direct return is listed with its remaining balance (allocations that name it as `invoice_id` are subtracted; a fully used return is left out).
- `dash_snap_gl_monthly` — monthly GL movements for Closed periods, each period tied to a fingerprint (`period_key`, `stats_key`); the refresh rebuilds a period whose fingerprint changed (an admin can re-open and re-close a period), and the cache key of closed-period movements carries the build version. `gl.repo.ts` reads it for periods it contains and falls back to the live ERP query otherwise.
- `dash_snap_cash_lines` / `dash_snap_cash_periods` — lines of every posted journal that touches a cash account, for Closed periods, built by `cash-lines-build.ts` with the same fingerprint rules as the GL snapshot (both steps run on one engine, `closed-period-refresh.ts`, and share the journal counts they compare for 60 seconds); `cashflow.repo.ts` reads closed periods from it when the cash account list (`cash_hash`) and the entity segment column match, and falls back to the live ERP query otherwise.
- `dash_snap_ap_ar_hist_*` hold the AP/AR state at the end of each of the last `DASH_AP_AR_HIST_MONTHS` (default 13) completed months, built by `hist-ap-ar.ts` (one month per scheduler run; the two newest months are rebuilt daily until final). Each month carries `formula_version` (`AP_AR_FORMULA_VERSION` in `ap-ar-hist-plan.ts`); a month built with an older version is rebuilt even when final. `apar.repo.ts` reads today's snapshot first, then the month-end history when `asOf` is exactly a built month-end, then the slow live ERP query. Any other past `asOf` still uses the live query.
- Payment Plan AP: open AP items below zero (credits) reduce the open bills of the same vendor and entity earliest due first (`payment-plan-credits.ts`); credit rows are shown as negative rows in the bills table.
- Payment Plan receipts: customer credits (AR direct returns and negative AR items) reduce the projected receipts of the same customer and entity, earliest due date first, only invoices due inside the horizon.
- Aging (AP/AR) and the Payment Plan summary are summed in SQL from `dash_snap_ap_ar_*` and `dash_snap_ap_ar_hist_*` (`src/server/dash/snapshot-aggregate.ts`, bucket ranges from `AGING_BUCKET_DAYS`); the bills table and the drill-down still load the invoice list. Reads of a whole side of `dash_snap_ap_ar_open` with no location or invoice filter carry `FORCE INDEX (PRIMARY)` (`src/server/dash/scan-hint.ts`) because the optimizer otherwise fetches every row through a non-covering secondary index.
- Manual refresh (decision U8): the "Refresh now" button in the sidebar's "Data as of" card calls `startSnapshotRefresh` (`snapshot.service.ts`), which starts `runRefreshCycle` (`src/server/dash/refresh-cycle.ts`, the same cycle `scheduler.ts` runs) with `force: true` and answers at once; the browser polls `getSnapshotInfoFn` (`job` = state of the cycle in this server process, `canRefresh`). A manual run logs which step it is in and a one-line summary with the time of every step (`step-timer.ts`; the AP/AR rebuild adds its own scans), so a long wait can be traced in the server log. A shared cooldown of 2 minutes (from `dash_snap_meta.refreshed_at`, constant `MANUAL_REFRESH_COOLDOWN_MS`) and the advisory locks stop repeated presses. New files in `src/server/dash/` must not contain write-statement phrases (even in comments) that `guard.test.ts` would read as a write to a non-`dash_` table.
- Snapshot building runs on its own connection pool (`src/server/db/refresh-pool.ts`, `DASH_POOL_SIZE`), separate from the pool user requests use; `pool-usage.test.ts` fails when a dash module takes a connection from the shared pool.
- `src/server/dash/guard.test.ts` fails if any migration or dash code writes to a non-`dash_` table. The only other allowed write is INSERT/UPDATE of the `DASHBOARD_ACCOUNT_MAPPING` row in `system_main` (Settings › Account mapping). Never run `drizzle-kit push`, and never generate/migrate against ERP tables (`drizzle.config.ts` is only for `pull` from a local DB).

## Non-negotiable rules (summary of plans/README.md §2)

SQL / DB

- Must run on **MySQL 5.7.44**: no CTE (`WITH`), window functions (`OVER`, `ROW_NUMBER`, `LAG`…), `LATERAL`, `REGEXP_REPLACE/SUBSTR`. The local `demo` DB is MariaDB 10.4 and accepts them, so local success proves nothing. `src/server/repo/sql-guard.test.ts` statically scans all repo files, sub folders included.
- Full `GROUP BY` (`ONLY_FULL_GROUP_BY`); upsert with `ON DUPLICATE KEY UPDATE col = VALUES(col)` (no `AS new`); Drizzle core builder or the `sql` template tag only (no relational `db.query`); aggregate in SQL.
- Always parameterized. Repo functions taking id lists return `[]` early on an empty list (use `inList`). Column aliases are camelCase via `AS`.
- GL table per period comes from `periode.table_name` (`gl` or archive `gl_20xx`); validate via `src/server/db/gl-tables.ts` and insert with `sql.identifier`. Some queries use `STRAIGHT_JOIN` from `gl` for performance — keep it.

Numbers & dates

- All IDs are strings (never `Number(id)`); all money is a string computed with `decimal.js` (`src/lib/core/money.ts`) — no `+ - * /`, `Number()`, `parseFloat()` on money; round only when displaying.
- Monthly figures use `gl.period_id`; daily/date ranges use `gl.trans_date`.

Accounting

- Count journals only when `posted_status = 1` (reversals included). Add `AND canceled_date IS NULL` only when the GL header table has that column (`notCanceledClause` in `src/server/db/gl-columns.ts`; some ERP versions have no such column).
- Sign comes from the `account_group` side (`src/lib/finance/coa/sign.ts`), not `coa.saldo_normal`.
- Entity = `pos_location`; journals map via the entity segment column (`segment.count = 1`) → `segment_detail.location_id`. Consolidation is a plain sum, no intercompany elimination. No department dimension.
- AP/AR outstanding only from `ap_ar_card` + `ap_ar_card_detail` (never `payment_status`, never add `bankpo_payment_detail`); ignore `in_out = 0`. `coa_budget.bgt_month` is 0-based.
- Account baskets (cash, bank, deposit, in-transit, fixed cost) come from Settings in `system_main`, never hard-coded codes. `acc_link` is not used for cash accounts.

Security / sensitive data

- `sysuser.password` is selected in exactly one login function, compared with `timingSafeEqual`, never logged/returned/cached. Select columns explicitly.
- From `vendor`/`customer` select only id, `code`, `name` — never bank account/NPWP/ID columns. Do not write account numbers, loan numbers, shareholder or client company names anywhere (code, tests, logs, docs, commits).

UI

- Neraca UI tokens/classes only (`src/styles/tokens.css`, `neraca.css`, `nr-*` components in `src/components/ui/`, `charts/` and `layout/`); no hex colors in components, one `forest` card per screen, `lime` only as fill, no gradients/emoji. Cards show abbreviated figures + full-value tooltip; tables show full numbers, right-aligned, `tabular-nums`. Negative amounts are written in parentheses everywhere (cards, chart axes, tables), never with a minus sign (accounting style). `src/components/ui/shadcn/` is shadcn-generated (`components.json` makes `npx shadcn add` write there); do not edit those files by hand. `src/components/ui/` itself holds the project's own domain-free base components (buttons, notices, KPI card, data table, ...); ESLint forbids it from importing pages, layout, charts or finance logic.
- Every UI string goes through i18n (`src/i18n/locales/en.json` default + `id.json`); `src/i18n/keys.test.ts` requires identical keys in both. Use finance terms in labels, not table names.

Language

- Everything in code is English: routes, file names, identifiers, SQL aliases, comments, error messages, logs, test names. Indonesian appears only in `id.json` and `docs/`. ERP table/column names stay as-is.

## Conventions

- Server logs go through `createLogger` / `errorText` in `src/server/log.ts` (`dashLog` for the snapshot code), not `console.*`.
- Import alias `~/` → `src/`. Files `kebab-case.ts` (hooks `use-*.ts`), components `PascalCase.tsx`, tests next to the file (`*.test.ts`); integration tests in `tests/integration/*.int.test.ts` with fixtures in `tests/fixtures/`.
- TypeScript strict + `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` (remove dead imports and props instead of leaving them); no `any` (use `unknown` + zod). Core types in `src/lib/core/types.ts` (`Id`, `Money`, `IsoDate`, `ResolvedFilter`, …).
- **Prettier on changed files is expected, `.md` files and this one included.** It re-pads tables and turns `*text*` into `_text_`; that diff noise is accepted. Do not put backticks inside inline code (a template-literal tag written between backticks): Prettier strips the spaces around it and garbles the sentence. Say it in words instead (the `sql` template tag).
- `src/routeTree.gen.ts` is generated by the router plugin — do not edit by hand.
- **`docs/project-guide.md` stays in sync with the code, in the same change.** Whenever a change touches data, a query, a table (an ERP table the dashboard starts reading, or any new/changed `dash_*` table and its migration), a formula, a page (cards, charts, tables, drill-down, filters, labels), a term, an env variable or an npm script, update the matching part of `docs/project-guide.md`: the explanation, the SQL copied from the code (with its file), the worked example, and the confidence marker (✅ checked against code, 🔵 checked against the local DB, 🟣 matched to an ERP report, ⚠️ assumption). Also add a row to its change log (chapter 14), update the "Terakhir diperbarui" date, and add, answer or re-status the questions for finance in the central table (chapter 12, codes `KF-nn`, never reused). A change in one place that moves a number elsewhere (for example a revenue formula also used by Summary, the Composition donut, or Budget) must update every affected section. Do not leave the guide for later. Do not recreate per-page documents; the guide is the only place for these explanations. Decisions still go to `docs/decisions.md` and column-level table detail to `docs/data-model.md`; if they disagree with the guide, they win and the guide is corrected.
- Several packages are on new majors (TanStack Table 9, Zod 4, Recharts 3, Vite 8, Vitest 5, lucide-react 1, i18next 26) and TypeScript is pinned at 5.9.3: check current docs rather than relying on older APIs.
