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
  // 1 = apply pending dash_* migrations when the server starts (off by default in production)
  AUTO_MIGRATE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).default('0')),
  PNL_OCI_ROOT_CODES: z.string().default('9'),
  ERP_APP_ID_INDEX: z.coerce.number().int().min(0).max(99).default(7),
  NODE_ENV: z.string().default('development'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  // Report only the NAMES of invalid variables, never their values.
  throw new Error(`Invalid environment variables: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
}

export const env = {
  ...parsed.data,
  ociRootCodes: parsed.data.PNL_OCI_ROOT_CODES.split(',').map((s) => s.trim()).filter(Boolean),
}
