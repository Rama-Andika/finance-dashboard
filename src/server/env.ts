import '@tanstack/react-start/server-only'
import { z } from 'zod'

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* no .env file: let the validation below fail */
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith('mysql://'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(10).default(5),
  // Upper bound for one SELECT, in milliseconds (0 = no limit). A runaway report must not hold a pooled connection forever.
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(0).max(3_600_000).default(120_000),
  SESSION_SECRET: z.string().min(32),
  APP_TIMEZONE: z.string().default('Asia/Jakarta'),
  // Optional fixed "today" (YYYY-MM-DD) for tests and ERP reconciliation against historical data.
  APP_TODAY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  // Snapshot tables (dash_*): a background job copies the heavy AP/AR numbers into small tables.
  DASH_REFRESH_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).default('1')),
  DASH_REFRESH_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  // How many completed month-ends of AP/AR history to keep (0 = none; the history tables are emptied).
  DASH_AP_AR_HIST_MONTHS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(36).default(13),
  ),
  // Connections reserved for the background refresh (snapshot building), separate from DB_POOL_SIZE so a long refresh query never takes a connection a user request needs.
  DASH_POOL_SIZE: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(5).default(2)),
  // 1 = apply pending dash_* migrations when the server starts (off by default in production)
  AUTO_MIGRATE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).default('0')),
  // Cash Position flags funds in settlement whose oldest transaction is older than this many days.
  // Raise it for a client that releases settlements late (the usual delay is the right order of magnitude).
  IN_TRANSIT_ALERT_DAYS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(120).default(3),
  ),
  // Measuring: a query slower than this many ms is logged as a warning, with its SQL text but never its parameters (0 = off).
  SLOW_QUERY_MS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(3_600_000).default(1000),
  ),
  // 1 = log the duration of every computed metric (cache hits are not logged) and pool waits. Off by default.
  PERF_LOG: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).default('0')),
  // Computed metrics stay "fresh" this many seconds; after that the old answer is still served for METRIC_STALE_SECONDS
  // while one recalculation runs in the background (0 = never serve an old answer). cache.ts reads both straight from process.env.
  METRIC_FRESH_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(5).max(3600).default(60),
  ),
  METRIC_STALE_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(86_400).default(180),
  ),
  ERP_APP_ID_INDEX: z.coerce.number().int().min(0).max(99).default(7),
  NODE_ENV: z.string().default('development'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Report only the NAMES of invalid variables, never their values.
  throw new Error(`Invalid environment variables: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
}

export const env = parsed.data
