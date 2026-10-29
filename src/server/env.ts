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
  SESSION_SECRET: z.string().min(32),
  APP_TIMEZONE: z.string().default('Asia/Jakarta'),
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
