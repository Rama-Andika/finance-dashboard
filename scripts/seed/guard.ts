export function validateSeedTarget(dbUrl: string): { ok: boolean; error?: string } {
  if (!dbUrl) {
    return { ok: false, error: 'TEST_DATABASE_URL is required' }
  }

  try {
    // Handle mysql://user:pass@host:port/dbname
    const parsed = new URL(dbUrl.startsWith('mysql://') ? dbUrl : `mysql://${dbUrl}`)
    const host = parsed.hostname.toLowerCase()

    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    if (!isLocalhost) {
      return { ok: false, error: 'Seed may only run against a local database' }
    }

    const dbName = parsed.pathname.replace(/^\//, '').split('?')[0]
    if (dbName !== 'finance_dashboard_dev') {
      return {
        ok: false,
        error: `Seed target database must be 'finance_dashboard_dev' (got '${dbName}'). Aborting to protect existing databases like 'demo'.`,
      }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: `Invalid database URL: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export function assertSeedTarget(dbUrl?: string): void {
  const targetUrl = dbUrl || process.env.TEST_DATABASE_URL || ''
  const result = validateSeedTarget(targetUrl)
  if (!result.ok) {
    console.error(`[SEED GUARD ERROR] ${result.error}`)
    process.exit(1)
  }
}
