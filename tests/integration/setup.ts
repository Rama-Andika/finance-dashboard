import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath)
  }
}

// Metrics are computed relative to "today". The local demo DB holds journals up to mid-October 2025, so
// integration tests pin today inside that window (override with TEST_TODAY=YYYY-MM-DD).
process.env.APP_TODAY = process.env.TEST_TODAY ?? '2025-10-15'

// The pinned "today" (2025) is before the snapshot, so the AP/AR aging tests run the slow live ERP query (minutes).
// The per-statement limit meant for the web app would cut it off.
process.env.DB_QUERY_TIMEOUT_MS = '0'

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}

const dbUrl = process.env.DATABASE_URL
if (dbUrl) {
  try {
    const parsed = new URL(dbUrl)
    const hostname = parsed.hostname.toLowerCase()
    const allowedHosts = ['localhost', '127.0.0.1', '::1']
    if (!allowedHosts.includes(hostname)) {
      throw new Error('Integration tests may only run against a local database')
    }
  } catch (err: any) {
    if (err.message === 'Integration tests may only run against a local database') {
      throw err
    }
    // URL parsing might fail if not full protocol, check simple regex
    if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('::1')) {
      throw new Error('Integration tests may only run against a local database')
    }
  }
}
