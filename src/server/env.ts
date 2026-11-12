import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { APP_ENVS, envRuleViolations } from '~/lib/core/app-env'
import { CLIENT_ID_PATTERN } from '~/lib/core/client-base'
import { METRIC_FRESH_SETTING, METRIC_STALE_SETTING } from '~/server/metric-settings'

// This file only READS process.env; it never opens an env file. On a developer's computer scripts/local.mjs loads
// env/development.env into the process before anything starts, and on a server systemd loads the environment file of
// the deployment. Either way the settings are already in process.env when this file runs.

export const envSchema = z.object({
  // The environment this process runs in. No default on purpose: a process started without it must fail here instead of
  // quietly running as something else (in particular not as production).
  APP_ENV: z.enum(APP_ENVS),
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
  // Logging. src/server/log.ts reads these straight from process.env (this file only checks their shape).
  // LOG_LEVEL=debug also logs the duration of every computed metric (cache hits are not logged) and every pool wait.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  ),
  // 1 = also write the log lines to the daily file in LOG_DIR (src/server/logging/file-destination.ts)
  LOG_TO_FILE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).default('1')),
  LOG_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('logs')),
  // Daily log files older than this many days are removed
  LOG_RETENTION_DAYS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(3650).default(30),
  ),
  // Name of this deployment, written on every log line as "client": lowercase letters, digits and dashes.
  // The URL prefix /oxy-<CLIENT_ID>-finance-dashboard/ is fixed at BUILD time from the same value (vite.config.ts),
  // so the build and the running server must use the same CLIENT_ID.
  CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(CLIENT_ID_PATTERN).optional()),
  // Computed metrics stay "fresh" this many seconds; after that the old answer is still served for METRIC_STALE_SECONDS
  // while one recalculation runs in the background (0 = never serve an old answer). cache.ts reads both straight from process.env.
  METRIC_FRESH_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce
      .number()
      .int()
      .min(METRIC_FRESH_SETTING.min)
      .max(METRIC_FRESH_SETTING.max)
      .default(METRIC_FRESH_SETTING.fallback),
  ),
  METRIC_STALE_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce
      .number()
      .int()
      .min(METRIC_STALE_SETTING.min)
      .max(METRIC_STALE_SETTING.max)
      .default(METRIC_STALE_SETTING.fallback),
  ),
  ERP_APP_ID_INDEX: z.coerce.number().int().min(0).max(99).default(7),
  NODE_ENV: z.string().default('development'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Report only the NAMES of invalid variables, never their values.
  const names = parsed.error.issues.map((i) => i.path.join('.'))
  const hint = names.includes('APP_ENV') ? ' (APP_ENV must be one of: development, staging, production)' : ''
  throw new Error(`Invalid environment variables: ${names.join(', ')}${hint}`)
}

// The rules of the environment (src/lib/core/app-env.ts). A message names a variable and never its value.
const violations = envRuleViolations({
  appEnv: parsed.data.APP_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  appToday: parsed.data.APP_TODAY,
  logLevel: parsed.data.LOG_LEVEL,
})
if (violations.length > 0) {
  throw new Error(`The settings break the rules of APP_ENV=${parsed.data.APP_ENV}: ${violations.join('; ')}`)
}

export const env = parsed.data
