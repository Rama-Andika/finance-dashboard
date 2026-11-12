// Every name that may appear in an environment file. A name the code starts to read must be added here:
// scripts/lib/env-keys.test.mjs compares this list with src/server/env.ts and with every process.env.NAME in src/.

/** The keys of the schema in src/server/env.ts. */
export const SERVER_KEYS = [
  'APP_ENV',
  'NODE_ENV',
  'CLIENT_ID',
  'DATABASE_URL',
  'SESSION_SECRET',
  'APP_TIMEZONE',
  'APP_TODAY',
  'DB_POOL_SIZE',
  'DB_QUERY_TIMEOUT_MS',
  'SLOW_QUERY_MS',
  'LOG_LEVEL',
  'LOG_TO_FILE',
  'LOG_DIR',
  'LOG_RETENTION_DAYS',
  'METRIC_FRESH_SECONDS',
  'METRIC_STALE_SECONDS',
  'IN_TRANSIT_ALERT_DAYS',
  'ERP_APP_ID_INDEX',
  'DASH_REFRESH_ENABLED',
  'DASH_REFRESH_MINUTES',
  'DASH_AP_AR_HIST_MONTHS',
  'DASH_POOL_SIZE',
  'AUTO_MIGRATE',
]

/** Read outside the schema: scripts/start-server.mjs (PORT, HOST, TRUST_PROXY), the migration folder, the process time zone. */
export const RUNTIME_KEYS = ['PORT', 'HOST', 'TRUST_PROXY', 'DASH_MIGRATIONS_DIR', 'TZ']

/** Only for integration tests and the seed on a developer's computer. Refused in a staging or production file. */
export const DEV_ONLY_KEYS = [
  'TEST_DATABASE_URL',
  'TEST_TODAY',
  'SEED_DEMO_LOGIN_ID',
  'SEED_DEMO_PASSWORD',
  'MYSQL57_URL',
  'PERF_PROBE',
]

/** Set by the program itself; never written in an environment file. */
export const INTERNAL_KEYS = ['APP_VERSION', 'VITEST']

/**
 * The keys an environment file of this environment may contain.
 * @param {string} mode development, staging or production
 */
export function knownKeysFor(mode) {
  return mode === 'development'
    ? [...SERVER_KEYS, ...RUNTIME_KEYS, ...DEV_ONLY_KEYS]
    : [...SERVER_KEYS, ...RUNTIME_KEYS]
}
